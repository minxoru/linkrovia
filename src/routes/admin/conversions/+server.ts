import { redirect } from '@sveltejs/kit';
import { requestedLinkConversions } from '$lib/server/conversions/admin';
import { requireSession } from '$lib/server/links/form';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { db } = requireSession(event);
  redirect(303, await requestedLinkConversions(db, event.url.searchParams));
};
