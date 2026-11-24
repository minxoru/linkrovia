import { fail, redirect } from '@sveltejs/kit';
import { createLink, listDomains } from '$lib/server/links/store';
import {
  effectiveTimeZone,
  parseLinkForm,
  requireForm,
  requireSession,
} from '$lib/server/links/form';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: event.locals.locale,
    domains: await listDomains(db),
    link: null,
    timeZone: await effectiveTimeZone(db, session.user.timezone),
  };
}) satisfies PageServerLoad;
export const actions = {
  default: async (event) => {
    const { db, session, form } = await requireForm(event);
    const parsed = await parseLinkForm(
      form,
      db,
      await effectiveTimeZone(db, session.user.timezone),
      false,
    );
    if ('code' in parsed) return fail(400, parsed);
    const result = await createLink(db, session.user.id, parsed.input);
    if (!result.ok)
      return fail(400, { code: result.code, values: parsed.values });
    redirect(303, `/admin/links/${result.id}`);
  },
} satisfies Actions;
