import { createHash } from 'node:crypto';

const dnsLabel = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const workerLabel = new RegExp(`^${dnsLabel}$`, 'i');
const workersDevOrigin = new RegExp(
  `^https://(${dnsLabel})\\.${dnsLabel}\\.workers\\.dev/?$`,
  'i',
);
const accountIdPattern = /^[a-f0-9]{32}$/i;
const missingSubdomain = 10007;
const publicApi = 'https://api.cloudflare.com/client/v4';

/**
 * @param {string} action
 * @param {string} detail
 */
function warn(action, detail) {
  console.warn(
    `Could not ${action} automatically (${detail}). In Cloudflare, open Workers & Pages to check your account subdomain, then select the Worker and check its workers.dev address in Domains. Continuing with Wrangler deployment information.`,
  );
}

/**
 * @param {{ workers_dev?: boolean, route?: unknown, routes?: unknown[], compliance_region?: string, account_id?: string, preview_urls?: boolean }} config
 */
export function workersBuildRouting(config) {
  const apiBase =
    process.env.CLOUDFLARE_API_BASE_URL || process.env.CF_API_BASE_URL;
  if (
    process.env.WORKERS_CI !== '1' ||
    (apiBase && apiBase.replace(/\/$/, '') !== publicApi) ||
    !(config.workers_dev ?? !(config.route || config.routes?.length)) ||
    (config.compliance_region && config.compliance_region !== 'public') ||
    (process.env.CLOUDFLARE_COMPLIANCE_REGION &&
      process.env.CLOUDFLARE_COMPLIANCE_REGION !== 'public')
  )
    return null;

  const environmentAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.toLowerCase();
  const configuredAccount =
    typeof config.account_id === 'string'
      ? config.account_id.toLowerCase()
      : undefined;
  const account = configuredAccount ?? environmentAccount;
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (
    !account ||
    !accountIdPattern.test(account) ||
    (environmentAccount &&
      configuredAccount &&
      environmentAccount !== configuredAccount) ||
    !token
  ) {
    warn(
      'configure workers.dev',
      'Workers Builds credentials are unavailable or ambiguous',
    );
    return null;
  }

  const base = `${publicApi}/accounts/${account}/workers`;

  /**
   * @param {string} path
   * @param {string} [method]
   * @param {Record<string, unknown>} [body]
   */
  async function request(path, method = 'GET', body) {
    try {
      const response = await fetch(`${base}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body && JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success === true && payload.result)
        return { result: payload.result };

      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      const code =
        errors.length === 1 && Number.isSafeInteger(errors[0]?.code)
          ? errors[0].code
          : undefined;
      return {
        status: response.status,
        code,
        detail: `HTTP ${response.status}${code === undefined ? '' : `, code ${code}`}`,
      };
    } catch {
      return { detail: 'Cloudflare API could not be reached' };
    }
  }

  return {
    async prepare() {
      const current = await request('subdomain');
      if (current.result) return;
      if (
        current.code !== missingSubdomain ||
        current.status === 401 ||
        current.status === 403
      ) {
        warn(
          'check the account workers.dev subdomain',
          current.detail ?? 'Unexpected Cloudflare response',
        );
        return;
      }

      const suffix = createHash('sha256')
        .update(account)
        .digest('hex')
        .slice(0, 12);
      const registration = await request('subdomain', 'PUT', {
        subdomain: `linkrovia-${suffix}`,
      });
      if (!registration.result)
        warn(
          'register the account workers.dev subdomain',
          registration.detail ?? 'Unexpected Cloudflare response',
        );
    },

    /** @param {string} workerName */
    async publish(workerName) {
      if (typeof workerName !== 'string' || !workerLabel.test(workerName))
        return undefined;

      const metadata = `workers/${workerName}`;
      let worker = await request(metadata);
      const route = worker.result?.subdomain;
      if (route?.enabled === false) {
        const update = await request(
          `scripts/${workerName}/subdomain`,
          'POST',
          {
            enabled: true,
            previews_enabled: config.preview_urls ?? route.previews_enabled,
          },
        );
        if (!update.result) {
          warn(
            'enable the Worker workers.dev address',
            update.detail ?? 'Unexpected Cloudflare response',
          );
          return undefined;
        }
        worker = await request(metadata);
      }

      const published = worker.result?.subdomain;
      const match =
        typeof published?.url === 'string' &&
        workersDevOrigin.exec(published.url);
      if (
        published?.enabled === true &&
        match &&
        match[1].toLowerCase() === workerName.toLowerCase()
      )
        return published.url.replace(/\/$/, '');

      warn(
        'confirm the Worker workers.dev address',
        worker.detail ?? 'Worker route unavailable',
      );
      return undefined;
    },
  };
}
