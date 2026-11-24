import { checkCsrfToken } from '$lib/server/auth/session';
import { isMcpEnabled, setMcpEnabled } from '$lib/server/mcp/settings';
import { mcpToolScopes } from '$lib/server/mcp/tools';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function requireOwner({ locals }: RequestEvent) {
  if (!locals.session) redirect(303, '/login');
  if (locals.session.user.role !== 'owner') error(403, 'Forbidden');
  if (!locals.env.DB) error(503, 'Database unavailable');
  return { session: locals.session, db: locals.env.DB };
}

export const load = (async (event) => {
  const { session, db } = requireOwner(event);
  const origin = await managementOrigin(db, event.url, { development: dev });
  return {
    enabled: await isMcpEnabled(db),
    locale: event.locals.locale,
    csrfToken: session.csrfToken,
    endpoint: new URL('/mcp', origin ?? event.url.origin).href,
    tools: Object.entries(mcpToolScopes),
  };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { session, db } = requireOwner(event);
    if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
    const form = await readSmallForm(event.request);
    if (!form) error(400, 'Invalid form');
    if (!checkCsrfToken(form.get('csrfToken'), session.csrfToken))
      error(403, 'Forbidden');
    const enabled = form.get('enabled');
    if (enabled !== 'true' && enabled !== 'false') error(400, 'Invalid form');
    await setMcpEnabled(db, session.user.id, enabled === 'true');
    redirect(303, '/admin/integrations/mcp');
  },
} satisfies Actions;
import { dev } from '$app/env';
import { managementOrigin } from '$lib/server/auth/management-signin';
