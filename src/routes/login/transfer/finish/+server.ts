import { dev } from '$app/env';
import {
  finishManagementSignIn,
  managementOrigin,
  transferCookieOptions,
  transferRedirect,
  transferStateCookie,
} from '$lib/server/auth/management-signin';
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
  if (!locals.session) {
    cookies.delete(transferStateCookie, transferCookieOptions);
    return transferRedirect('/login');
  }
  return transferRedirect(
    await finishManagementSignIn(db, cookies, locals.session.user.id),
  );
};
