import { dev } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { getEffectiveTimeZone } from '$lib/server/db/preferences';
import { messagesFor } from '$lib/i18n/locale';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
  if (!locals.session) redirect(303, '/login');
  if (!locals.env.DB)
    error(503, messagesFor(locals.locale)['error.unavailable']);
  const { user, csrfToken } = locals.session;
  return {
    locale: locals.locale,
    user: { email: user.email, role: user.role },
    csrfToken,
    timeZone: await getEffectiveTimeZone(getDb(locals.env.DB), user.timezone),
    analyticsDeferred: !dev && !locals.env.CLICKS && !locals.env.ANALYTICS_SQL,
  };
}) satisfies LayoutServerLoad;
