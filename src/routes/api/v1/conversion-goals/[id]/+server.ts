import {
  archiveGoal,
  getGoal,
  parseGoal,
  saveGoal,
} from '$lib/server/conversions/goals';
import { isObject } from '$lib/server/links/api-input';
import {
  invalidFields,
  payload,
  problem,
  withJson,
  withScope,
} from '../../http';
import type { RequestHandler } from './$types';

const missing = () =>
  problem(404, 'goal_not_found', 'The conversion goal could not be found.');

export const PATCH: RequestHandler = (event) =>
  withScope(event, 'conversions:manage', (db) =>
    withJson(event, async (body) => {
      if (!isObject(body) || !Object.keys(body).length)
        return invalidFields({
          body: ['Provide the goal fields you want to change.'],
        });
      const current = await getGoal(db, event.params.id);
      if (!current) return missing();
      const { id, ...fields } = current;
      const input = parseGoal({ ...fields, ...body });
      if (!input) return invalidFields({ body: ['Check the goal fields.'] });
      const goal = await saveGoal(db, input, id, current);
      return goal
        ? payload(goal)
        : problem(
            409,
            'goal_conflict',
            'The goal changed, or the request attempted to change its event identifier or link.',
          );
    }),
  );

export const DELETE: RequestHandler = (event) =>
  withScope(event, 'conversions:manage', async (db) =>
    (await archiveGoal(db, event.params.id))
      ? new Response(null, {
          status: 204,
          headers: { 'cache-control': 'no-store' },
        })
      : missing(),
  );
