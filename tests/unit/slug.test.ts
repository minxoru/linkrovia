import { describe, expect, it } from 'vitest';
import { generateSlug, isValidSlug } from '../../src/lib/server/security/slug';

describe('link slugs', () => {
  it.each(['Ab_-Z', 'three', 'A'.repeat(64), 'a1B'])(
    'accepts valid case-sensitive slugs',
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    'ab',
    'a'.repeat(65),
    'foo/bar',
    'foo\\bar',
    'foo%2Fbar',
    'foo%252Fbar',
    'a b',
    'foo\n',
    'ＡＢＣ',
    ['abc'],
    'admin',
    'Admin',
    'API',
    'health',
    'MCP',
    'Gate',
    'Q',
    '_app',
    'login',
    'logout',
    'setup',
  ])('rejects invalid or reserved slugs: %s', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it('generates valid six-character alphanumeric slugs', () => {
    const values = Array.from({ length: 32 }, generateSlug);
    expect(
      values.every(
        (slug) =>
          slug.length === 6 &&
          /^[A-Za-z0-9]{6}$/.test(slug) &&
          isValidSlug(slug),
      ),
    ).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});
