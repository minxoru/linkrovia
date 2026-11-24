import { describe, expect, it } from 'vitest';
import {
  parseLinkPayload,
  parseLinkQuery,
  readApiJson,
} from '../../src/lib/server/links/api-input';
import {
  parseSimulationInput,
  simulateTarget,
} from '../../src/lib/server/links/simulation';

const create = {
  domainId: 'domain-a',
  destinationUrl: 'https://example.org/page?q=x#anchor',
};

describe('link JSON payloads', () => {
  it('preserves URL components, validates legacy rules and normalizes tags', () => {
    const parsed = parseLinkPayload({
      ...create,
      tags: [' Campaign ', 'campaign', 'News'],
      rules: [
        {
          type: 'language',
          value: 'EN-gb',
          priority: 0,
          destinationUrl: 'https://example.org/gb',
        },
      ],
    });
    expect(parsed).toMatchObject({
      input: {
        ...create,
        slug: null,
        redirectType: 302,
        isActive: true,
        startsAt: null,
        expiresAt: null,
        tags: ['Campaign', 'News'],
        rules: [
          {
            conditions: [{ type: 'language', operator: 'eq', value: 'en-GB' }],
            priority: 0,
            isActive: true,
            destinationUrl: 'https://example.org/gb',
          },
        ],
      },
    });
  });

  it('preserves unspecified fields and requires a PATCH version', () => {
    const initial = parseLinkPayload({
      ...create,
      slug: 'Existing',
      tags: ['news'],
    });
    if (!('input' in initial)) throw new Error('Invalid create fixture');
    const current = {
      ...initial.input,
      slug: 'Existing',
      updatedAt: 2,
      id: 'link-id',
      hostname: 'go.example.org',
      createdAt: 1,
      utmConfigJson: null,
      protectionMode: 'none' as const,
      consumedAt: null,
    };
    expect(
      parseLinkPayload({ updatedAt: 2, isActive: false }, current),
    ).toMatchObject({
      expected: 2,
      input: { ...create, slug: 'Existing', tags: ['news'], isActive: false },
    });
    expect(parseLinkPayload({ isActive: false }, current)).toHaveProperty(
      'fieldErrors.updatedAt',
    );
    expect(
      parseLinkPayload({ updatedAt: 2, slug: null }, current),
    ).toHaveProperty('fieldErrors.slug');
  });

  it.each([
    [{ slug: 'API' }, 'slug'],
    [{ isActive: 1 }, 'isActive'],
    [{ destinationUrl: 'https://localhost' }, 'destinationUrl'],
    [{ redirectType: '302' }, 'redirectType'],
    [{ startsAt: 200, expiresAt: 100 }, 'expiresAt'],
    [{ title: 'x'.repeat(201) }, 'title'],
    [{ tags: ['a\u0000b'] }, 'tags'],
    [
      {
        rules: [
          {
            priority: 0,
            destinationUrl: 'https://example.org',
            conditions: {},
          },
        ],
      },
      'rules.0',
    ],
  ])(
    'rejects invalid fields without reflecting their values',
    (override, field) => {
      const parsed = parseLinkPayload({ ...create, ...override });
      expect(
        'fieldErrors' in parsed && Object.hasOwn(parsed.fieldErrors, field),
      ).toBe(true);
    },
  );

  it('validates list bounds and cursor format', () => {
    expect(
      parseLinkQuery(
        new URLSearchParams('limit=100&domain=domain-a&status=active'),
      ),
    ).toEqual({
      filter: { limit: 100, domain: 'domain-a', status: 'active' },
    });
    expect(
      parseLinkQuery(new URLSearchParams('limit=101&cursor=invalid')),
    ).toMatchObject({
      fieldErrors: { limit: expect.any(Array), cursor: expect.any(Array) },
    });
  });
});

describe('bounded JSON requests', () => {
  function request(body: string, contentType = 'application/json') {
    return new Request('https://example.org/api/v1/links', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });
  }

  it('accepts JSON, rejects malformed data, and rejects unexpected content types', async () => {
    await expect(readApiJson(request('{"value":1}'))).resolves.toEqual({
      body: { value: 1 },
    });
    await expect(readApiJson(request('{'))).resolves.toEqual({ status: 400 });
    await expect(
      readApiJson(request('{"key":1}', 'text/plain')),
    ).resolves.toEqual({ status: 415 });
  });

  it('rejects large payloads even without Content-Length', async () => {
    await expect(
      readApiJson(request(JSON.stringify('x'.repeat(262_144)))),
    ).resolves.toEqual({ status: 413 });
  });
});

describe('read-only link simulation', () => {
  const link = {
    destinationUrl: 'https://example.org/default',
    redirectType: 302,
    isActive: 1,
    domainActive: 1,
    connectionStatus: 'active',
    startsAt: 10,
    expiresAt: 30,
    consumedAt: null,
    protectionMode: 'none',
  };

  it('uses only explicit simulation inputs with the shared rule evaluator', () => {
    const parsed = parseSimulationInput({
      country: 'jp',
      region: 'jp-13',
      language: 'EN-gb',
      at: 20,
    });
    if (!('input' in parsed)) throw new Error('Invalid simulation fixture');
    expect(
      simulateTarget(
        link,
        [
          {
            id: 'country-rule',
            priority: 0,
            isActive: 1,
            ruleType: 'region',
            operator: 'eq',
            ruleValue: 'JP-13',
            conditionsJson: null,
            destinationUrl: 'https://example.org/targeted',
          },
        ],
        parsed.input,
      ),
    ).toMatchObject({
      matchedRuleId: 'country-rule',
      destinationUrl: 'https://example.org/targeted',
      fallbackUsed: false,
      blockedReason: null,
    });
  });

  it('returns a reason and no destination for a consumed link or an expired link', () => {
    const current = parseSimulationInput({ at: 20 });
    const expired = parseSimulationInput({ at: 30 });
    if (!('input' in current) || !('input' in expired))
      throw new Error('Invalid simulation fixture');
    expect(
      simulateTarget(
        { ...link, protectionMode: 'one_time', consumedAt: 15 },
        [],
        current.input,
      ),
    ).toMatchObject({
      destinationUrl: null,
      blockedReason: 'already_consumed',
    });
    expect(simulateTarget(link, [], expired.input)).toMatchObject({
      destinationUrl: null,
      blockedReason: 'expired',
    });
  });

  it('rejects contradictory regions and invalid epoch seconds', () => {
    expect(
      parseSimulationInput({ country: 'US', region: 'JP-13', at: '20' }),
    ).toMatchObject({
      fieldErrors: { region: expect.any(Array), at: expect.any(Array) },
    });
  });

  it('reports the same stored campaign query as the effective destination', () => {
    const parsed = parseSimulationInput({ at: 20 });
    if (!('input' in parsed)) throw new Error('Invalid simulation fixture');
    const result = simulateTarget(
      {
        ...link,
        destinationUrl: 'https://example.org/default?old=1#section',
        utmConfigJson: '{"default":{"utm_medium":"mail"}}',
      },
      [],
      parsed.input,
    );
    expect(result.destinationUrl).toBe(
      'https://example.org/default?old=1&utm_medium=mail#section',
    );
  });
});
