import { describe, expect, it } from 'vitest';
import {
  normalizeHostname,
  parseDestinationUrl,
} from '../../src/lib/server/security/url-policy';

describe('destination URL policy', () => {
  it('normalizes the hostname and preserves the path, query and fragment', () => {
    expect(
      parseDestinationUrl(
        'HTTPS://bücher.example.org:8443/b%20c?a=1&a=2#anchor',
      )?.href,
    ).toBe('https://xn--bcher-kva.example.org:8443/b%20c?a=1&a=2#anchor');
  });

  it.each([
    'javascript:alert(1)',
    'ftp://example.org',
    '/relative',
    'https:example.org',
    'https:///example.org',
    'https://user:password@example.org',
    'https://@example.org',
    'https://localhost',
    'https://child.localhost.',
    'https://box.local',
    'https://box.internal',
    'https://box.home.arpa',
    'https://host',
    'https://192.0.2.10',
    'https://[2001:db8::1]',
    'https://127.1',
    'https://2130706433',
    'https://0x7f000001',
    'https://bad_label.example.org',
    'https://bad..example.org',
    'https://example.org:0',
    'https://example.org:',
    'https://example.org:65536',
    'https://example.org/line\nbreak',
    'https://example.org\\path',
    [],
    undefined,
  ])('rejects an invalid or non-public destination: %s', (value) => {
    expect(parseDestinationUrl(value)).toBeNull();
  });
});

describe('request hostname normalization', () => {
  it('normalizes case, IDNs and a single DNS root dot and strips a valid port', () => {
    expect(normalizeHostname('Bücher.Example.org.:08080')).toBe(
      'xn--bcher-kva.example.org',
    );
  });

  it.each([
    'example.org:0',
    'example.org:65536',
    'example.org:',
    'example.org,example.net',
    'example.org@example.net',
    'https://example.org/path',
    'example.org/path',
    'example.org..',
    'example%2eorg',
    'localhost',
    '127.0.0.1:8080',
    '[::1]:8080',
  ])('rejects invalid, ambiguous, or non-public authority: %s', (authority) => {
    expect(normalizeHostname(authority)).toBeNull();
  });

  it('allows explicit local loopback hosts only when requested', () => {
    expect(normalizeHostname('localhost:5173', { allowLoopback: true })).toBe(
      'localhost',
    );
    expect(normalizeHostname('127.0.0.1:5173', { allowLoopback: true })).toBe(
      '127.0.0.1',
    );
    expect(normalizeHostname('[::1]:5173', { allowLoopback: true })).toBe(
      '[::1]',
    );
    expect(normalizeHostname('127.1:5173', { allowLoopback: true })).toBeNull();
  });
});
