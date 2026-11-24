import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { isValidPassword, normalizeEmail } from '$lib/server/auth/credential';
import {
  canEnrollOwner,
  checkSetupToken,
  createSetupProof,
  isConfiguredSetupToken,
  registerOwner,
  setupComplete,
  setupHosts,
  setupProofCookie,
  setupProofMaxAge,
  verifySetupProof,
} from '$lib/server/auth/setup';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { normalizeHostname } from '$lib/server/security/url-policy';
import { passkeyRp } from '$lib/server/auth/passkeys';
import {
  getTurnstileConfig,
  turnstileConfigurationStatus,
  verifyTurnstile,
} from '$lib/server/security/turnstile';
import { parseCloudflareInput } from '$lib/server/domains/cloudflare';
import { domainHostname } from '$lib/server/domains/connection';
import {
  attachSetupCustomDomain,
  rememberSetupDeployment,
  selectDeploymentHostname,
  supportsSetupCustomDomain,
} from '$lib/server/domains/setup-management';
import { messagesFor } from '$lib/i18n/locale';
import type { Actions, PageServerLoad } from './$types';

const cookieOptions = {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
} as const;

export const load = (async ({ cookies, locals, url }) => {
  const locale = locals.locale;
  const methods = {
    passkeyAvailable: !!passkeyRp(url, { development: dev }),
    passwordAvailable: dev,
  };
  const db = locals.env.DB;
  if (!db)
    return {
      locale,
      ...methods,
      step: 'configuration',
      configurationIssue: 'database',
      turnstile: null,
    } as const;
  if (await setupComplete(db))
    error(410, messagesFor(locale)['setup.completed']);

  const secret = locals.env.SETUP_TOKEN;
  if (!isConfiguredSetupToken(secret)) {
    return {
      locale,
      ...methods,
      step: 'configuration',
      configurationIssue: 'token',
      turnstile: null,
    } as const;
  }
  const hosts = await setupHosts(db);
  const hostname = setupHostname(url);
  if (
    !hostname ||
    (hosts?.deployment &&
      hosts.deployment !== hostname &&
      hosts.management !== hostname)
  )
    error(404);

  if (
    await verifySetupProof(cookies.get(setupProofCookie), secret, url.origin)
  ) {
    if (hosts?.management === hostname)
      return {
        locale,
        ...methods,
        step: 'owner',
        turnstile: null,
        analyticsDeferred:
          !dev && !locals.env.CLICKS && !locals.env.ANALYTICS_SQL,
      } as const;
    if (hosts?.deployment === hostname)
      return {
        locale,
        ...methods,
        step: 'management',
        turnstile: null,
        hostname,
        customAvailable: supportsSetupCustomDomain(hostname),
        customSetupUrl: hosts.management
          ? `https://${hosts.management}/setup`
          : null,
      } as const;
  }
  const config = await getTurnstileConfig(db);
  const status = turnstileConfigurationStatus({
    siteKey: config.siteKey,
    secretKey: locals.env.TURNSTILE_SECRET_KEY,
    hostname: url.hostname,
    development: dev,
  });
  const canRenderWidget =
    config.enabled && (status === 'ready' || status === 'test');
  return {
    locale,
    ...methods,
    step: 'token',
    turnstile: canRenderWidget ? { siteKey: config.siteKey } : null,
  } as const;
}) satisfies PageServerLoad;

function setupHostname(url: URL) {
  if ((url.protocol !== 'https:' || url.port) && !dev) return null;
  return normalizeHostname(url.hostname, { allowLoopback: dev });
}

const managementAction =
  (choice: 'deployment' | 'custom'): Actions[string] =>
  async (event) => {
    const { request, url, cookies, locals } = event;
    if (!requireSameOrigin(request, url)) return fail(403, { code: 'csrf' });
    const db = locals.env.DB;
    const hostname = setupHostname(url);
    if (!db || !hostname) return fail(503, { code: 'unavailable' });
    if (
      !(await verifySetupProof(
        cookies.get(setupProofCookie),
        locals.env.SETUP_TOKEN,
        url.origin,
      ))
    )
      return fail(403, { code: 'invalid_token' });
    const hosts = await setupHosts(db);
    if (hosts?.deployment !== hostname || (await setupComplete(db)))
      return fail(409, { code: 'unavailable' });

    if (choice === 'deployment') {
      const choice = await selectDeploymentHostname(db, hostname);
      if (choice !== 'selected') return fail(409, { code: choice });
    } else {
      if (hosts.management) return fail(409, { code: 'domain_changed' });
      if (!(await allowAuthAttempt(event, 'setup-domain')))
        return fail(429, { code: 'rate_limit' });
      const form = await readSmallForm(request);
      const selected = domainHostname(form?.get('hostname'));
      const credentials = parseCloudflareInput({ token: form?.get('token') });
      if (!selected || !credentials || form?.get('confirmed') !== 'on')
        return fail(400, { code: 'invalid_input' });
      const result = await attachSetupCustomDomain(
        db,
        credentials,
        selected,
        hostname,
      );
      if (result.code !== 'attached')
        return fail(
          result.code === 'busy' || result.code === 'domain_changed'
            ? 409
            : 422,
          {
            code: result.code,
          },
        );
    }
    redirect(303, '/setup');
  };

export const actions = {
  useDeployment: managementAction('deployment'),
  connectDomain: managementAction('custom'),
  verify: async (event) => {
    const { request, url, cookies, locals } = event;
    if (!requireSameOrigin(request, url)) return fail(403, { code: 'csrf' });
    const db = locals.env.DB;
    if (!db) return fail(503, { code: 'unavailable' });
    if (await setupComplete(db)) return fail(410, { code: 'unavailable' });

    const secret = locals.env.SETUP_TOKEN;
    if (!isConfiguredSetupToken(secret))
      return fail(503, { code: 'unavailable' });
    if (!(await allowAuthAttempt(event, 'setup-verify')))
      return fail(429, { code: 'rate_limit' });

    const form = await readSmallForm(request);
    if (!form) return fail(400, { code: 'invalid_input' });
    if (
      !(await verifyTurnstile({
        config: await getTurnstileConfig(db),
        secretKey: locals.env.TURNSTILE_SECRET_KEY,
        token: form.get('cf-turnstile-response'),
        action: 'setup',
        hostname: url.hostname,
        development: dev,
        fetch: event.fetch,
      }))
    )
      return fail(403, { code: 'turnstile' });
    if (!(await checkSetupToken(form.get('setupToken'), secret))) {
      return fail(403, { code: 'invalid_token' });
    }

    const hostname = setupHostname(url);
    if (!hostname || !(await rememberSetupDeployment(db, hostname)))
      return fail(409, { code: 'unavailable' });

    cookies.set(setupProofCookie, await createSetupProof(secret, url.origin), {
      ...cookieOptions,
      maxAge: setupProofMaxAge,
    });
    redirect(303, '/setup');
  },
  register: async (event) => {
    if (!dev) return fail(403, { code: 'unavailable' });
    const { request, url, cookies, locals } = event;
    if (!requireSameOrigin(request, url)) return fail(403, { code: 'csrf' });
    const db = locals.env.DB;
    if (!db) return fail(503, { code: 'unavailable' });
    if (await setupComplete(db)) return fail(410, { code: 'unavailable' });
    if (!(await allowAuthAttempt(event, 'setup-register')))
      return fail(429, { code: 'rate_limit' });
    if (
      !(await verifySetupProof(
        cookies.get(setupProofCookie),
        locals.env.SETUP_TOKEN,
        url.origin,
      ))
    ) {
      return fail(403, { code: 'invalid_token' });
    }

    const form = await readSmallForm(request);
    const email = normalizeEmail(form?.get('email'));
    const password = form?.get('password');
    const hostname = setupHostname(url);
    if (
      !email ||
      !hostname ||
      !isValidPassword(password) ||
      password !== form?.get('confirmPassword')
    ) {
      return fail(400, { code: 'invalid_input' });
    }

    if (!(await canEnrollOwner(db, hostname)))
      return fail(409, { code: 'domain_changed' });

    if (
      !(await registerOwner(db, {
        email,
        password,
        locale: locals.locale,
        managementHostname: hostname,
        requireSelectedHostname: true,
      }))
    ) {
      return fail(409, { code: 'unavailable' });
    }
    cookies.delete(setupProofCookie, cookieOptions);
    redirect(303, '/login');
  },
} satisfies Actions;
