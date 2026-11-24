import { readDomainConnection } from '$lib/server/domains/connection';
import { checkPublicDns } from '$lib/server/domains/dns';
import { issueDomainTicket } from '$lib/server/domains/proof';
import { isObject } from '$lib/server/links/api-input';
import { payload, problem } from '../../../http';
import { domainMissing, withDomainOwner } from '../../owner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withDomainOwner(event, async (db, session, body) => {
    if (!isObject(body) || body.confirmed !== true)
      return problem(
        400,
        'confirmation_required',
        'Confirm that the hostname is connected to this Worker.',
      );
    const domain = await readDomainConnection(db, event.params.id);
    if (!domain || domain.isPrimary) return domainMissing();
    const challenge = await issueDomainTicket(
      db,
      domain,
      event.url,
      session.csrfToken,
    );
    if (!challenge)
      return problem(
        400,
        'https_required',
        'Open the management console over HTTPS before verifying a domain.',
      );
    const dns = await checkPublicDns(domain.hostname);
    if (dns !== 'public_dns')
      return problem(
        dns === 'dns_unavailable' ? 503 : 409,
        dns,
        'The hostname must resolve publicly before HTTPS can be verified.',
      );
    return payload(challenge);
  });
