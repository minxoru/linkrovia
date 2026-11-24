import {
  parseSimulationInput,
  simulateLink,
} from '$lib/server/links/simulation';
import {
  invalidFields,
  missingLink,
  payload,
  withJson,
  withScope,
} from '../../../http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withScope(
    event,
    'links:read',
    (db) =>
      withJson(event, async (body) => {
        const parsed = parseSimulationInput(body);
        if ('fieldErrors' in parsed) return invalidFields(parsed.fieldErrors);
        const result = await simulateLink(db, event.params.id, parsed.input);
        return result ? payload(result) : missingLink();
      }),
    { recordUse: false },
  );
