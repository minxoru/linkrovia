import { dev } from '$app/env';
import {
  finishManagementSignIn,
  managementOrigin,
  pendingManagementSignIn,
  transferCookieOptions,
  transferRedirect,
  transferStateCookie,
} from '$lib/server/auth/management-signin';
import { managementDomainEnabled } from '$lib/server/domains/connection';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({
  cookies,
  locals,
  request,
  url,
}) => {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  }
  const db = locals.env.DB;
  if (
    !db ||
    (await managementOrigin(db, url, { development: dev })) !== url.origin
  ) {
    return new Response(null, { status: 404 });
  }
  const state = url.searchParams.get('state');
  const target = state && (await pendingManagementSignIn(db, state));
  if (!target || !(await managementDomainEnabled(db, target.hostname))) {
    cookies.delete(transferStateCookie, transferCookieOptions);
    return transferRedirect('/login');
  }
  cookies.set(transferStateCookie, state, transferCookieOptions);
  if (!locals.session) return transferRedirect('/login');
  return transferRedirect(
    await finishManagementSignIn(db, cookies, locals.session.user.id),
  );
};
