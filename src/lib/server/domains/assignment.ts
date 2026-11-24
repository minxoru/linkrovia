import {
  beginProviderOperation,
  finishProviderOperation,
  type DomainConnection,
  type ProviderOperation,
} from './connection';
import {
  attachCustomDomain,
  detachCustomDomain,
  type CloudflareInput,
} from './cloudflare';

export async function updateDomainAssignment(
  db: D1Database,
  domain: DomainConnection,
  actorId: string,
  action: ProviderOperation['action'],
  credentials: CloudflareInput,
  managementHostname: string,
) {
  if (action === 'attach' && domain.status === 'active')
    return { code: 'conflict' } as const;
  if (action === 'detach' && !domain.mappingId)
    return { code: 'not_managed' } as const;

  const operation = await beginProviderOperation(db, domain, actorId, action);
  if (!operation) return { code: 'domain_changed' } as const;
  const outcome =
    action === 'attach'
      ? await attachCustomDomain(
          credentials,
          domain.hostname,
          managementHostname,
        )
      : await detachCustomDomain(
          credentials,
          domain.hostname,
          managementHostname,
          domain.mappingId!,
        );
  const mappingId =
    outcome.code === 'attached' &&
    (outcome.created || outcome.mappingId === domain.mappingId)
      ? outcome.mappingId
      : undefined;

  if (
    !(await finishProviderOperation(db, operation, {
      code: outcome.code,
      mappingId,
      zoneId: outcome.code === 'attached' ? outcome.zoneId : undefined,
    }))
  )
    return { code: 'domain_changed' } as const;
  return { code: outcome.code, operationId: operation.id };
}
