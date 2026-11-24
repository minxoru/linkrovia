import { describe, expect, it } from 'vitest';
import {
  readSmallForm,
  requireSameOrigin,
} from '../../src/lib/server/security/request';

const url = new URL('https://go.example.com/admin');

describe('browser requests', () => {
  it('requires the exact browser origin for a state change', () => {
    expect(
      requireSameOrigin(
        new Request(url, { headers: { Origin: url.origin } }),
        url,
      ),
    ).toBe(true);
    expect(
      requireSameOrigin(
        new Request(url, { headers: { Origin: 'https://other.example.com' } }),
        url,
      ),
    ).toBe(false);
    expect(requireSameOrigin(new Request(url), url)).toBe(false);
  });

  it('reads bounded form data and rejects other content types', async () => {
    expect(
      (
        await readSmallForm(
          new Request(url, {
            method: 'POST',
            body: new URLSearchParams({ csrfToken: 'sample' }),
          }),
        )
      )?.get('csrfToken'),
    ).toBe('sample');
    expect(
      await readSmallForm(new Request(url, { method: 'POST', body: 'text' })),
    ).toBeNull();
    expect(
      await readSmallForm(
        new Request(url, {
          method: 'POST',
          body: new URLSearchParams({ password: '🙂'.repeat(4096) }),
        }),
      ),
    ).toBeNull();
  });
});
