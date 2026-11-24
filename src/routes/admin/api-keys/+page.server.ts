import {
  apiKeyScopes,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '$lib/server/auth/api-keys';
import { checkCsrfToken } from '$lib/server/auth/session';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const expiryOptions = ['30', '90', '365', 'never'] as const;

function requireSession({ locals }: RequestEvent) {
  if (!locals.session) redirect(303, '/login');
  if (!locals.env.DB) error(503, 'Database unavailable');
  return { session: locals.session, db: locals.env.DB };
}

async function readAuthorizedForm(event: RequestEvent) {
  const { session, db } = requireSession(event);
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request);
  if (!form) error(400, 'Invalid form');
  if (!checkCsrfToken(form.get('csrfToken'), session.csrfToken)) {
    error(403, 'Forbidden');
  }
  return { form, db, userId: session.user.id };
}

export const load = (async (event) => {
  const { session, db } = requireSession(event);
  return {
    keys: await listApiKeys(db, session.user.id),
    availableScopes: apiKeyScopes,
    expiryOptions,
    now: Math.floor(Date.now() / 1000),
  };
}) satisfies PageServerLoad;

export const actions = {
  create: async (event) => {
    const { form, db, userId } = await readAuthorizedForm(event);
    const expiry = expiryOptions.find((value) => value === form.get('expiry'));
    if (!expiry) return fail(400, { issue: 'invalid' as const });

    const expiresAt =
      expiry === 'never'
        ? null
        : Math.floor(Date.now() / 1000) + Number(expiry) * 86_400;
    const key = await createApiKey(db, userId, {
      name: form.get('name') ?? '',
      scopes: form.getAll('scope'),
      expiresAt,
    });
    if (!key) return fail(400, { issue: 'invalid' as const });
    return { newToken: key.token };
  },
  revoke: async (event) => {
    const { form, db, userId } = await readAuthorizedForm(event);
    const id = form.get('id');
    if (!id || id.length !== 36 || !(await revokeApiKey(db, userId, id))) {
      return fail(404, { issue: 'missing' as const });
    }
    return { revoked: true as const };
  },
} satisfies Actions;
