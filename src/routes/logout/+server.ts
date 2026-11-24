import { error, redirect } from '@sveltejs/kit';
import {
  checkCsrfToken,
  revokeSession,
  sessionCookie,
} from '$lib/server/auth/session';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { setThemeCookie } from '$lib/server/theme';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({
  request,
  url,
  cookies,
  locals,
}) => {
  if (!requireSameOrigin(request, url)) error(403);
  const form = await readSmallForm(request);
  if (
    !locals.session ||
    !(await checkCsrfToken(form?.get('csrfToken'), locals.session.csrfToken))
  )
    error(403);
  if (!locals.env.DB) error(503);

  await revokeSession(locals.env.DB, cookies.get(sessionCookie));
  cookies.delete(sessionCookie, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  setThemeCookie(cookies, locals.session.user.theme);
  redirect(303, '/login');
};
