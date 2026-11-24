import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { postSignInPath } from '$lib/server/auth/management-signin';
import { setupComplete } from '$lib/server/auth/setup';
import { getSignInMethods, passkeyRp } from '$lib/server/auth/passkeys';
import {
  authenticate,
  createSession,
  sessionCookie,
  sessionMaxAge,
} from '$lib/server/auth/session';
import { managementDomainEnabled } from '$lib/server/domains/connection';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import {
  getTurnstileConfig,
  turnstileConfigurationStatus,
  verifyTurnstile,
} from '$lib/server/security/turnstile';
import { messagesFor } from '$lib/i18n/locale';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ cookies, locals, url }) => {
  const db = locals.env.DB;
  if (!db) error(503, messagesFor(locals.locale)['error.unavailable']);
  if (!(await setupComplete(db))) redirect(303, '/setup');
  const transferAvailable = await managementDomainEnabled(db, url.hostname);
  if (locals.session) {
    redirect(303, transferAvailable ? '/admin' : postSignInPath(cookies));
  }
  if (transferAvailable) {
    return {
      locale: locals.locale,
      transferAvailable,
      passkeyAvailable: false,
      passwordAvailable: false,
      turnstile: null,
    };
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
    locale: locals.locale,
    transferAvailable,
    ...(await getSignInMethods(db, passkeyRp(url, { development: dev }))),
    turnstile: canRenderWidget ? { siteKey: config.siteKey } : null,
  };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { request, url, cookies, locals } = event;
    if (!requireSameOrigin(request, url)) return fail(403, { code: 'csrf' });
    const db = locals.env.DB;
    if (!db) return fail(503, { code: 'unavailable' });
    if (!(await setupComplete(db)))
      return fail(409, { code: 'setup_required' });
    if (!(await getSignInMethods(db, null)).passwordAvailable) {
      return fail(403, { code: 'invalid_credentials' });
    }
    if (!(await allowAuthAttempt(event, 'login')))
      return fail(429, { code: 'rate_limit' });
    const form = await readSmallForm(request);
    if (!form) return fail(400, { code: 'invalid_input' });

    if (
      !(await verifyTurnstile({
        config: await getTurnstileConfig(db),
        secretKey: locals.env.TURNSTILE_SECRET_KEY,
        token: form.get('cf-turnstile-response'),
        action: 'login',
        hostname: url.hostname,
        development: dev,
        fetch: event.fetch,
      }))
    )
      return fail(403, { code: 'turnstile' });

    const userId = await authenticate(
      db,
      form.get('email'),
      form.get('password'),
    );
    if (!userId) return fail(403, { code: 'invalid_credentials' });
    cookies.set(sessionCookie, await createSession(db, userId), {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: sessionMaxAge,
    });
    redirect(303, postSignInPath(cookies));
  },
} satisfies Actions;
