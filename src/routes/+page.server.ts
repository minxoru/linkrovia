import { dev } from '$app/env';
import { fail, redirect } from '@sveltejs/kit';
import { localeCookie } from '$lib/i18n/cookie';
import { isLocale } from '$lib/i18n/locale';
import { setupComplete, setupHosts } from '$lib/server/auth/setup';
import {
  managementDomainEnabled,
  managementHostname,
} from '$lib/server/domains/connection';
import { normalizeHostname } from '$lib/server/security/url-policy';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders, url }) => {
  setHeaders({
    'cache-control': 'private, no-store',
    vary: 'Cookie, Accept-Language',
  });
  const db = locals.env.DB;
  const initialized = db ? await setupComplete(db) : false;
  const hostname = normalizeHostname(url.hostname, { allowLoopback: dev });
  if (
    !dev &&
    db &&
    !initialized &&
    hostname &&
    url.protocol === 'https:' &&
    !url.port
  ) {
    const hosts = await setupHosts(db);
    if (
      !hosts?.deployment ||
      hosts.deployment === hostname ||
      hosts.management === hostname
    ) {
      redirect(302, '/setup');
    }
  }

  const primary = initialized && db ? await managementHostname(db) : null;
  const canSignIn =
    !primary ||
    hostname === primary ||
    (db && hostname && (dev || url.protocol === 'https:')
      ? await managementDomainEnabled(db, hostname)
      : false);
  return {
    locale: locals.locale,
    origin: url.origin,
    initialized,
    canSignIn,
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const locale = (await request.formData()).get('locale');
    if (!isLocale(locale)) return fail(400, { invalidLocale: true });

    cookies.set(localeCookie, locale, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 365,
    });

    redirect(303, '/');
  },
};
