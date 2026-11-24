import { dev } from '$app/env';
import {
  managementOrigin,
  startManagementSignIn,
  transferCookieOptions,
  transferRedirect,
  transferVerifierCookie,
} from '$lib/server/auth/management-signin';
import { managementDomainEnabled } from '$lib/server/domains/connection';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { cookies, locals, url } = event;
  const db = locals.env.DB;
  if (!db || !(await managementDomainEnabled(db, url.hostname))) {
    return new Response(null, { status: 404 });
  }
  const origin = await managementOrigin(db, url, { development: dev });
  if (
    !origin ||
    origin === url.origin ||
    (url.protocol !== 'https:' && !(dev && origin.startsWith('http://'))) ||
    (!dev && url.port)
  ) {
    return transferRedirect('/login');
  }
  if (locals.session) return transferRedirect('/admin');
  if (!(await allowAuthAttempt(event, 'management-signin-start'))) {
    return new Response(null, { status: 429 });
  }
  const flow = await startManagementSignIn(db, url);
  if (!flow) return new Response(null, { status: 429 });

  cookies.set(transferVerifierCookie, flow.verifier, transferCookieOptions);
  const destination = new URL('/login/transfer/authorize', origin);
  destination.searchParams.set('state', flow.state);
  return transferRedirect(destination);
};
