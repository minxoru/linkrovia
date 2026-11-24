import { dev } from '$app/env';
import { managementOrigin } from '$lib/server/auth/management-signin';
import { checkCsrfToken } from '$lib/server/auth/session';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import {
  getTurnstileConfig,
  saveTurnstileConfig,
  turnstileConfigurationStatus,
  verifyTurnstile,
} from '$lib/server/security/turnstile';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function requireOwner({ locals }: RequestEvent) {
  const session = locals.session;
  if (!session) redirect(303, '/login');
  if (session.user.role !== 'owner') error(403, 'Forbidden');
  if (!locals.env.DB) error(503, 'Database unavailable');
  return { session, env: locals.env };
}

async function requireOwnerForm(event: RequestEvent) {
  const { session, env } = requireOwner(event);
  const origin = await managementOrigin(env.DB, event.url, {
    development: dev,
  });
  if (origin && origin !== event.url.origin) error(403, 'Forbidden');
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request);
  if (!form) error(400, 'Invalid form');
  if (!(await checkCsrfToken(form.get('csrfToken'), session.csrfToken)))
    error(403, 'Forbidden');
  return { env, form };
}

function getKeyStatus(
  siteKey: string,
  secretKey: string | undefined,
  hostname: string,
) {
  return turnstileConfigurationStatus({
    siteKey,
    secretKey,
    hostname,
    development: dev,
  });
}

export const load = (async (event) => {
  const { session, env } = requireOwner(event);
  const origin = await managementOrigin(env.DB, event.url, {
    development: dev,
  });
  if (origin && origin !== event.url.origin)
    redirect(303, new URL('/admin/settings/security', origin).href);
  const { enabled, siteKey } = await getTurnstileConfig(env.DB);
  const status = getKeyStatus(
    siteKey,
    env.TURNSTILE_SECRET_KEY,
    event.url.hostname,
  );
  event.setHeaders({ 'cache-control': 'private, no-store' });

  return {
    enabled,
    siteKey: siteKey === env.TURNSTILE_SECRET_KEY?.trim() ? '' : siteKey,
    status,
    locale: event.locals.locale,
    csrfToken: session.csrfToken,
    hostname: event.url.hostname,
  };
}) satisfies PageServerLoad;

export const actions = {
  prepare: async (event) => {
    const { env, form } = await requireOwnerForm(event);
    const siteKey = form.get('siteKey')?.trim() ?? '';
    const status = getKeyStatus(
      siteKey,
      env.TURNSTILE_SECRET_KEY,
      event.url.hostname,
    );
    if (status !== 'ready' && status !== 'test')
      return fail(400, { error: status });
    return { reviewSiteKey: siteKey };
  },

  enable: async (event) => {
    const { env, form } = await requireOwnerForm(event);
    const siteKey = form.get('siteKey')?.trim() ?? '';
    const status = getKeyStatus(
      siteKey,
      env.TURNSTILE_SECRET_KEY,
      event.url.hostname,
    );
    if (status !== 'ready' && status !== 'test')
      return fail(400, { error: status });

    const config = { enabled: true, siteKey };
    const verified = await verifyTurnstile({
      config,
      secretKey: env.TURNSTILE_SECRET_KEY,
      token: form.get('cf-turnstile-response'),
      action: 'security_settings',
      hostname: event.url.hostname,
      development: dev,
      fetch: event.fetch,
    });
    if (!verified)
      return fail(400, {
        error: 'verificationFailed' as const,
        reviewSiteKey: siteKey,
      });

    await saveTurnstileConfig(env.DB, config);
    return { saved: 'enabled' as const };
  },

  disable: async (event) => {
    const { env } = await requireOwnerForm(event);
    const config = await getTurnstileConfig(env.DB);
    const siteKey =
      config.siteKey === env.TURNSTILE_SECRET_KEY?.trim() ? '' : config.siteKey;
    await saveTurnstileConfig(env.DB, { enabled: false, siteKey });
    return { saved: 'disabled' as const };
  },
} satisfies Actions;
