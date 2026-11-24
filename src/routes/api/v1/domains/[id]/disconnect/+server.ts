import { randomHex } from '$lib/server/auth/crypto';
import {
  readDomainConnection,
  setDomainConnection,
} from '$lib/server/domains/connection';
import { isObject } from '$lib/server/links/api-input';
import { payload, problem } from '../../../http';
import { domainChanged, domainMissing, withDomainOwner } from '../../owner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withDomainOwner(event, async (db, session, body) => {
    if (
      !isObject(body) ||
      body.confirmed !== true ||
      !Number.isSafeInteger(body.version)
    )
      return problem(
        400,
        'confirmation_required',
        'Confirm that this hostname should stop serving links.',
      );
    const domain = await readDomainConnection(db, event.params.id);
    if (!domain || domain.isPrimary) return domainMissing();
    if (domain.status === 'disconnected')
      return payload({ status: 'disconnected' });
    if (
      domain.version !== body.version ||
      !(await setDomainConnection(
        db,
        domain,
        session.user.id,
        'disconnect',
        randomHex(16),
      ))
    )
      return domainChanged();
    return payload({ status: 'disconnected' });
  });
