import { describe, expect, it } from 'vitest';
import {
  getVisitorContext,
  parseConditions,
  selectDestination,
  type TargetingRule,
} from '../../src/lib/server/targeting';

const userAgents = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipados:
    'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  ambiguous:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/605.1.15',
};

function request(headers: HeadersInit = {}) {
  return new Request('https://go.example.org/guide?country=JP&preview=1', {
    headers,
  });
}

describe('visitor targeting context', () => {
  it.each([
    [userAgents.ios, 'ios', 'mobile'],
    [userAgents.ipados, 'ipados', 'tablet'],
    [userAgents.android, 'android', 'mobile'],
    [userAgents.androidTablet, 'android', 'tablet'],
    [userAgents.windows, 'windows', 'desktop'],
    [userAgents.macos, 'macos', 'desktop'],
    [userAgents.linux, 'linux', 'desktop'],
    [userAgents.ambiguous, 'other', 'other'],
    ['Mozilla/5.0 (Windows NT 10.0; Android 10)', 'other', 'other'],
    ['some unknown client', 'other', 'other'],
  ])('classifies well-known device UAs conservatively', (ua, os, device) => {
    expect(getVisitorContext(request({ 'user-agent': ua }))).toMatchObject({
      os,
      device,
    });
  });

  it('uses only trusted CF metadata and qualifies regions with country', () => {
    const spoofed = request({ 'cf-ipcountry': 'JP', 'x-region': 'Tokyo' });
    expect(getVisitorContext(spoofed)).toMatchObject({
      country: 'unknown',
      region: 'unknown',
    });
    expect(
      getVisitorContext(spoofed, { country: 'jp', regionCode: '13' }),
    ).toMatchObject({
      country: 'JP',
      region: 'JP-13',
    });
    expect(
      getVisitorContext(spoofed, { country: 'US', regionCode: 'JP-13' }),
    ).toMatchObject({
      country: 'US',
      region: 'unknown',
    });
    expect(
      getVisitorContext(spoofed, { country: 'ZZ', regionCode: '13' }),
    ).toMatchObject({
      country: 'unknown',
      region: 'unknown',
    });
  });

  it.each([
    ['it;q=0.1, EN-gb;q=0.9, JA;q=0.5', 'en-GB'],
    ['es-MX, zh-Hant;q=1', 'es-MX'],
    ['*;q=1, it-IT;q=0.75', 'it-IT'],
    ['*', 'unknown'],
    ['en_US, es;q=0, en;q=2, fr;q=0.1234, ja;q=0.3', 'ja'],
    ['en;q=0, en;q=1, ja;q=0.7', 'ja'],
    ['a'.repeat(3000), 'unknown'],
  ])(
    'uses the highest-ranked valid explicit BCP 47 preference',
    (header, language) => {
      expect(
        getVisitorContext(request({ 'accept-language': header })).language,
      ).toBe(language);
    },
  );

  it('distinguishes preview and bot traffic without trusting query parameters', () => {
    expect(
      getVisitorContext(request({ 'user-agent': 'Slackbot-LinkExpanding 1.0' }))
        .trafficKind,
    ).toBe('preview');
    expect(
      getVisitorContext(request({ 'user-agent': 'Googlebot' })).trafficKind,
    ).toBe('bot');
    expect(
      getVisitorContext(request({ 'user-agent': userAgents.ios })).trafficKind,
    ).toBe('human');
    expect(getVisitorContext(request()).trafficKind).toBe('unknown');
  });
});

describe('redirect rules', () => {
  const link = { destinationUrl: 'https://www.example.org/default?q=1#anchor' };
  const visitor = getVisitorContext(
    request({ 'user-agent': userAgents.ios, 'accept-language': 'en-GB' }),
    {
      country: 'JP',
      regionCode: '13',
    },
  );
  const base: TargetingRule = {
    id: 'rule-default',
    priority: 10,
    isActive: 1,
    conditionsJson: null,
    ruleType: 'os',
    operator: 'eq',
    ruleValue: 'ios',
    destinationUrl: 'https://www.example.org/legacy',
  };

  it('validates and canonicalizes conditions without supporting wildcard, groups or unknown codes', () => {
    expect(
      parseConditions([
        { type: 'country', operator: 'eq', value: 'jp' },
        { type: 'region', operator: 'eq', value: 'jp-13' },
        { type: 'language', operator: 'eq', value: 'EN-gb' },
      ]),
    ).toEqual([
      { type: 'country', operator: 'eq', value: 'JP' },
      { type: 'region', operator: 'eq', value: 'JP-13' },
      { type: 'language', operator: 'eq', value: 'en-GB' },
    ]);
    for (const invalid of [
      [],
      [{}],
      { or: [{ type: 'os', operator: 'eq', value: 'ios' }] },
      [{ type: 'country', operator: 'eq', value: 'unknown' }],
      [{ type: 'country', operator: 'eq', value: 'AA' }],
      [{ type: 'region', operator: 'eq', value: '東京' }],
      [{ type: 'device', operator: 'base_language', value: 'desktop' }],
      [{ type: 'language', operator: 'base_language', value: 'en-GB' }],
      [{ type: 'language', operator: 'eq', value: '*' }],
      Array.from({ length: 6 }, () => ({
        type: 'os',
        operator: 'eq',
        value: 'ios',
      })),
    ]) {
      expect(parseConditions(invalid)).toBeNull();
    }
  });

  it('requires all rule conditions and selects the lowest priority then lowest id', () => {
    const rules = [
      { ...base, id: 'z-old', priority: 3 },
      {
        ...base,
        id: 'a-first',
        priority: 3,
        conditionsJson: JSON.stringify([
          { type: 'os', operator: 'eq', value: 'ios' },
          { type: 'region', operator: 'eq', value: 'JP-13' },
          { type: 'language', operator: 'base_language', value: 'en' },
        ]),
        destinationUrl: 'https://www.example.org/first',
      },
      {
        ...base,
        id: 'nonmatch',
        priority: 1,
        conditionsJson: JSON.stringify([
          { type: 'region', operator: 'eq', value: 'JP-13' },
          { type: 'language', operator: 'eq', value: 'en-US' },
        ]),
      },
      { ...base, id: 'inactive', priority: 0, isActive: 0 },
    ];
    const result = selectDestination(link, rules, visitor);
    expect(result?.matchedRuleId).toBe('a-first');
    expect(result?.url.href).toBe('https://www.example.org/first');
  });

  it('can apply compatible legacy rules while ignoring malformed or unsafe rows', () => {
    const rules = [
      { ...base, id: 'bad-conditions', priority: 1, conditionsJson: '{' },
      {
        ...base,
        id: 'unsafe-dest',
        priority: 2,
        destinationUrl: 'https://internal.local',
      },
      { ...base, id: 'bad-operator', priority: 3, operator: 'regex' },
      base,
    ];
    expect(selectDestination(link, rules, visitor)?.matchedRuleId).toBe(
      'rule-default',
    );
    const fallback = selectDestination(link, rules.slice(0, -1), visitor);
    expect(fallback?.matchedRuleId).toBeNull();
    expect(fallback?.url.href).toBe(link.destinationUrl);
    expect(
      selectDestination({ destinationUrl: 'https://localhost' }, [], visitor),
    ).toBeNull();
  });
});
