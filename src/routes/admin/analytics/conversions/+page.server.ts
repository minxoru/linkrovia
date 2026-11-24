import { redirect } from '@sveltejs/kit';
import {
  conversionActions,
  loadConversions,
  requestedLinkConversions,
} from '$lib/server/conversions/admin';
import { requireSession } from '$lib/server/links/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (event.url.searchParams.has('linkId')) {
    const { db } = requireSession(event);
    redirect(303, await requestedLinkConversions(db, event.url.searchParams));
  }
  return loadConversions(event);
};

export const actions: Actions = conversionActions;
