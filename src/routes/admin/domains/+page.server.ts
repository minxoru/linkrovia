import { fail, redirect, error } from '@sveltejs/kit';
import { listDomains, addDraftDomain } from '$lib/server/links/store';
import { requireForm, requireSession } from '$lib/server/links/form';
import {
  domainHostname,
  managementHostname,
} from '$lib/server/domains/connection';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const [domains, primary] = await Promise.all([
    listDomains(db),
    managementHostname(db),
  ]);
  return {
    locale: event.locals.locale,
    domains,
    managementHostname: primary ?? null,
    isOwner: session.user.role === 'owner',
  };
}) satisfies PageServerLoad;
export const actions = {
  default: async (event) => {
    const { db, session, form } = await requireForm(event);
    const raw = (form.get('hostname') ?? '').trim().slice(0, 1024);
    const hostname = domainHostname(raw);
    if (!hostname || raw.includes(':'))
      return fail(400, { code: 'invalid_input', hostname: raw });
    if (session.user.role !== 'owner') error(403, 'Forbidden');
    if (!(await addDraftDomain(db, hostname)))
      return fail(400, { code: 'duplicate', hostname: raw });
    const domain = (await listDomains(db)).find(
      (item) => item.hostname === hostname,
    );
    if (!domain) return fail(500, { code: 'internal_error', hostname: raw });
    redirect(303, `/admin/domains/${encodeURIComponent(domain.id)}/connect`);
  },
} satisfies Actions;
