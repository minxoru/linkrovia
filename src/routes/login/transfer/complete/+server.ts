import {
  consumeManagementSignIn,
  transferCookieOptions,
  transferRedirect,
  transferVerifierCookie,
} from '$lib/server/auth/management-signin';
import {
  createSession,
  sessionCookie,
  sessionMaxAge,
} from '$lib/server/auth/session';
import { managementDomainEnabled } from '$lib/server/domains/connection';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
  const db = locals.env.DB;
  if (!db || !(await managementDomainEnabled(db, url.hostname))) {
    return new Response(null, { status: 404 });
  }
  const verifier = cookies.get(transferVerifierCookie);
  cookies.delete(transferVerifierCookie, transferCookieOptions);
  if (locals.session) return transferRedirect('/admin');
  const userId = await consumeManagementSignIn(
    db,
    url,
    url.searchParams.get('code'),
    verifier,
  );
  if (!userId) return transferRedirect('/login');

  cookies.set(sessionCookie, await createSession(db, userId), {
    ...transferCookieOptions,
    maxAge: sessionMaxAge,
  });
  return transferRedirect('/admin');
};
