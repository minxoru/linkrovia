import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import { normalizeEmail } from '$lib/server/auth/credential';
import {
  beginOwnerPasskey,
  finishOwnerPasskey,
  passkeyCookie,
  passkeyCookieOptions,
  passkeyMaxAge,
  passkeyRp,
  readPasskeyRequest,
} from '$lib/server/auth/passkeys';
import {
  createSession,
  sessionCookie,
  sessionMaxAge,
} from '$lib/server/auth/session';
import { setupComplete, setupProofCookie } from '$lib/server/auth/setup';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { requireSameOrigin } from '$lib/server/security/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const { request, url, locals, cookies } = event;
  event.setHeaders({ 'cache-control': 'private, no-store' });
  if (!requireSameOrigin(request, url)) {
    return json({ code: 'csrf' }, { status: 403 });
  }
  const db = locals.env.DB;
  const rp = passkeyRp(url, { development: dev });
  if (!db || !rp) return json({ code: 'unavailable' }, { status: 503 });
  if (await setupComplete(db)) {
    return json({ code: 'unavailable' }, { status: 410 });
  }

  const payload = await readPasskeyRequest(request);
  if (!payload) return json({ code: 'invalid_input' }, { status: 400 });
  if (!(await allowAuthAttempt(event, `setup-passkey-${payload.step}`))) {
    return json({ code: 'rate_limit' }, { status: 429 });
  }
  if (!dev && url.port) return json({ code: 'unavailable' }, { status: 403 });
  const authorizedSetup = {
    rp,
    setupProof: cookies.get(setupProofCookie),
    setupSecret: locals.env.SETUP_TOKEN,
    setupOrigin: url.origin,
    requireSelectedHostname: true,
  };

  if (payload.step === 'begin') {
    const email = normalizeEmail(payload.email);
    if (!email) return json({ code: 'invalid_input' }, { status: 400 });
    const started = await beginOwnerPasskey(db, {
      ...authorizedSetup,
      email,
      locale: locals.locale,
    });
    if (!started) return json({ code: 'invalid_token' }, { status: 403 });
    cookies.set(passkeyCookie, started.ceremonyToken, {
      ...passkeyCookieOptions,
      maxAge: passkeyMaxAge,
    });
    return json({ options: started.options });
  }

  const ceremonyToken = cookies.get(passkeyCookie);
  cookies.delete(passkeyCookie, passkeyCookieOptions);
  const created = await finishOwnerPasskey(db, {
    ...authorizedSetup,
    ceremonyToken,
    response: payload.response,
  });
  if (!created) return json({ code: 'invalid_token' }, { status: 403 });

  cookies.delete(setupProofCookie, {
    ...passkeyCookieOptions,
    sameSite: 'lax',
  });
  cookies.set(sessionCookie, await createSession(db, created.userId), {
    ...passkeyCookieOptions,
    sameSite: 'lax',
    maxAge: sessionMaxAge,
  });
  return json({ redirect: '/admin' });
};
