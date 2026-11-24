import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { localeCookie } from '$lib/i18n/cookie';
import { preferredLocale } from '$lib/i18n/locale';
import { getDefaultLocale } from '$lib/server/db/preferences';
import { getSession, sessionCookie } from '$lib/server/auth/session';
import { publicLinkHeaders } from '$lib/server/links/public-response';
import { managementDomainEnabled } from '$lib/server/domains/connection';
import { normalizeHostname } from '$lib/server/security/url-policy';
import { themeCookie } from '$lib/server/theme';
import { resolveTheme } from '$lib/theme/theme';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.env = env;
  const id = event.route.id;
  const mcp = id === '/mcp';
  const management =
    id === '/setup' ||
    id?.startsWith('/setup/') ||
    id === '/login' ||
    id?.startsWith('/login/') ||
    id === '/logout' ||
    id === '/invite/admin' ||
    id === '/invite/admin/passkey' ||
    id === '/admin' ||
    id?.startsWith('/admin/') ||
    id?.startsWith('/api/v1/domains/') ||
    id?.startsWith('/api/v1/backup/') ||
    id === '/api/v1/settings/export';
  if ((management || mcp) && event.locals.env.DB) {
    try {
      const host = await event.locals.env.DB.prepare(
        'SELECT hostname FROM domains WHERE is_primary = 1',
      ).first<string>('hostname');
      const hostname = normalizeHostname(event.url.hostname, {
        allowLoopback: dev,
      });
      if (host && host !== hostname) {
        const customAllowed =
          !mcp &&
          ((id === '/login' && event.request.method === 'GET') ||
            event.url.pathname === '/login/transfer' ||
            event.url.pathname.startsWith('/login/transfer/') ||
            id === '/logout' ||
            id === '/admin' ||
            id?.startsWith('/admin/') ||
            id?.startsWith('/api/v1/domains/') ||
            id?.startsWith('/api/v1/backup/') ||
            id === '/api/v1/settings/export');
        if (
          !hostname ||
          !customAllowed ||
          (event.url.protocol !== 'https:' && !dev) ||
          !(await managementDomainEnabled(event.locals.env.DB, hostname))
        ) {
          return new Response(null, {
            status: 404,
            headers: { 'cache-control': 'no-store' },
          });
        }
      }
    } catch {
      return new Response(null, {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
  }
  const token = management ? event.cookies.get(sessionCookie) : undefined;
  const db = token && event.locals.env.DB;
  event.locals.session = db ? await getSession(db, token) : null;
  const preferred = preferredLocale(
    event.locals.session?.user.locale,
    event.cookies.get(localeCookie),
    event.request.headers.get('accept-language'),
  );
  // The default setting only affects pages rendered without a language preference.
  const rendersPage = management || id === '/' || id === '/gate/[token]';
  const locale =
    preferred ??
    (rendersPage && event.locals.env.DB
      ? await getDefaultLocale(event.locals.env.DB).catch(() => 'en' as const)
      : 'en');
  event.locals.locale = locale;
  const theme = resolveTheme(
    event.locals.session?.user.theme,
    event.cookies.get(themeCookie),
  );
  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace('%linkrovia.locale%', locale)
        .replace('%linkrovia.theme%', theme),
  });
  if (id === '/gate/[token]') {
    const gateResponse = new Response(response.body, response);
    for (const [name, value] of Object.entries(publicLinkHeaders))
      gateResponse.headers.set(name, value);
    // The gate uses same-origin form POSTs and checks the browser's Origin.
    gateResponse.headers.set('referrer-policy', 'same-origin');
    return gateResponse;
  }
  if (!management && !mcp) return response;
  const protectedResponse = new Response(response.body, response);
  protectedResponse.headers.set('cache-control', 'private, no-store');
  protectedResponse.headers.set('x-robots-tag', 'noindex, nofollow');
  protectedResponse.headers.set(
    'referrer-policy',
    event.url.pathname.startsWith('/login/transfer/')
      ? 'no-referrer'
      : 'same-origin',
  );
  return protectedResponse;
};
