import { uuidV7 } from '../auth/crypto';
import { setupOpen } from '../auth/setup';
import { attachCustomDomain, type CloudflareInput } from './cloudflare';

// Allow for separate provider lookup, write and confirmation deadlines.
const leaseSeconds = 45;
const leaseAvailable = `(management_operation_expires_at IS NULL
  OR management_operation_expires_at <= unixepoch())`;
const workersHost =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/;

export function supportsSetupCustomDomain(hostname: string) {
  return workersHost.test(hostname);
}

export async function rememberSetupDeployment(
  db: D1Database,
  hostname: string,
) {
  const result = await db
    .prepare(
      `UPDATE setup_state SET deployment_hostname = COALESCE(deployment_hostname, ?)
       WHERE ${setupOpen} AND (deployment_hostname IS NULL OR deployment_hostname = ?
         OR management_hostname = ?)`,
    )
    .bind(hostname, hostname, hostname)
    .run();
  return result.meta.changes === 1;
}

async function setupChoiceConflict(db: D1Database, deployment: string) {
  const busy = await db
    .prepare(
      `SELECT 1 AS busy FROM setup_state WHERE ${setupOpen}
      AND deployment_hostname = ? AND NOT ${leaseAvailable}`,
    )
    .bind(deployment)
    .first<number>('busy');
  return busy === 1 ? 'busy' : 'domain_changed';
}

export async function selectDeploymentHostname(
  db: D1Database,
  hostname: string,
) {
  const result = await db
    .prepare(
      `UPDATE setup_state SET management_hostname = deployment_hostname,
        management_operation_id = NULL, management_operation_expires_at = NULL
       WHERE ${setupOpen} AND deployment_hostname = ? AND ${leaseAvailable}`,
    )
    .bind(hostname)
    .run();
  return result.meta.changes === 1
    ? 'selected'
    : setupChoiceConflict(db, hostname);
}

export async function attachSetupCustomDomain(
  db: D1Database,
  input: CloudflareInput,
  hostname: string,
  deployment: string,
  send = fetch,
) {
  if (!supportsSetupCustomDomain(deployment))
    return { code: 'unsupported' } as const;

  const leaseId = uuidV7();
  const lease = await db
    .prepare(
      `UPDATE setup_state SET management_operation_id = ?,
        management_operation_expires_at = unixepoch() + ?
       WHERE ${setupOpen} AND deployment_hostname = ? AND management_hostname IS NULL
         AND ${leaseAvailable}`,
    )
    .bind(leaseId, leaseSeconds, deployment)
    .run();
  if (lease.meta.changes !== 1)
    return { code: await setupChoiceConflict(db, deployment) };

  try {
    const outcome = await attachCustomDomain(input, hostname, deployment, send);
    if (outcome.code !== 'attached') return outcome;

    const [selection] = await db.batch([
      db
        .prepare(
          `UPDATE setup_state SET management_hostname = ?,
            management_operation_id = NULL, management_operation_expires_at = NULL
           WHERE ${setupOpen} AND deployment_hostname = ? AND management_hostname IS NULL
             AND management_operation_id = ? AND management_operation_expires_at > unixepoch()`,
        )
        .bind(hostname, deployment, leaseId),
      db
        .prepare(
          `INSERT INTO domains
             (id, hostname, is_active, provider_mode, connection_status,
              cloudflare_domain_id, cloudflare_zone_id)
           SELECT ?, ?, 0, 'cloudflare_custom_domain', 'verifying', ?, ?
           WHERE changes() = 1
           ON CONFLICT(hostname) DO NOTHING`,
        )
        .bind(
          uuidV7(),
          hostname,
          outcome.created ? outcome.mappingId : null,
          outcome.zoneId,
        ),
    ]);
    // An expired lease cannot commit setup even if Cloudflare did finish its change.
    return selection.meta.changes === 1
      ? ({ code: 'attached' } as const)
      : ({ code: 'operation_unknown' } as const);
  } finally {
    await db
      .prepare(
        `UPDATE setup_state SET management_operation_id = NULL,
          management_operation_expires_at = NULL
         WHERE singleton = 1 AND management_operation_id = ?`,
      )
      .bind(leaseId)
      .run();
  }
}
