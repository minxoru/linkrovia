import { error, fail, redirect } from '@sveltejs/kit';
import {
  getLink,
  listDomains,
  removeLink,
  updateLink,
} from '$lib/server/links/store';
import {
  effectiveTimeZone,
  parseLinkForm,
  requireForm,
  requireSession,
  shortUrl,
} from '$lib/server/links/form';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  const link = await getLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: event.locals.locale,
    domains: await listDomains(db),
    link: { ...link, shortUrl: shortUrl(link, event.url) },
    timeZone: await effectiveTimeZone(db, session.user.timezone),
  };
}) satisfies PageServerLoad;
function expected(value: string | null) {
  return value && /^\d{1,12}$/.test(value) ? Number(value) : null;
}
export const actions = {
  save: async (event) => {
    const { db, session, form } = await requireForm(event);
    const stamp = expected(form.get('updatedAt'));
    const parsed = await parseLinkForm(
      form,
      db,
      await effectiveTimeZone(db, session.user.timezone),
      true,
    );
    if ('code' in parsed) return fail(400, parsed);
    if (stamp === null)
      return fail(400, { code: 'invalid_input', values: parsed.values });
    const result = await updateLink(
      db,
      session.user.id,
      event.params.id,
      stamp,
      parsed.input,
    );
    if (!result.ok)
      return fail(result.code === 'stale_link' ? 409 : 400, {
        code: result.code === 'stale_link' ? 'conflict' : result.code,
        values: parsed.values,
      });
    redirect(303, `/admin/links/${result.id}`);
  },
  remove: async (event) => {
    const { db, session, form } = await requireForm(event);
    const stamp = expected(form.get('updatedAt'));
    if (stamp === null) return fail(400, { code: 'invalid_input' });
    if (!(await removeLink(db, session.user.id, event.params.id, stamp)))
      return fail(409, { code: 'conflict' });
    redirect(303, '/admin/links');
  },
} satisfies Actions;
