import { dev } from '$app/env';
import {
  createAdminInvite,
  disableAdmin,
  listAdminAccess,
  revokeAdminInvite,
} from '$lib/server/auth/admin-invites';
import { normalizeEmail } from '$lib/server/auth/credential';
import { managementOrigin } from '$lib/server/auth/management-signin';
import { passkeyRp } from '$lib/server/auth/passkeys';
import { checkCsrfToken } from '$lib/server/auth/session';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function requireOwner({ locals }: RequestEvent) {
  const session = locals.session;
  if (!session) redirect(303, '/login');
  if (session.user.role !== 'owner') error(403, 'Forbidden');
  if (!locals.env.DB) error(503, 'Database unavailable');
  return { session, db: locals.env.DB };
}

async function ownerForm(event: RequestEvent) {
  const { session, db } = requireOwner(event);
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request);
  if (!form) error(400, 'Invalid form');
  if (!checkCsrfToken(form.get('csrfToken'), session.csrfToken))
    error(403, 'Forbidden');
  return { form, session, db };
}

export const load = (async (event) => {
  const { db } = requireOwner(event);
  const origin = await managementOrigin(db, event.url, { development: dev });
  return {
    ...(await listAdminAccess(db)),
    available:
      passkeyRp(new URL(origin ?? event.url), { development: dev }) !== null,
  };
}) satisfies PageServerLoad;

export const actions = {
  invite: async (event) => {
    const { form, db, session } = await ownerForm(event);
    const origin = await managementOrigin(db, event.url, { development: dev });
    const primary = new URL(origin ?? event.url);
    if (!passkeyRp(primary, { development: dev }))
      return fail(503, { code: 'unavailable' as const });
    const email = normalizeEmail(form.get('email'));
    if (!email) return fail(400, { code: 'invalid_email' as const });
    const code = await createAdminInvite(db, session.user.id, email);
    if (!code) return fail(409, { code: 'duplicate' as const });
    return { inviteUrl: new URL(`/invite/admin#${code}`, primary).href };
  },
  revoke: async (event) => {
    const { form, db, session } = await ownerForm(event);
    const id = form.get('id');
    if (typeof id !== 'string' || id.length !== 36)
      return fail(400, { code: 'invalid_input' as const });
    await revokeAdminInvite(db, session.user.id, id);
    redirect(303, '/admin/settings/admins');
  },
  disable: async (event) => {
    const { form, db, session } = await ownerForm(event);
    const id = form.get('id');
    if (typeof id !== 'string' || id.length !== 36)
      return fail(400, { code: 'invalid_input' as const });
    await disableAdmin(db, session.user.id, id);
    redirect(303, '/admin/settings/admins');
  },
} satisfies Actions;
