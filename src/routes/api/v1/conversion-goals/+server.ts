import { listGoals, parseGoal, saveGoal } from '$lib/server/conversions/goals';
import { invalidFields, payload, problem, withJson, withScope } from '../http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withScope(event, 'analytics:read', async (db) =>
    payload({ data: await listGoals(db) }),
  );

export const POST: RequestHandler = (event) =>
  withScope(event, 'conversions:manage', (db) =>
    withJson(event, async (body) => {
      const input = parseGoal(body);
      if (!input)
        return invalidFields({
          body: [
            'Check the goal name, event identifier, link, and attribution window.',
          ],
        });
      const goal = await saveGoal(db, input);
      return goal
        ? payload(goal, { status: 201 })
        : problem(
            409,
            'goal_conflict',
            'The event already exists for this link, the goal limit was reached, or the link is unavailable.',
          );
    }),
  );
