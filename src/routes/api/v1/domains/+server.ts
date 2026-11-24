import { isObject } from '$lib/server/links/api-input';
import { addDraftDomain, listDomains } from '$lib/server/links/store';
import { normalizeHostname } from '$lib/server/security/url-policy';
import { invalidFields, payload, problem, withJson, withScope } from '../http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withScope(event, 'links:read', async (db) =>
    payload({ data: await listDomains(db) }),
  );

export const POST: RequestHandler = (event) =>
  withScope(event, 'domains:write', (db) =>
    withJson(event, async (body) => {
      if (
        !isObject(body) ||
        Object.keys(body).length !== 1 ||
        typeof body.hostname !== 'string' ||
        body.hostname.includes(':')
      ) {
        return invalidFields({
          hostname: ['Enter a public hostname without a port.'],
        });
      }
      const hostname = normalizeHostname(body.hostname.trim());
      if (!hostname)
        return invalidFields({
          hostname: ['Enter a public hostname without a port.'],
        });
      if (!(await addDraftDomain(db, hostname))) {
        return problem(
          409,
          'hostname_conflict',
          'The hostname is already registered.',
        );
      }
      const domain = (await listDomains(db)).find(
        (domain) => domain.hostname === hostname,
      );
      if (!domain)
        return problem(
          500,
          'internal_error',
          'The draft domain could not be retrieved.',
        );
      return payload(domain, { status: 201 });
    }),
  );
