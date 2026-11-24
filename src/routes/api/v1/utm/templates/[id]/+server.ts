import { isEpochSecond, isObject } from '$lib/server/links/api-input';
import {
  deleteUtmTemplate,
  getUtmTemplate,
  updateUtmTemplate,
} from '$lib/server/utm/templates';
import { invalidFields, withJson, withScope } from '../../../http';
import { missingTemplate, staleTemplate, templateResponse } from '../response';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
  withScope(event, 'links:write', (db) =>
    withJson(event, async (body) => {
      if (
        !isObject(body) ||
        Object.keys(body).some(
          (key) =>
            !['updatedAt', 'name', 'description', 'values'].includes(key),
        )
      ) {
        return invalidFields({
          body: ['Provide the template fields you want to change.'],
        });
      }
      const { updatedAt, ...fields } = body;
      if (!isEpochSecond(updatedAt) || updatedAt < 0)
        return invalidFields({
          updatedAt: ['Provide the current updatedAt value.'],
        });

      const current = await getUtmTemplate(db, event.params.id);
      if (!current) return missingTemplate();
      if (current.updatedAt !== updatedAt) return staleTemplate();
      return templateResponse(
        await updateUtmTemplate(db, current.id, updatedAt, {
          name: current.name,
          description: current.description,
          values: current.values,
          ...fields,
        }),
        200,
      );
    }),
  );

export const DELETE: RequestHandler = (event) =>
  withScope(event, 'links:write', async (db) => {
    const versions = event.url.searchParams.getAll('updatedAt');
    if (versions.length !== 1 || !/^\d{1,13}$/.test(versions[0])) {
      return invalidFields({
        updatedAt: [
          'Provide the current updatedAt value as a query parameter.',
        ],
      });
    }
    const expected = Number(versions[0]);
    const template = await getUtmTemplate(db, event.params.id);
    if (!template) return missingTemplate();
    if (
      template.updatedAt !== expected ||
      !(await deleteUtmTemplate(db, template.id, expected))
    )
      return staleTemplate();
    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    });
  });
