import { dev } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import { loadOperationsHealth } from '$lib/server/operations/health';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, setHeaders }) => {
  if (!locals.session) redirect(303, '/login');
  if (locals.session.user.role !== 'owner') error(403, 'Forbidden');

  setHeaders({ 'cache-control': 'private, no-store' });
  return {
    locale: locals.locale,
    health: await loadOperationsHealth(locals.env, { development: dev }),
  };
}) satisfies PageServerLoad;
