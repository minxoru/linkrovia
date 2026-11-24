import {
  readDomainConnection,
  setDomainConnection,
} from '$lib/server/domains/connection';
import { checkPublicDns } from '$lib/server/domains/dns';
import { verifyDomainProof } from '$lib/server/domains/proof';
import { isObject } from '$lib/server/links/api-input';
import { payload, problem } from '../../../http';
import { domainChanged, domainMissing, withDomainOwner } from '../../owner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withDomainOwner(event, async (db, session, body) => {
    if (!isObject(body))
      return problem(400, 'invalid_input', 'Provide the verification result.');
    const domain = await readDomainConnection(db, event.params.id);
    if (!domain || domain.isPrimary) return domainMissing();
    const operation = await verifyDomainProof(
      db,
      domain,
      event.url.origin,
      session.csrfToken,
      body.ticket,
      body.proof,
    );
    if (!operation)
      return problem(
        409,
        'invalid_proof',
        'Start the domain check again to obtain a fresh result.',
      );
    const dns = await checkPublicDns(domain.hostname);
    if (dns !== 'public_dns')
      return problem(
        dns === 'dns_unavailable' ? 503 : 409,
        dns,
        'The hostname must resolve publicly before it can serve links.',
      );
    return (await setDomainConnection(
      db,
      domain,
      session.user.id,
      'verify',
      operation,
    ))
      ? payload({ status: 'active' })
      : domainChanged();
  });
