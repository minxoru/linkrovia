import {
  conversionActions,
  loadConversions,
} from '$lib/server/conversions/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) =>
  loadConversions(event, event.params.id);

export const actions: Actions = {
  create: (event) => conversionActions.create(event, event.params.id),
  update: (event) => conversionActions.update(event, event.params.id),
  archive: (event) => conversionActions.archive(event, event.params.id),
  tracking: (event) => conversionActions.tracking(event, event.params.id),
};
