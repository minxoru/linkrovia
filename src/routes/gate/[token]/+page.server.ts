import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { randomHex } from '$lib/server/auth/crypto';
import { checkCsrfToken } from '$lib/server/auth/session';
import { publicLinkHostname } from '$lib/server/links/public-response';
import {
  gateTokenPattern,
  isOneTime,
  linkUnlockCookie,
  linkUnlockSeconds,
  needsPassword,
} from '$lib/server/links/protection';
import {
  loadLinkGate,
  unlockedGatePath,
  unlockLinkGate,
} from '$lib/server/links/redirect';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import {
  getTurnstileConfig,
  turnstileConfigurationStatus,
  verifyTurnstile,
} from '$lib/server/security/turnstile';
import { protectionMessages } from '$lib/i18n/protection';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const csrfCookie = '__Host-linkrovia_gate_csrf';
const cookieOptions = {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
} as const;

async function getGate(event: RequestEvent) {
  const m = protectionMessages(event.locals.locale);
  const hostname = publicLinkHostname(event.url);
  if (!hostname) error(404, m.unavailable);
  const db = event.locals.env.DB;
  if (!db) error(503, m.unavailable);
  const gate = await loadLinkGate(db, hostname, event.params.token);
  if ('status' in gate) error(gate.status, m.unavailable);
  return { db, gate };
}

export const load = (async (event) => {
  const { cookies, locals, url } = event;
  const { db, gate } = await getGate(event);
  const config = await getTurnstileConfig(db);
  const status = turnstileConfigurationStatus({
    siteKey: config.siteKey,
    secretKey: locals.env.TURNSTILE_SECRET_KEY,
    hostname: url.hostname,
    development: dev,
  });
  if (config.enabled && status !== 'test' && status !== 'ready')
    error(503, protectionMessages(locals.locale).unavailable);

  let csrfToken = cookies.get(csrfCookie);
  if (!csrfToken || !gateTokenPattern.test(csrfToken)) {
    csrfToken = randomHex(32);
    cookies.set(csrfCookie, csrfToken, { ...cookieOptions, maxAge: 900 });
  }
  return {
    locale: locals.locale,
    csrfToken,
    needsPassword: needsPassword(gate.link.protectionMode),
    oneTime: isOneTime(gate.link.protectionMode),
    turnstile: config.enabled ? { siteKey: config.siteKey } : null,
    nextPath:
      url.searchParams.get('continue') === '1'
        ? await unlockedGatePath(db, gate, cookies.get(linkUnlockCookie))
        : null,
  };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { request, url, cookies, locals } = event;
    if (!requireSameOrigin(request, url)) return fail(403, { code: 'csrf' });
    const form = await readSmallForm(request, 4096);
    if (
      !form ||
      !checkCsrfToken(form.get('csrfToken'), cookies.get(csrfCookie) ?? '')
    )
      return fail(403, { code: 'csrf' });

    const { db, gate } = await getGate(event);
    if (!(await allowAuthAttempt(event, `link-gate:${gate.link.id}`)))
      return fail(429, { code: 'rate_limit' });
    if (
      !(await verifyTurnstile({
        config: await getTurnstileConfig(db),
        secretKey: locals.env.TURNSTILE_SECRET_KEY,
        token: form.get('cf-turnstile-response'),
        action: 'link_gate',
        hostname: url.hostname,
        development: dev,
        fetch: event.fetch,
      }))
    )
      return fail(403, { code: 'turnstile' });

    const unlocked = await unlockLinkGate(db, gate, form.get('password') ?? '');
    if (!unlocked) return fail(403, { code: 'invalid_credentials' });
    cookies.set(linkUnlockCookie, unlocked.token, {
      ...cookieOptions,
      maxAge: linkUnlockSeconds,
    });
    // End the form navigation on this origin before starting an outbound GET.
    redirect(303, `${url.pathname}?continue=1`);
  },
} satisfies Actions;
