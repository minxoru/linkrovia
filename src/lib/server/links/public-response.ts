import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { normalizeHostname } from '../security/url-policy';
import { linkUnlockCookie } from './protection';
import { resolveShortLink } from './redirect';

export const publicLinkHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export function publicLinkHostname(url: URL) {
  return normalizeHostname(url.hostname, { allowLoopback: dev });
}

export async function servePublicLink(
  event: RequestEvent,
  token: string,
  resolve: typeof resolveShortLink,
) {
  const { request, url, locals, cookies } = event;
  const hostname = publicLinkHostname(url);
  if (!hostname)
    return new Response(null, { status: 404, headers: publicLinkHeaders });
  if (!locals.env.DB)
    return new Response(null, { status: 503, headers: publicLinkHeaders });

  try {
    const result = await resolve(
      locals.env.DB,
      hostname,
      token,
      request,
      (request as Request & { cf?: IncomingRequestCfProperties }).cf,
      cookies.get(linkUnlockCookie),
      dev ? undefined : locals.env.CLICKS,
    );
    const headers = new Headers(publicLinkHeaders);
    if ('location' in result)
      headers.set('location', new URL(result.location, url).href);
    return new Response(null, { status: result.status, headers });
  } catch {
    console.error('Short link lookup failed');
    return new Response(null, { status: 503, headers: publicLinkHeaders });
  }
}

export function rejectPublicLinkMethod() {
  return new Response(null, {
    status: 405,
    headers: { ...publicLinkHeaders, allow: 'GET, HEAD' },
  });
}
