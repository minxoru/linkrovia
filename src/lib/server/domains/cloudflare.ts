type CloudflareScope = { accountId: string; zoneId: string };
export type CloudflareInput = { token: string } & (
  CloudflareScope | { accountId?: undefined; zoneId?: undefined }
);

type ProviderErrorCode = 'permissions' | 'provider_error' | 'conflict';
type DomainDetails = { zoneName: string; service: string };

type PreflightOutcome =
  | ({ code: 'ready' | 'conflict' } & DomainDetails)
  | ({ code: 'attached'; mappingId: string } & DomainDetails);

export type CloudflareOutcome =
  | ({
      code: 'attached';
      mappingId: string;
      accountId: string;
      zoneId: string;
      created: boolean;
    } & DomainDetails)
  | {
      code:
        | ProviderErrorCode
        | 'ready'
        | 'detached'
        | 'unsupported'
        | 'operation_unknown';
      zoneName?: string;
      service?: string;
    };

const idPattern = /^[0-9a-f]{32}$/i;
const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const hostnamePattern = new RegExp(`^${label}(?:\\.${label})+$`);
const workerHostnamePattern = new RegExp(
  `^(${label})\\.(${label})\\.workers\\.dev$`,
);
const maxResponseBytes = 256 * 1024;
const lookupTimeout = 5000;
const attachTimeout = 15000;

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length === 32 && idPattern.test(value)
  );
}

function validMappingId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.length === 32 || value.length === 40) &&
    !/[^0-9a-f]/i.test(value)
  );
}

function validHostname(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 253 &&
    value === value.trim() &&
    hostnamePattern.test(value)
  );
}

export function parseCloudflareInput(raw: {
  accountId?: unknown;
  zoneId?: unknown;
  token: unknown;
}): CloudflareInput | null {
  const { accountId, zoneId, token } = raw;
  if (
    typeof token !== 'string' ||
    token.length < 32 ||
    token.length > 128 ||
    /[^A-Za-z0-9_-]/.test(token) ||
    /^[0-9a-f]{37}$/i.test(token)
  ) {
    return null;
  }
  if (
    (accountId == null || accountId === '') &&
    (zoneId == null || zoneId === '')
  ) {
    return { token };
  }
  if (!validId(accountId) || !validId(zoneId)) return null;
  return {
    accountId: accountId.toLowerCase(),
    zoneId: zoneId.toLowerCase(),
    token,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

class ProviderFailure extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly status?: number,
  ) {
    super(code);
  }
}

async function responseJSON(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderFailure('provider_error');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let content = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(content + decoder.decode()) as unknown;
      size += value.byteLength;
      if (size > maxResponseBytes) throw new ProviderFailure('provider_error');
      content += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

function client(
  input: CloudflareInput,
  send: typeof fetch,
  timeout = lookupTimeout,
) {
  const signal = AbortSignal.timeout(timeout);
  return async (path: string, method = 'GET', body?: unknown) => {
    const headers = new Headers({ Authorization: `Bearer ${input.token}` });
    if (body) headers.set('Content-Type', 'application/json');
    const response = await send(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ProviderFailure(
        response.status === 401 || response.status === 403
          ? 'permissions'
          : response.status === 409
            ? 'conflict'
            : 'provider_error',
        response.status,
      );
    }
    const envelope = object(await responseJSON(response));
    if (envelope?.success !== true) throw new ProviderFailure('provider_error');
    return envelope;
  };
}

type CloudflareClient = ReturnType<typeof client>;

async function list(
  api: CloudflareClient,
  path: string,
  stopAtFirstResult = false,
): Promise<unknown[]> {
  const { result, result_info } = await api(path);
  if (!Array.isArray(result)) throw new ProviderFailure('provider_error');
  if (stopAtFirstResult && result.length) return result;
  const info = object(result_info);
  if (
    (result_info !== undefined && !info) ||
    (info?.total_pages !== undefined &&
      info.total_pages !== 0 &&
      info.total_pages !== 1) ||
    (info?.page !== undefined && info.page !== 1) ||
    (info?.cursor !== undefined && info.cursor !== null && info.cursor !== '')
  ) {
    throw new ProviderFailure('provider_error');
  }
  return result;
}

async function discoverScope(
  api: CloudflareClient,
  hostname: string,
): Promise<CloudflareScope | null> {
  const labels = hostname.split('.');
  // Query exact suffixes nearest first. Deeper hosts can use explicit IDs
  // when their zone lies beyond the discovery limit.
  for (let index = 0; index < Math.min(labels.length - 1, 6); index++) {
    const name = labels.slice(index).join('.');
    const results = await list(
      api,
      `/zones?${new URLSearchParams({ name, per_page: '5' })}`,
    );
    if (!results.length) continue;
    const zone = object(results[0]);
    const accountId = object(zone?.account)?.id;
    const zoneId = zone?.id;
    if (
      results.length !== 1 ||
      zone?.name !== name ||
      !validId(accountId) ||
      !validId(zoneId)
    ) {
      throw new ProviderFailure('provider_error');
    }
    return { accountId: accountId.toLowerCase(), zoneId: zoneId.toLowerCase() };
  }
  return null;
}

async function scope(
  input: CloudflareInput,
  hostname: string,
  managementHostname: string,
  send: typeof fetch,
) {
  const scoped = parseCloudflareInput(input);
  const worker = workerHostnamePattern.exec(managementHostname);
  if (
    !scoped ||
    !validHostname(managementHostname) ||
    !worker ||
    !validHostname(hostname) ||
    hostname.endsWith('.workers.dev') ||
    hostname === 'workers.dev'
  ) {
    return null;
  }
  const [, service, accountSubdomain] = worker;
  const api = client(scoped, send);
  const scopeIds = scoped.accountId
    ? scoped
    : await discoverScope(api, hostname);
  if (!scopeIds) return null;
  const { accountId, zoneId } = scopeIds;
  const workers = `/accounts/${accountId}/workers`;
  const zones = `/zones/${zoneId}`;
  const [subdomain, zone] = await Promise.all([
    api(`${workers}/subdomain`),
    api(zones),
  ]);
  const subdomainResult = object(subdomain.result);
  const zoneResult = object(zone.result);
  const zoneName = zoneResult?.name;
  if (
    subdomainResult?.subdomain !== accountSubdomain ||
    zoneResult?.id !== zoneId ||
    object(zoneResult.account)?.id !== accountId ||
    zoneResult.status !== 'active' ||
    zoneResult.type !== 'full' ||
    !validHostname(zoneName) ||
    (hostname !== zoneName && !hostname.endsWith(`.${zoneName}`))
  ) {
    return null;
  }
  return { api, workers, zones, accountId, zoneId, zoneName, service };
}

function matchesRoute(value: unknown, hostname: string): boolean {
  const pattern = object(value)?.pattern;
  if (typeof pattern !== 'string') throw new ProviderFailure('provider_error');
  const host = pattern
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
  const suffix = host.startsWith('*') ? host.slice(1) : host;
  if (!validHostname(suffix.replace(/^\./, '')))
    throw new ProviderFailure('provider_error');
  return host.startsWith('*') ? hostname.endsWith(suffix) : hostname === host;
}

function domainMatches(
  domain: Record<string, unknown> | null,
  hostname: string,
  settings: { zoneName: string; zoneId: string; service: string },
): domain is Record<string, unknown> & { id: string } {
  return (
    validMappingId(domain?.id) &&
    domain.hostname === hostname &&
    domain.zone_name === settings.zoneName &&
    domain.zone_id === settings.zoneId &&
    domain.service === settings.service &&
    (domain.environment === '' || domain.environment === 'production') &&
    domain.enabled === true
  );
}

function failure(error: unknown): { code: ProviderErrorCode } {
  return {
    code: error instanceof ProviderFailure ? error.code : 'provider_error',
  };
}

type DomainScope = NonNullable<Awaited<ReturnType<typeof scope>>>;

function domainsPath({ workers }: DomainScope, hostname: string) {
  return `${workers}/domains?${new URLSearchParams({ hostname })}`;
}

function matchingDomain(
  domains: unknown[],
  hostname: string,
  settings: DomainScope,
) {
  const domain = object(domains[0]);
  return domains.length === 1 && domainMatches(domain, hostname, settings)
    ? domain
    : null;
}

async function preflight(
  settings: DomainScope,
  hostname: string,
): Promise<PreflightOutcome> {
  const { api, zones, service, zoneName } = settings;
  const details = { service, zoneName };
  const dnsQuery = new URLSearchParams({
    'name.exact': hostname,
    per_page: '100',
  });
  // DNS delegation can shadow records at a non-apex hostname or an ancestor.
  const delegationQuery = new URLSearchParams({
    shadowing_name: hostname,
    per_page: '1',
  });
  const [domains, routes, dns, delegation] = await Promise.all([
    list(api, domainsPath(settings, hostname)),
    list(api, `${zones}/workers/routes`),
    list(api, `${zones}/dns_records?${dnsQuery}`),
    hostname === zoneName
      ? []
      : list(api, `${zones}/dns_records?${delegationQuery}`, true),
  ]);
  if (
    routes.some((route) => matchesRoute(route, hostname)) ||
    delegation.length
  ) {
    return { code: 'conflict', ...details };
  }
  if (domains.length) {
    const domain = matchingDomain(domains, hostname, settings);
    return domain
      ? { code: 'attached', mappingId: domain.id, ...details }
      : { code: 'conflict', ...details };
  }
  // Mail routing and TXT records can coexist with a Worker Custom Domain.
  const hasConflictingDns = dns.some((record) => {
    const type = object(record)?.type;
    return type !== 'MX' && type !== 'TXT';
  });
  return { code: hasConflictingDns ? 'conflict' : 'ready', ...details };
}

export async function diagnoseCustomDomain(
  input: CloudflareInput,
  hostname: string,
  managementHostname: string,
  send = fetch,
) {
  try {
    const settings = await scope(input, hostname, managementHostname, send);
    if (!settings) return { code: 'unsupported' } as const;
    const { code, service, zoneName } = await preflight(settings, hostname);
    return { code, service, zoneName };
  } catch (error) {
    return failure(error);
  }
}

async function verifyWorker({ api, workers, service }: DomainScope) {
  const { result } = await api(`${workers}/scripts/${service}/subdomain`);
  return object(result)?.enabled === true;
}

function mutationFailure(error: unknown): {
  code: ProviderErrorCode | 'operation_unknown';
} {
  if (error instanceof ProviderFailure) {
    if (error.code !== 'provider_error') return { code: error.code };
    if (
      error.status &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408 &&
      error.status !== 429
    ) {
      return { code: 'provider_error' };
    }
  }
  return { code: 'operation_unknown' };
}

export async function attachCustomDomain(
  input: CloudflareInput,
  hostname: string,
  managementHostname: string,
  send = fetch,
): Promise<CloudflareOutcome> {
  try {
    const settings = await scope(input, hostname, managementHostname, send);
    if (!settings || !(await verifyWorker(settings)))
      return { code: 'unsupported' };

    const readiness = await preflight(settings, hostname);
    if (readiness.code === 'attached')
      return {
        ...readiness,
        accountId: settings.accountId,
        zoneId: settings.zoneId,
        created: false,
      };
    if (readiness.code === 'conflict') return readiness;

    const { workers, service, accountId, zoneId, zoneName } = settings;
    const write = client(input, send, attachTimeout);
    let result: unknown;
    try {
      // Wrangler's Worker-scoped endpoint has separate controls for replacing
      // the Worker's domain set, existing origins, and conflicting DNS records.
      ({ result } = await write(
        `${workers}/scripts/${service}/domains/records`,
        'PUT',
        {
          override_scope: false,
          override_existing_origin: false,
          override_existing_dns_record: false,
          origins: [
            {
              hostname,
              zone_id: zoneId,
              enabled: true,
              previews_enabled: false,
            },
          ],
        },
      ));
    } catch (error) {
      const failed = mutationFailure(error);
      if (failed.code !== 'operation_unknown')
        return { ...failed, service, zoneName };
    }

    const returned = matchingDomain(
      Array.isArray(result) ? result : [result],
      hostname,
      settings,
    );
    if (returned) {
      return {
        code: 'attached',
        mappingId: returned.id,
        accountId,
        zoneId,
        created: true,
        service,
        zoneName,
      };
    }

    try {
      // A fresh read can establish routing after an ambiguous write. The
      // result does not establish which operation created the mapping.
      const confirm = client(input, send);
      const path = domainsPath(settings, hostname);
      let observedDomains = await list(confirm, path);
      if (!observedDomains.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        observedDomains = await list(confirm, path);
      }
      const observed = matchingDomain(observedDomains, hostname, settings);
      return observed
        ? {
            code: 'attached',
            mappingId: observed.id,
            accountId,
            zoneId,
            created: false,
            service,
            zoneName,
          }
        : { code: 'operation_unknown', service, zoneName };
    } catch {
      return { code: 'operation_unknown', service, zoneName };
    }
  } catch (error) {
    return failure(error);
  }
}

export async function detachCustomDomain(
  input: CloudflareInput,
  hostname: string,
  managementHostname: string,
  mappingId: string,
  send = fetch,
): Promise<CloudflareOutcome> {
  if (!validMappingId(mappingId)) return { code: 'unsupported' };
  try {
    const settings = await scope(input, hostname, managementHostname, send);
    if (!settings || !(await verifyWorker(settings)))
      return { code: 'unsupported' };
    const { api, workers, service, zoneName } = settings;
    const path = `${workers}/domains/${mappingId}`;
    const details = { service, zoneName };
    try {
      const mapping = object((await api(path)).result);
      if (
        !domainMatches(mapping, hostname, settings) ||
        mapping.id !== mappingId
      ) {
        return { code: 'conflict', ...details };
      }
    } catch (error) {
      if (error instanceof ProviderFailure && error.status === 404) {
        return { code: 'detached', ...details };
      }
      throw error;
    }

    try {
      await api(path, 'DELETE');
      return { code: 'detached', ...details };
    } catch (error) {
      if (error instanceof ProviderFailure && error.status === 404) {
        return { code: 'detached', ...details };
      }
      return { ...mutationFailure(error), ...details };
    }
  } catch (error) {
    return failure(error);
  }
}
