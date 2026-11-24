import { describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '../../src/lib/server/security/turnstile';

const options = {
  config: { enabled: true, siteKey: '0x4AAF00AAAABn0R22HWm-YUc' },
  secretKey: 'fake-worker-secret',
  token: 'valid.test-token',
  action: 'login' as const,
  hostname: 'login.example.net',
  development: false,
};
const accepted = {
  success: true,
  challenge_ts: '2025-01-01T00:00:00Z',
  hostname: 'login.example.net',
  action: 'login',
  'error-codes': [],
};
const dummyOptions = {
  ...options,
  config: { enabled: true, siteKey: '1x00000000000000000000AA' },
  secretKey: '1x0000000000000000000000000000000AA',
  token: 'XXXX.DUMMY.TOKEN.XXXX',
  development: true,
  hostname: '127.0.0.1',
};
const acceptedDummy = {
  success: true,
  challenge_ts: '2025-01-01T00:00:00Z',
  hostname: 'example.com',
  'error-codes': [],
};

describe('Turnstile Siteverify', () => {
  it('does not call Cloudflare when Turnstile is disabled', async () => {
    const fetch = vi.fn();
    await expect(
      verifyTurnstile({
        ...options,
        config: { enabled: false, siteKey: '' },
        fetch,
      }),
    ).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends only the token and secret to the Siteverify endpoint and accepts the matching response', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (url, init) => {
        expect(url).toBe(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        );
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('manual');
        expect(init?.credentials).toBe('omit');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect([...new URLSearchParams(String(init?.body)).entries()]).toEqual([
          ['secret', 'fake-worker-secret'],
          ['response', 'valid.test-token'],
        ]);
        return Response.json(accepted);
      });
    await expect(verifyTurnstile({ ...options, fetch })).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    '',
    'a'.repeat(2049),
    ' x ',
    'a\nb',
    'a\n',
    new File([], 'token'),
  ])('rejects an invalid token without network access', async (token) => {
    const fetch = vi.fn();
    await expect(verifyTurnstile({ ...options, token, fetch })).resolves.toBe(
      false,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...accepted, success: 'true' },
    { ...accepted, action: 'setup' },
    { ...accepted, action: undefined },
    { ...accepted, hostname: 'untrusted.login.example.net' },
    { ...accepted, hostname: 'login.example.net.' },
    { ...accepted, 'error-codes': ['timeout-or-duplicate'] },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    null,
  ])('fails closed for an invalid Siteverify response', async (body) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(body));
    await expect(verifyTurnstile({ ...options, fetch })).resolves.toBe(false);
  });

  it.each([
    () => Promise.reject(new TypeError('network failure')),
    () => Promise.resolve(new Response('not JSON')),
    () =>
      Promise.resolve(
        Response.json(accepted, {
          status: 307,
          headers: { location: 'https://example.net/' },
        }),
      ),
    () => Promise.resolve(Response.json(accepted, { status: 503 })),
  ])('fails closed when Cloudflare cannot verify the token', async (fetch) => {
    await expect(verifyTurnstile({ ...options, fetch })).resolves.toBe(false);
  });

  it('accepts the documented test-key response in loopback development', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(acceptedDummy));
    await expect(verifyTurnstile({ ...dummyOptions, fetch })).resolves.toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { development: false },
    { hostname: 'staging.example.net' },
    { config: options.config },
    {
      secretKey: '3x0000000000000000000000000000000AA',
      config: { enabled: true, siteKey: '2x00000000000000000000AB' },
    },
    { secretKey: options.secretKey },
    { secretKey: undefined },
    { config: options.config, secretKey: `${dummyOptions.secretKey} ` },
    { token: options.token },
  ])(
    'rejects test validation outside its explicit conditions',
    async (overrides) => {
      const fetch = vi.fn();
      await expect(
        verifyTurnstile({ ...dummyOptions, ...overrides, fetch }),
      ).resolves.toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('still requires the expected diagnostic response with test keys', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...acceptedDummy, action: 'setup' }));
    await expect(verifyTurnstile({ ...dummyOptions, fetch })).resolves.toBe(
      false,
    );
  });
});
