import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n/locale';
import { checkCsrfToken } from '$lib/server/auth/session';
import {
  getDefaultLocale,
  parseDefaultLocale,
} from '$lib/server/db/preferences';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { setThemeCookie } from '$lib/server/theme';
import { isTheme, resolveTheme } from '$lib/theme/theme';
import { isTimeZone, timeZones } from '$lib/timezone/timezone';
import type { Actions, PageServerLoad } from './$types';

function authorize(event: RequestEvent) {
  if (!event.locals.session) redirect(303, '/login');
  if (!event.locals.env?.DB) error(503, 'Database unavailable');
  return { session: event.locals.session, db: event.locals.env.DB };
}
async function authorizeForm(event: RequestEvent) {
  const auth = authorize(event);
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request);
  if (!form) error(400, 'Invalid form');
  if (!checkCsrfToken(form.get('csrfToken'), auth.session.csrfToken))
    error(403, 'Forbidden');
  return { ...auth, form };
}
export const load = (async (event) => {
  const { db, session } = authorize(event);
  const { results } = await db
    .prepare(
      "SELECT key, json_value FROM app_settings WHERE key IN ('default_timezone', 'default_locale')",
    )
    .all<{ key: string; json_value: string }>();
  const defaults = new Map(results.map((row) => [row.key, row.json_value]));
  let defaultZone: unknown;
  try {
    defaultZone = JSON.parse(defaults.get('default_timezone') ?? 'null');
  } catch {
    defaultZone = null;
  }
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: event.locals.locale,
    userZone: session.user.timezone ?? '',
    theme: resolveTheme(session.user.theme, undefined),
    defaultZone: isTimeZone(defaultZone) ? defaultZone : 'UTC',
    defaultLocale: parseDefaultLocale(defaults.get('default_locale')),
    timeZones,
    previewAt: Date.now(),
    isOwner: session.user.role === 'owner',
    saved: event.url.searchParams.get('saved'),
  };
}) satisfies PageServerLoad;
export const actions = {
  personal: async (event) => {
    const { session, db, form } = await authorizeForm(event);
    const locale = form.get('locale');
    const timezone = form.get('timezone')?.trim() ?? '';
    const theme = form.get('theme') ?? session.user.theme;
    if (
      !isLocale(locale) ||
      !isTheme(theme) ||
      (timezone !== '' && !isTimeZone(timezone))
    )
      return fail(400, { code: 'invalid', section: 'personal' });
    await db
      .prepare(
        'UPDATE users SET locale = ?, timezone = ?, theme = ?, updated_at = unixepoch() WHERE id = ? AND disabled_at IS NULL',
      )
      .bind(locale, timezone || null, theme, session.user.id)
      .run();
    setThemeCookie(event.cookies, theme);
    redirect(303, '/admin/settings?saved=personal');
  },
  defaultZone: async (event) => {
    const { session, db, form } = await authorizeForm(event);
    if (session.user.role !== 'owner') error(403, 'Forbidden');
    const timezone = form.get('timezone')?.trim() ?? '';
    const defaultLocale =
      form.get('defaultLocale') ?? (await getDefaultLocale(db));
    if (!isTimeZone(timezone) || !isLocale(defaultLocale))
      return fail(400, { code: 'invalid', section: 'global' });
    await db
      .prepare(
        `INSERT INTO app_settings (key, json_value) VALUES ('default_timezone', ?), ('default_locale', ?)
         ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value, updated_at = unixepoch()`,
      )
      .bind(JSON.stringify(timezone), JSON.stringify(defaultLocale))
      .run();
    redirect(303, '/admin/settings?saved=global');
  },
} satisfies Actions;
