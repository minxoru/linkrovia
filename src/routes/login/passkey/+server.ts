import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import { postSignInPath } from '$lib/server/auth/management-signin';
import {
  beginPasskeySignIn,
  finishPasskeySignIn,
  getSignInMethods,
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
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { requireSameOrigin } from '$lib/server/security/request';
import {
  getTurnstileConfig,
  verifyTurnstile,
} from '$lib/server/security/turnstile';
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
  const payload = await readPasskeyRequest(request);
  if (!payload) return json({ code: 'invalid_input' }, { status: 400 });
  if (!(await allowAuthAttempt(event, `login-passkey-${payload.step}`))) {
    return json({ code: 'rate_limit' }, { status: 429 });
  }

  if (payload.step === 'begin') {
    if (!(await getSignInMethods(db, rp)).passkeyAvailable) {
      return json({ code: 'invalid_credentials' }, { status: 403 });
    }
    if (
      !(await verifyTurnstile({
        config: await getTurnstileConfig(db),
        secretKey: locals.env.TURNSTILE_SECRET_KEY,
        token: payload.turnstileToken,
        action: 'login',
        hostname: url.hostname,
        development: dev,
        fetch: event.fetch,
      }))
    ) {
      return json({ code: 'turnstile' }, { status: 403 });
    }
    const started = await beginPasskeySignIn(db, rp);
    cookies.set(passkeyCookie, started.ceremonyToken, {
      ...passkeyCookieOptions,
      maxAge: passkeyMaxAge,
    });
    return json({ options: started.options });
  }

  const ceremonyToken = cookies.get(passkeyCookie);
  cookies.delete(passkeyCookie, passkeyCookieOptions);
  const userId = await finishPasskeySignIn(db, {
    rp,
    ceremonyToken,
    response: payload.response,
  });
  if (!userId) return json({ code: 'invalid_credentials' }, { status: 403 });

  cookies.set(sessionCookie, await createSession(db, userId), {
    ...passkeyCookieOptions,
    sameSite: 'lax',
    maxAge: sessionMaxAge,
  });
  return json({ redirect: postSignInPath(cookies) });
};
