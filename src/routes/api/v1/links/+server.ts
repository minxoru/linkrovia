import { parseLinkPayload, parseLinkQuery } from '$lib/server/links/api-input';
import {
  createLink,
  getLink,
  listLinkRulesForLinks,
  listLinks,
} from '$lib/server/links/store';
import {
  invalidFields,
  linkConflict,
  payload,
  problem,
  withJson,
  withScope,
} from '../http';
import { linkRepresentation } from './representation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withScope(event, 'links:read', async (db) => {
    const query = parseLinkQuery(event.url.searchParams);
    if ('fieldErrors' in query) return invalidFields(query.fieldErrors);
    const { links, nextCursor } = await listLinks(db, query.filter);
    const rules = await listLinkRulesForLinks(
      db,
      links.map(({ id }) => id),
    );
    const byLink = Map.groupBy(rules, (rule) => rule.linkId);
    return payload({
      data: links.map((link) =>
        linkRepresentation(link, event.url, byLink.get(link.id) ?? []),
      ),
      nextCursor,
      hasMore: nextCursor !== null,
    });
  });

export const POST: RequestHandler = (event) =>
  withScope(event, 'links:write', (db, principal) =>
    withJson(event, async (body) => {
      const parsed = parseLinkPayload(body);
      if ('fieldErrors' in parsed) return invalidFields(parsed.fieldErrors);
      const result = await createLink(db, principal.userId, parsed.input);
      if (!result.ok) return linkConflict(result.code);
      const link = await getLink(db, result.id);
      if (!link)
        return problem(
          500,
          'internal_error',
          'The new link could not be retrieved.',
        );
      const rules = await listLinkRulesForLinks(db, [link.id]);
      return payload(linkRepresentation(link, event.url, rules), {
        status: 201,
        headers: { location: `/api/v1/links/${encodeURIComponent(link.id)}` },
      });
    }),
  );
