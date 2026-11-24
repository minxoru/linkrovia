import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { workersBuildRouting } from '../../scripts/deploy-workers-dev.mjs';

const account = '0123456789abcdef0123456789abcdef';
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const worker = 'linkrovia';
const url = 'https://linkrovia.existing.workers.dev';
const request = vi.fn<typeof fetch>();

function routingFor(config: Parameters<typeof workersBuildRouting>[0] = {}) {
  const routing = workersBuildRouting(config);
  if (!routing) throw new Error('Expected Workers Builds routing');
  return routing;
}

function success(result: object) {
  return Response.json({ success: true, result });
}

function failure(status: number, code?: number) {
  return Response.json(
    { success: false, errors: [{ code, message: 'private diagnostics' }] },
    { status },
  );
}

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal('fetch', request);
  vi.stubEnv('WORKERS_CI', '1');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', account);
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'fixture-token');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('registers a stable account subdomain after the exact missing response', async () => {
  request.mockResolvedValueOnce(failure(404, 10007));
  request.mockResolvedValueOnce(success({ subdomain: 'linkrovia-fixture' }));

  await routingFor().prepare();

  expect(request).toHaveBeenNthCalledWith(
    1,
    `${base}/subdomain`,
    expect.objectContaining({ method: 'GET', redirect: 'error' }),
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    `${base}/subdomain`,
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ subdomain: 'linkrovia-3eb1bd439947' }),
      headers: expect.objectContaining({
        Authorization: 'Bearer fixture-token',
      }),
    }),
  );
});

test('preserves the existing account subdomain', async () => {
  request.mockResolvedValueOnce(success({ subdomain: 'existing' }));

  await routingFor().prepare();

  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  [403, 10000],
  [403, 10007],
  [404, 10002],
  [404, undefined],
])(
  'keeps Wrangler available after HTTP %s with code %s',
  async (status, code) => {
    request.mockResolvedValueOnce(failure(status, code));

    await expect(routingFor().prepare()).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledTimes(1);
    const warning = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(warning).toContain(`HTTP ${status}`);
    expect(warning).not.toMatch(/fixture-token|private diagnostics|0123456789/);
  },
);

test('returns the live route from Worker metadata without changing an enabled route', async () => {
  request.mockResolvedValueOnce(success({ subdomain: { enabled: true, url } }));

  await expect(routingFor().publish(worker)).resolves.toBe(url);

  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  [undefined, true],
  [false, false],
])(
  'enables the Worker route with the requested preview setting %s',
  async (previewUrls, expectedPreview) => {
    request
      .mockResolvedValueOnce(
        success({ subdomain: { enabled: false, previews_enabled: true, url } }),
      )
      .mockResolvedValueOnce(
        success({ enabled: true, previews_enabled: expectedPreview }),
      )
      .mockResolvedValueOnce(success({ subdomain: { enabled: true, url } }));

    await expect(
      routingFor({ preview_urls: previewUrls }).publish(worker),
    ).resolves.toBe(url);

    expect(request).toHaveBeenNthCalledWith(
      2,
      `${base}/scripts/${worker}/subdomain`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          enabled: true,
          previews_enabled: expectedPreview,
        }),
      }),
    );
    expect(request).toHaveBeenCalledTimes(3);
  },
);

test.each([
  { workers_dev: false },
  { route: 'example.com/*' },
  { routes: [{ pattern: 'example.com/*' }] },
  { account_id: 'fedcba9876543210fedcba9876543210' },
  { compliance_region: 'fedramp_high' },
])('skips routing automation for incompatible configuration %j', (config) => {
  expect(workersBuildRouting(config)).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

test.each(['WORKERS_CI', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
  'skips automation when %s is unavailable',
  (name) => {
    vi.stubEnv(name, undefined);
    expect(workersBuildRouting({})).toBeNull();
    expect(request).not.toHaveBeenCalled();
  },
);

test('uses the configured account ID on Workers Builds', async () => {
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined);
  request.mockResolvedValueOnce(success({ subdomain: 'existing' }));

  await routingFor({ account_id: account }).prepare();

  expect(request).toHaveBeenCalledWith(
    `${base}/subdomain`,
    expect.objectContaining({ method: 'GET' }),
  );
});

test('rejects untrusted Worker URLs and malformed Worker names', async () => {
  request.mockResolvedValueOnce(
    success({ subdomain: { enabled: true, url: 'https://example.com' } }),
  );
  const routing = routingFor();

  expect(await routing.publish(worker)).toBeUndefined();
  expect(await routing.publish('../subdomain')).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});

test('does not mutate a route when metadata does not state whether it is enabled', async () => {
  request.mockResolvedValueOnce(success({ subdomain: { url } }));

  await expect(routingFor().publish(worker)).resolves.toBeUndefined();

  expect(request).toHaveBeenCalledTimes(1);
});

test('does not send credentials configured for another API origin to public Cloudflare', () => {
  vi.stubEnv('CLOUDFLARE_API_BASE_URL', 'https://example.test');

  expect(workersBuildRouting({})).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
