import { parseLinkPayload } from '$lib/server/links/api-input';
import {
  getLink,
  listLinkRules,
  removeLink,
  updateLink,
} from '$lib/server/links/store';
import {
  invalidFields,
  linkConflict,
  missingLink,
  payload,
  staleLink,
  withJson,
  withScope,
} from '../../http';
import { linkRepresentation } from '../representation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withScope(event, 'links:read', async (db) => {
    const link = await getLink(db, event.params.id);
    if (!link) return missingLink();
    return payload(
      linkRepresentation(link, event.url, await listLinkRules(db, link.id)),
    );
  });

export const PATCH: RequestHandler = (event) =>
  withScope(event, 'links:write', (db, principal) =>
    withJson(event, async (body) => {
      const link = await getLink(db, event.params.id);
      if (!link) return missingLink();

      const parsed = parseLinkPayload(body, link);
      if ('fieldErrors' in parsed) return invalidFields(parsed.fieldErrors);
      if (parsed.expected !== link.updatedAt) return staleLink();
      const result = await updateLink(
        db,
        principal.userId,
        link.id,
        parsed.expected,
        parsed.input,
      );
      if (!result.ok) return linkConflict(result.code);

      const saved = await getLink(db, result.id);
      if (!saved) return missingLink();
      return payload(
        linkRepresentation(saved, event.url, await listLinkRules(db, saved.id)),
      );
    }),
  );

export const DELETE: RequestHandler = (event) =>
  withScope(event, 'links:write', async (db, principal) => {
    const versions = event.url.searchParams.getAll('updatedAt');
    if (versions.length !== 1 || !/^\d{1,13}$/.test(versions[0])) {
      return invalidFields({
        updatedAt: [
          'Provide the current updatedAt value as a query parameter.',
        ],
      });
    }
    const link = await getLink(db, event.params.id);
    if (!link) return missingLink();

    if (
      Number(versions[0]) !== link.updatedAt ||
      !(await removeLink(db, principal.userId, link.id, link.updatedAt))
    )
      return staleLink();
    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    });
  });
