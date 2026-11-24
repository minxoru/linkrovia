import { isEpochSecond, isObject } from '$lib/server/links/api-input';
import { setLinkProtection } from '$lib/server/links/protection';
import {
  invalidFields,
  missingLink,
  staleLink,
  withJson,
  withScope,
} from '../../../http';
import { getLink } from '$lib/server/links/store';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
  withScope(event, 'links:write', (db, principal) =>
    withJson(event, async (body) => {
      if (
        !isObject(body) ||
        !isEpochSecond(body.updatedAt) ||
        body.updatedAt < 0 ||
        typeof body.mode !== 'string' ||
        (body.password !== undefined && typeof body.password !== 'string')
      )
        return invalidFields({
          body: ['Provide mode, updatedAt, and an optional password.'],
        });
      const link = await getLink(db, event.params.id);
      if (!link) return missingLink();
      const result = await setLinkProtection(
        db,
        principal.userId,
        link.id,
        body.updatedAt,
        body.mode,
        body.password ?? '',
      );
      if (result.ok)
        return new Response(null, {
          status: 204,
          headers: { 'cache-control': 'no-store' },
        });
      if (result.code === 'stale_link') return staleLink();
      if (result.code === 'temporary_redirect')
        return invalidFields({
          redirectType: ['Protected links require 302 or 307.'],
        });
      if (result.code === 'password_required')
        return invalidFields({ password: ['Enter a password.'] });
      return invalidFields({ body: ['Choose a valid mode and password.'] });
    }),
  );
