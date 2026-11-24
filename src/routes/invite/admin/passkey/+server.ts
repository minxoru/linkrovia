import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import {
  beginInvitedPasskey,
  finishInvitedPasskey,
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
import type { RequestHandler } from './$types';

const invitePasskeyCookie = '__Host-linkrovia_invite_passkey';

export const POST: RequestHandler = async (event) => {
  const { request, url, locals, cookies } = event;
  if (!requireSameOrigin(request, url))
    return json({ code: 'csrf' }, { status: 403 });
  if (locals.session) return json({ code: 'signed_in' }, { status: 409 });
  const db = locals.env.DB;
  const rp = passkeyRp(url, { development: dev });
  if (!db || !rp) return json({ code: 'unavailable' }, { status: 503 });

  const payload = await readPasskeyRequest(request);
  if (!payload) return json({ code: 'invalid_input' }, { status: 400 });
  if (!(await allowAuthAttempt(event, `invite-passkey-${payload.step}`)))
    return json({ code: 'rate_limit' }, { status: 429 });

  if (payload.step === 'begin') {
    const started = await beginInvitedPasskey(db, {
      rp,
      code: payload.code,
      locale: locals.locale,
    });
    if (!started) return json({ code: 'invalid_token' }, { status: 403 });
    cookies.set(invitePasskeyCookie, started.ceremonyToken, {
      ...passkeyCookieOptions,
      maxAge: passkeyMaxAge,
    });
    return json({ options: started.options });
  }

  const ceremonyToken = cookies.get(invitePasskeyCookie);
  cookies.delete(invitePasskeyCookie, passkeyCookieOptions);
  const userId = await finishInvitedPasskey(db, {
    rp,
    code: payload.code,
    ceremonyToken,
    response: payload.response,
  });
  if (!userId) return json({ code: 'invalid_token' }, { status: 403 });
  try {
    cookies.set(sessionCookie, await createSession(db, userId), {
      ...passkeyCookieOptions,
      sameSite: 'lax',
      maxAge: sessionMaxAge,
    });
  } catch {
    // Enrollment committed independently of the session. The passkey can
    // already authenticate, so prompt the recipient to sign in directly.
    return json({ code: 'registered_without_session' }, { status: 503 });
  }
  return json({ redirect: '/admin' });
};
