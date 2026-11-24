import { error, fail } from '@sveltejs/kit';
import { requireForm } from '$lib/server/links/form';
import { simulateLink } from '$lib/server/links/simulation';
import { getLink } from '$lib/server/links/store';
import { parseSimulationForm, simulationFields } from './form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const { linkContext } = await parent();
  if (!linkContext) error(404, 'Not found');
  return { limits: simulationFields };
};

export const actions = {
  default: async (event) => {
    const { db, form } = await requireForm(event);
    const parsed = parseSimulationForm(form);
    if (!parsed.input) return fail(400, parsed);

    const id = event.params.id;
    const result = await simulateLink(db, id, parsed.input);
    if (!result) error(404, 'Not found');
    const link = result.destinationUrl ? await getLink(db, id) : null;
    if (result.destinationUrl && !link) error(404, 'Not found');
    return {
      values: parsed.values,
      result,
      redirectStatus: link?.redirectType ?? null,
    };
  },
} satisfies Actions;
