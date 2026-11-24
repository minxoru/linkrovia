import { describe, expect, it, vi } from 'vitest';
import {
  attachCustomDomain,
  detachCustomDomain,
  diagnoseCustomDomain,
  parseCloudflareInput,
} from '../../src/lib/server/domains/cloudflare';

const accountId = 'a'.repeat(32);
const zoneId = 'b'.repeat(32);
const domainId = 'c'.repeat(40);
const token = 'scoped-token_'.repeat(4);
const input = { accountId, zoneId, token };
const hostname = 'go.example.com';
const management = 'linkrovia.account.workers.dev';
const zone = {
  id: zoneId,
  account: { id: accountId },
  name: 'example.com',
  status: 'active',
  type: 'full',
};
const domain = {
  id: domainId,
  hostname,
  zone_id: zoneId,
  zone_name: zone.name,
  service: 'linkrovia',
  environment: '',
  enabled: true,
};
const workers = `/client/v4/accounts/${accountId}/workers`;
const zones = `/client/v4/zones/${zoneId}`;

function provider(overrides: Record<string, unknown> = {}) {
  const results: Record<string, unknown> = {
    [`${workers}/subdomain`]: { subdomain: 'account' },
    [`${workers}/scripts/linkrovia/subdomain`]: { enabled: true },
    [zones]: zone,
    [`${workers}/domains`]: [],
    [`${zones}/workers/routes`]: [],
    [`${zones}/dns_records`]: [],
    ...overrides,
  };
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = new URL(String(url));
    expect(endpoint.origin).toBe('https://api.cloudflare.com');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${token}`,
    );
    const result =
      results[`${init?.method} ${endpoint.pathname + endpoint.search}`] ??
      results[endpoint.pathname + endpoint.search] ??
      results[endpoint.pathname];
    if (result instanceof Response) return result;
    return Response.json({ success: true, result });
  });
}

describe('Cloudflare Custom Domain provider', () => {
  it('validates IDs and rejects credentials with control characters or Global API key syntax', () => {
    expect(parseCloudflareInput(input)).toEqual(input);
    expect(
      parseCloudflareInput({ ...input, accountId: accountId + '\n' }),
    ).toBeNull();
    expect(parseCloudflareInput({ ...input, zoneId: '../zones' })).toBeNull();
    expect(parseCloudflareInput({ ...input, token: token + '\n' })).toBeNull();
    expect(
      parseCloudflareInput({ ...input, token: 'a'.repeat(37) }),
    ).toBeNull();
  });

  it('discovers the closest visible zone with a token and verifies its account', async () => {
    expect(
      parseCloudflareInput({ token, accountId: null, zoneId: '' }),
    ).toEqual({ token });
    expect(parseCloudflareInput({ token, accountId })).toBeNull();

    const zoneQuery = (name: string) =>
      `/client/v4/zones?name=${name}&per_page=5`;
    const send = provider({
      [zoneQuery(hostname)]: [],
      [zoneQuery(zone.name)]: [zone],
    });
    const credentials = parseCloudflareInput({ token });
    expect(credentials).not.toBeNull();
    if (!credentials) throw new Error('Missing credentials');
    expect(
      await diagnoseCustomDomain(credentials, hostname, management, send),
    ).toEqual({
      code: 'ready',
      zoneName: zone.name,
      service: 'linkrovia',
    });
    expect(send.mock.calls[0][0]).toBe(
      `https://api.cloudflare.com${zoneQuery(hostname)}`,
    );
    expect(send.mock.calls[1][0]).toBe(
      `https://api.cloudflare.com${zoneQuery(zone.name)}`,
    );

    const wrongAccount = provider({
      [zoneQuery(hostname)]: [
        { ...zone, name: hostname, account: { id: 'd'.repeat(32) } },
      ],
      [zoneQuery(zone.name)]: [zone],
      [`/client/v4/accounts/${'d'.repeat(32)}/workers/subdomain`]: {
        subdomain: 'other-account',
      },
      [zones]: { ...zone, name: hostname, account: { id: 'd'.repeat(32) } },
    });
    expect(
      await diagnoseCustomDomain(
        credentials,
        hostname,
        management,
        wrongAccount,
      ),
    ).toEqual({ code: 'unsupported' });
    expect(
      wrongAccount.mock.calls.some(([url]) =>
        String(url).includes(zoneQuery(zone.name)),
      ),
    ).toBe(false);
  });

  it('runs read-only diagnostics', async () => {
    const send = provider();
    expect(
      await diagnoseCustomDomain(input, hostname, management, send),
    ).toEqual({
      code: 'ready',
      service: 'linkrovia',
      zoneName: 'example.com',
    });
    expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });

  it('rejects a mismatched account subdomain or a zone that is partial or belongs to a different account', async () => {
    for (const overrides of [
      { [`${workers}/subdomain`]: { subdomain: 'different' } },
      { [zones]: { ...zone, type: 'partial' } },
      { [zones]: { ...zone, account: { id: 'd'.repeat(32) } } },
    ]) {
      expect(
        await diagnoseCustomDomain(
          input,
          hostname,
          management,
          provider(overrides),
        ),
      ).toEqual({ code: 'unsupported' });
    }
    expect(
      await diagnoseCustomDomain(
        input,
        hostname,
        'admin.example.com',
        provider(),
      ),
    ).toEqual({ code: 'unsupported' });
  });

  it('recognizes matching routes, conflicting DNS records, and disabled or foreign mappings', async () => {
    for (const overrides of [
      {
        [`${zones}/workers/routes`]: [
          { pattern: 'HTTPS://*.EXAMPLE.COM/any/path*' },
        ],
      },
      {
        [`${zones}/dns_records?shadowing_name=${hostname}&per_page=1`]:
          Response.json({
            success: true,
            result: [{ name: hostname, type: 'NS' }],
            result_info: { total_pages: 2, page: 1 },
          }),
      },
      { [`${workers}/domains`]: [{ ...domain, enabled: false }] },
      { [`${workers}/domains`]: [{ ...domain, environment: 'staging' }] },
      { [`${workers}/domains`]: [{ ...domain, service: 'another-worker' }] },
    ]) {
      expect(
        await diagnoseCustomDomain(
          input,
          hostname,
          management,
          provider(overrides),
        ),
      ).toMatchObject({ code: 'conflict' });
    }
  });

  it('reports an existing enabled mapping on the expected zone and Worker', async () => {
    const send = provider({
      [`${workers}/domains`]: [
        { ...domain, id: 'c'.repeat(32), environment: 'production' },
      ],
    });
    expect(
      await diagnoseCustomDomain(input, hostname, management, send),
    ).toEqual({
      code: 'attached',
      service: 'linkrovia',
      zoneName: 'example.com',
    });
  });

  it('maps denied and invalid provider replies without returning provider data', async () => {
    const url = `${workers}/subdomain`;
    for (const [response, code] of [
      [Response.json({ token }, { status: 403 }), 'permissions'],
      [
        new Response(token, {
          status: 302,
          headers: { Location: 'https://example.com' },
        }),
        'provider_error',
      ],
      [new Response('x'.repeat(300_000)), 'provider_error'],
    ] as const) {
      expect(
        await diagnoseCustomDomain(
          input,
          hostname,
          management,
          provider({ [url]: response }),
        ),
      ).toEqual({ code });
    }
  });

  it('fails closed when the provider returns only part of the route or mapping list', async () => {
    for (const path of [`${zones}/workers/routes`, `${workers}/domains`]) {
      const send = provider({
        [path]: Response.json({
          success: true,
          result: [],
          result_info: { total_pages: 2, page: 1 },
        }),
      });
      expect(
        await diagnoseCustomDomain(input, hostname, management, send),
      ).toEqual({
        code: 'provider_error',
      });
      expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
        true,
      );
    }
  });
});

describe('Cloudflare Custom Domain mutations', () => {
  const records = `${workers}/scripts/linkrovia/domains/records`;
  const domainList = `${workers}/domains?hostname=${hostname}`;
  const domainPath = `${workers}/domains/${domainId}`;

  it('attaches only the confirmed hostname with override switches disabled', async () => {
    const send = provider({
      [`PUT ${records}`]: [domain],
    });

    expect(await attachCustomDomain(input, hostname, management, send)).toEqual(
      {
        code: 'attached',
        service: 'linkrovia',
        zoneName: 'example.com',
        mappingId: domainId,
        accountId,
        zoneId,
        created: true,
      },
    );
    expect(
      send.mock.calls.slice(0, -1).every(([, init]) => init?.method === 'GET'),
    ).toBe(true);
    const [url, init] = send.mock.calls.at(-1) ?? [];
    expect(new URL(String(url)).pathname).toBe(records);
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      override_scope: false,
      override_existing_origin: false,
      override_existing_dns_record: false,
      origins: [
        { hostname, zone_id: zoneId, enabled: true, previews_enabled: false },
      ],
    });
  });

  it('attaches a zone apex with MX and TXT records and A records on other hosts', async () => {
    const send = provider({
      [`${zones}/dns_records`]: [{ name: `www.${zone.name}`, type: 'A' }],
      [`${zones}/dns_records?name.exact=${zone.name}&per_page=100`]: [
        { name: zone.name, type: 'MX' },
        { name: zone.name, type: 'MX' },
        { name: zone.name, type: 'TXT' },
      ],
      [`PUT ${records}`]: [{ ...domain, hostname: zone.name }],
    });

    expect(
      await attachCustomDomain(input, zone.name, management, send),
    ).toMatchObject({ code: 'attached', created: true });
  });

  it('reuses an existing exact mapping without claiming ownership', async () => {
    const send = provider({ [domainList]: [domain] });
    expect(
      await attachCustomDomain(input, hostname, management, send),
    ).toMatchObject({
      code: 'attached',
      mappingId: domainId,
      created: false,
    });
    expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });

  it('skips all writes when the fresh preflight finds conflicting DNS, a matching route or a foreign mapping', async () => {
    for (const overrides of [
      ...['A', 'AAAA', 'CNAME'].map((type) => ({
        [`${zones}/dns_records`]: [
          { name: hostname, type: 'MX' },
          { name: hostname, type },
        ],
      })),
      { [`${zones}/workers/routes`]: [{ pattern: `${hostname}/*` }] },
      { [domainList]: [{ ...domain, service: 'another-worker' }] },
    ]) {
      const send = provider(overrides);
      expect(
        await attachCustomDomain(input, hostname, management, send),
      ).toMatchObject({ code: 'conflict' });
      expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
        true,
      );
    }
  });

  it('skips writes when the exact DNS listing is incomplete', async () => {
    const send = provider({
      [`${zones}/dns_records?name.exact=${hostname}&per_page=100`]:
        Response.json({
          success: true,
          result: [{ name: hostname, type: 'MX' }],
          result_info: { page: 1, total_pages: 2 },
        }),
    });

    expect(await attachCustomDomain(input, hostname, management, send)).toEqual(
      { code: 'provider_error' },
    );
    expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });

  it('returns a conflict when the provider detects a concurrent incompatible change', async () => {
    const send = provider({
      [`PUT ${records}`]: Response.json({ success: false }, { status: 409 }),
    });
    expect(
      await attachCustomDomain(input, hostname, management, send),
    ).toMatchObject({ code: 'conflict' });
    expect(
      send.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(1);
  });

  it('reports an uncertain write without sending another write or claiming a mapping', async () => {
    const send = provider({
      [`PUT ${records}`]: Response.json({ success: false }, { status: 503 }),
    });
    expect(
      await attachCustomDomain(input, hostname, management, send),
    ).toMatchObject({ code: 'operation_unknown' });
    expect(
      send.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(1);
  });

  it.each([204, 503])(
    'uses independent deadlines and confirms the exact mapping after HTTP %i',
    async (status) => {
      const before = provider();
      const after = provider({ [domainList]: [domain] });
      let mutationSent = false;
      const send = vi.fn((url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          mutationSent = true;
          return Promise.resolve(new Response(null, { status }));
        }
        return (mutationSent ? after : before)(url, init);
      });

      expect(
        await attachCustomDomain(input, hostname, management, send),
      ).toMatchObject({
        code: 'attached',
        mappingId: domainId,
        created: false,
      });
      const writes = send.mock.calls.filter(
        ([, init]) => init?.method === 'PUT',
      );
      expect(writes).toHaveLength(1);
      const preflightSignal = send.mock.calls[0][1]?.signal;
      const writeSignal = writes[0][1]?.signal;
      const confirmationSignal = send.mock.calls.at(-1)?.[1]?.signal;
      expect(
        new Set([preflightSignal, writeSignal, confirmationSignal]).size,
      ).toBe(3);
      expect(send.mock.calls.at(-1)?.[0]).toBe(
        `https://api.cloudflare.com${domainList}`,
      );
    },
  );

  it('detaches only the matching mapping ID and treats an already absent ID as detached', async () => {
    const send = provider({ [domainPath]: domain });
    expect(
      await detachCustomDomain(input, hostname, management, domainId, send),
    ).toMatchObject({ code: 'detached' });
    expect(
      send.mock.calls.map(([url, init]) => [
        new URL(String(url)).pathname,
        init?.method,
      ]),
    ).toContainEqual([domainPath, 'DELETE']);

    const absent = provider({
      [domainPath]: new Response(null, { status: 404 }),
    });
    expect(
      await detachCustomDomain(input, hostname, management, domainId, absent),
    ).toMatchObject({ code: 'detached' });
    expect(absent.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });

  it('rejects mapping identifiers containing path delimiters or whitespace before any request', async () => {
    const send = provider();
    for (const invalidId of [
      `${domainId.slice(0, -1)}/`,
      `${domainId}\n`,
      'c'.repeat(38),
    ]) {
      expect(
        await detachCustomDomain(input, hostname, management, invalidId, send),
      ).toEqual({
        code: 'unsupported',
      });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves a mapping that changed Worker, zone or hostname before detach', async () => {
    for (const changed of [
      { ...domain, service: 'another-worker' },
      { ...domain, zone_id: accountId },
      { ...domain, hostname: 'other.example.com' },
    ]) {
      const send = provider({ [domainPath]: changed });
      expect(
        await detachCustomDomain(input, hostname, management, domainId, send),
      ).toMatchObject({ code: 'conflict' });
      expect(send.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
        true,
      );
    }
  });
});
