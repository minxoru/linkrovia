import { requireSession, shortUrl } from '$lib/server/links/form';
import { getLink } from '$lib/server/links/store';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const id = 'id' in event.params ? event.params.id : undefined;
  if (typeof id !== 'string') return { linkContext: null };
  const { db } = requireSession(event);
  const link = await getLink(db, id);
  return {
    linkContext: link
      ? { title: link.title, shortUrl: shortUrl(link, event.url) }
      : null,
  };
};
