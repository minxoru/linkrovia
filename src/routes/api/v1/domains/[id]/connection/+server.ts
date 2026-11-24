import { readDomainConnection } from '$lib/server/domains/connection';
import { payload } from '../../../http';
import { domainMissing, withDomainOwner } from '../../owner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withDomainOwner(event, async (db) => {
    const domain = await readDomainConnection(db, event.params.id);
    if (!domain) return domainMissing();
    const { mappingId: _mappingId, ...view } = domain;
    return payload(view);
  });
