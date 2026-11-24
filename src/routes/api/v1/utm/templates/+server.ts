import { createUtmTemplate, listUtmTemplates } from '$lib/server/utm/templates';
import { payload, withJson, withScope } from '../../http';
import type { RequestHandler } from './$types';
import { templateResponse } from './response';

export const GET: RequestHandler = (event) =>
  withScope(event, 'links:read', async (db) =>
    payload({ data: await listUtmTemplates(db) }),
  );

export const POST: RequestHandler = (event) =>
  withScope(event, 'links:write', (db, principal) =>
    withJson(event, async (body) =>
      templateResponse(
        await createUtmTemplate(db, principal.userId, body),
        201,
      ),
    ),
  );
