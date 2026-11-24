import { listDomains, listLinks, type LinkSort } from '$lib/server/links/store';
import { requireSession, shortUrl } from '$lib/server/links/form';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db } = requireSession(event);
  const filters = Object.fromEntries(
    ['q', 'domain', 'tag', 'status'].map((key) => [
      key,
      (event.url.searchParams.get(key) ?? '').slice(0, 200),
    ]),
  ) as Record<'q' | 'domain' | 'tag' | 'status', string>;
  const requestedSort = event.url.searchParams.get('sort');
  const sort: LinkSort =
    requestedSort === 'created_asc' || requestedSort === 'updated_desc'
      ? requestedSort
      : 'created_desc';
  const [result, domains] = await Promise.all([
    listLinks(db, {
      ...filters,
      sort,
      cursor: event.url.searchParams.get('cursor') ?? '',
    }),
    listDomains(db),
  ]);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: event.locals.locale,
    domains,
    filters,
    sort,
    links: result.links.map((link) => ({
      ...link,
      shortUrl: shortUrl(link, event.url),
    })),
    nextCursor: result.nextCursor,
  };
}) satisfies PageServerLoad;
