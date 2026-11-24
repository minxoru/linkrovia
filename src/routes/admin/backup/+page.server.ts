import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (({ locals, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  if (!locals.session) redirect(303, '/login');
  if (locals.session.user.role !== 'owner') error(403, 'Forbidden');
  return {};
}) satisfies PageServerLoad;
