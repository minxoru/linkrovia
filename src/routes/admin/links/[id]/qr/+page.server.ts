import { error, redirect } from '@sveltejs/kit';
import { requireForm, requireSession } from '$lib/server/links/form';
import {
  ensureDefaultQr,
  getDefaultQr,
  qrLink,
} from '$lib/server/links/qr-store';
import { qrUrl } from '$lib/server/links/qr';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { db } = requireSession(event);
  const link = await qrLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  const qr = await getDefaultQr(db, link.id);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: event.locals.locale,
    link: { id: link.id, slug: link.slug, title: link.title },
    url: qr ? qrUrl(link.hostname, qr.token, event.url) : null,
  };
};
export const actions: Actions = {
  create: async (event) => {
    const { db } = await requireForm(event);
    const link = await qrLink(db, event.params.id);
    if (!link || !(await ensureDefaultQr(db, link.id))) error(404, 'Not found');
    redirect(303, `/admin/links/${encodeURIComponent(link.id)}/qr`);
  },
};
