import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { hex, randomHex, sha256 } from '../auth/crypto';

const signingKey =
  "SELECT value FROM schema_meta WHERE key = 'conversion_reference_key'";

function sign(nonce: string, key: string) {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`linkrovia:conversion:v1:${nonce}`)
    .digest('hex');
}

export async function issueClickReference(
  db: D1Database,
  linkId: string,
  updatedAt: number,
): Promise<string | null> {
  const nonce = randomHex(24);
  const key = await db
    .prepare(
      `WITH goals AS (
      SELECT MAX(MIN(attribution_window_hours, 720)) AS window,
        json_group_object(id, unixepoch() + MIN(attribution_window_hours, 720) * 3600) AS eligible
      FROM conversion_goals
      WHERE is_active = 1 AND backup_archived_at IS NULL AND (link_id = ? OR link_id IS NULL)
    )
    INSERT INTO click_attributions (ref_hash, link_id, expires_at, eligible_goals_json)
    SELECT ?, l.id, unixepoch() + goals.window * 3600, goals.eligible
    FROM links l CROSS JOIN goals
    WHERE l.id = ? AND l.updated_at = ? AND l.deleted_at IS NULL AND l.is_active = 1
      AND l.conversion_tracking = 1 AND l.redirect_type IN (302, 307) AND goals.window > 0
      AND (l.starts_at IS NULL OR l.starts_at <= unixepoch())
      AND (l.expires_at IS NULL OR l.expires_at > unixepoch())
    RETURNING (${signingKey}) AS signingKey`,
    )
    .bind(linkId, hex(await sha256(nonce)), linkId, updatedAt)
    .first<string>('signingKey');
  return key ? `${nonce}.${sign(nonce, key)}` : null;
}

export async function verifyClickReference(db: D1Database, value: string) {
  if (!/^[a-f0-9]{48}\.[a-f0-9]{64}$/.test(value)) return null;
  const key = await db.prepare(signingKey).first<string>('value');
  if (!key) return null;
  const [nonce, signature] = value.split('.');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(nonce, key)))
    ? hex(await sha256(nonce))
    : null;
}
