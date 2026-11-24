import { uuidV7 } from '../auth/crypto';
import { normalizeHostname } from '../security/url-policy';

const fields = `id, hostname, is_primary AS isPrimary, connection_status AS status,
  connection_version AS version, provider_mode AS providerMode, verified_at AS verifiedAt,
  cloudflare_domain_id AS mappingId, management_enabled AS managementEnabled`;

const noProviderOperation = `NOT EXISTS (
  SELECT 1 FROM domain_connection_operations WHERE domain_id = domains.id
    AND status = 'running' AND started_at > unixepoch() - 60
)`;

export type DomainConnection = {
  id: string;
  hostname: string;
  isPrimary: number;
  status: string;
  version: number;
  providerMode: string;
  verifiedAt: number | null;
  mappingId: string | null;
  managed: boolean;
  managementEnabled: number;
};

export function domainHostname(value: unknown) {
  if (typeof value !== 'string' || value.includes(':')) return null;
  const hostname = normalizeHostname(value.trim());
  if (
    !hostname ||
    hostname === 'workers.dev' ||
    hostname.endsWith('.workers.dev')
  )
    return null;
  return hostname;
}

export async function readDomainConnection(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT ${fields} FROM domains WHERE id = ? AND backup_archived_at IS NULL`,
    )
    .bind(id)
    .first<Omit<DomainConnection, 'managed'>>();
  return row && { ...row, managed: row.mappingId !== null };
}

export function managementHostname(db: D1Database) {
  return db
    .prepare('SELECT hostname FROM domains WHERE is_primary = 1')
    .first<string>('hostname');
}

export async function deploymentHostname(db: D1Database) {
  const hostname = await db
    .prepare('SELECT deployment_hostname FROM setup_state WHERE singleton = 1')
    .first<string>('deployment_hostname');
  return hostname ?? managementHostname(db);
}

export const secondaryManagementDomain = `is_primary = 0 AND is_active = 1
  AND connection_status = 'active' AND verified_at IS NOT NULL
  AND backup_archived_at IS NULL AND provider_mode = 'cloudflare_custom_domain'
  AND management_enabled = 1`;

export async function managementDomainEnabled(
  db: D1Database,
  hostname: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS enabled FROM domains
    WHERE hostname = ? AND ${secondaryManagementDomain}`,
    )
    .bind(hostname)
    .first<number>('enabled');
  return row === 1;
}

export async function setDomainConnection(
  db: D1Database,
  domain: DomainConnection,
  actorId: string,
  operation: 'verify' | 'disconnect',
  operationKey: string,
) {
  const publish = operation === 'verify';
  const [updated] = await db.batch<{ id: string }>([
    db
      .prepare(
        `UPDATE domains SET connection_version = connection_version + 1,
      connection_status = ?, is_active = ?, last_checked_at = unixepoch(), updated_at = unixepoch(),
      verified_at = CASE WHEN ? THEN unixepoch() ELSE NULL END,
      provider_mode = CASE WHEN ? THEN 'cloudflare_custom_domain' ELSE provider_mode END,
      connection_error_code = NULL,
      management_enabled = CASE WHEN ? THEN management_enabled ELSE 0 END
      WHERE id = ? AND hostname = ? AND connection_version = ? AND is_primary = 0
        AND backup_archived_at IS NULL AND ${noProviderOperation}
      RETURNING id`,
      )
      .bind(
        publish ? 'active' : 'disconnected',
        Number(publish),
        Number(publish),
        Number(publish),
        Number(publish),
        domain.id,
        domain.hostname,
        domain.version,
      ),
    db
      .prepare(
        `INSERT INTO domain_connection_operations
      (id, domain_id, operation_type, status, attempt, idempotency_key, actor_id, finished_at)
      SELECT ?, ?, ?, 'succeeded', 1, ?, ?, unixepoch() WHERE changes() = 1`,
      )
      .bind(uuidV7(), domain.id, operation, operationKey, actorId),
  ]);
  return updated.results.length === 1;
}

export type ProviderOperation = {
  id: string;
  domainId: string;
  version: number;
  action: 'attach' | 'detach';
};

export async function beginProviderOperation(
  db: D1Database,
  domain: DomainConnection,
  actorId: string,
  action: ProviderOperation['action'],
): Promise<ProviderOperation | null> {
  const id = uuidV7();
  const [updated] = await db.batch<{ version: number }>([
    db
      .prepare(
        `UPDATE domains SET connection_status = COALESCE(?, connection_status),
      connection_version = connection_version + 1, last_checked_at = unixepoch(),
      updated_at = unixepoch(), connection_error_code = NULL
      WHERE id = ? AND connection_version = ? AND is_primary = 0
        AND backup_archived_at IS NULL AND ${noProviderOperation}
        AND (CASE WHEN ? = 'attach' THEN connection_status != 'active' ELSE cloudflare_domain_id IS NOT NULL END)
      RETURNING connection_version AS version`,
      )
      .bind(
        action === 'attach' ? 'provisioning' : null,
        domain.id,
        domain.version,
        action,
      ),
    db
      .prepare(
        `INSERT INTO domain_connection_operations
      (id, domain_id, operation_type, status, attempt, idempotency_key, actor_id)
      SELECT ?, ?, ?, 'running', 1, ?, ? WHERE changes() = 1`,
      )
      .bind(
        id,
        domain.id,
        action === 'attach' ? 'connect' : 'disconnect',
        id,
        actorId,
      ),
  ]);
  const row = updated.results[0];
  return row ? { id, domainId: domain.id, version: row.version, action } : null;
}

export async function finishProviderOperation(
  db: D1Database,
  operation: ProviderOperation,
  result: { code: string; mappingId?: string; zoneId?: string },
) {
  const attached = result.code === 'attached';
  const detached = result.code === 'detached';
  const completed = attached || detached;
  const uncertain = ['conflict', 'operation_unknown'].includes(result.code);
  const status = attached
    ? 'verifying'
    : detached
      ? 'disconnected'
      : operation.action === 'attach'
        ? 'failed'
        : uncertain
          ? 'warning'
          : null;
  const error = completed ? null : result.code;
  const [updated] = await db.batch<{ id: string }>([
    db
      .prepare(
        `UPDATE domains SET connection_status = COALESCE(?, connection_status),
      is_active = CASE WHEN ? THEN 0 ELSE is_active END,
      verified_at = CASE WHEN ? THEN NULL ELSE verified_at END,
      management_enabled = CASE WHEN ? THEN 0 ELSE management_enabled END,
      connection_version = connection_version + 1,
      connection_error_code = ?, updated_at = unixepoch(),
      provider_mode = CASE WHEN ? THEN 'cloudflare_custom_domain' ELSE provider_mode END,
      cloudflare_domain_id = CASE WHEN ? THEN ? ELSE cloudflare_domain_id END,
      cloudflare_zone_id = CASE WHEN ? THEN ? ELSE cloudflare_zone_id END
      WHERE id = ? AND connection_version = ? AND backup_archived_at IS NULL
        AND EXISTS (SELECT 1 FROM domain_connection_operations WHERE id = ? AND status = 'running')
      RETURNING id`,
      )
      .bind(
        status,
        Number(status !== null),
        Number(status !== null),
        Number(status !== null),
        error,
        Number(attached),
        Number(completed),
        result.mappingId ?? null,
        Number(completed),
        result.zoneId ?? null,
        operation.domainId,
        operation.version,
        operation.id,
      ),
    db
      .prepare(
        `UPDATE domain_connection_operations SET status = ?, error_code = ?, finished_at = unixepoch()
      WHERE id = ? AND changes() = 1`,
      )
      .bind(completed ? 'succeeded' : 'failed', error, operation.id),
  ]);
  return updated.results.length === 1;
}
