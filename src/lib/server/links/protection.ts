import { hashPassword, isValidPassword } from '../auth/credential';
import { randomHex, uuidV7 } from '../auth/crypto';

export type ProtectionMode =
  'none' | 'password' | 'one_time' | 'password_one_time';

export const gateTokenPattern = /^[a-f0-9]{64}$/;
export const linkUnlockCookie = '__Host-linkrovia_unlock';
export const linkUnlockSeconds = 300;

export function needsPassword(mode: ProtectionMode) {
  return mode === 'password' || mode === 'password_one_time';
}

export function isOneTime(mode: ProtectionMode) {
  return mode === 'one_time' || mode === 'password_one_time';
}

type ProtectionChange =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'stale_link'
        | 'invalid_input'
        | 'password_required'
        | 'temporary_redirect';
    };

export async function setLinkProtection(
  db: D1Database,
  userId: string | null,
  id: string,
  expected: number,
  requestedMode: string | null,
  password: string,
): Promise<ProtectionChange> {
  if (
    requestedMode !== 'none' &&
    requestedMode !== 'password' &&
    requestedMode !== 'one_time' &&
    requestedMode !== 'password_one_time'
  )
    return { ok: false, code: 'invalid_input' };

  const link = await db
    .prepare(
      `SELECT redirect_type AS redirectType, protection_mode AS mode FROM links
      WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`,
    )
    .bind(id, expected)
    .first<{ redirectType: number; mode: ProtectionMode }>();
  if (!link) return { ok: false, code: 'stale_link' };
  if (
    requestedMode !== 'none' &&
    link.redirectType !== 302 &&
    link.redirectType !== 307
  )
    return { ok: false, code: 'temporary_redirect' };

  const passwordMode = needsPassword(requestedMode);
  if (passwordMode && !password && !needsPassword(link.mode))
    return { ok: false, code: 'password_required' };
  if (password && (!passwordMode || !isValidPassword(password)))
    return { ok: false, code: 'invalid_input' };

  const hash = password ? await hashPassword(password) : null;
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE links
       SET protection_mode = ?,
           protection_password_hash = CASE WHEN ? THEN COALESCE(?, protection_password_hash) END,
           consumed_at = CASE WHEN ? THEN consumed_at END,
           gate_token = ?, updated_at = MAX(unixepoch(), updated_at + 1)
       WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`,
      )
      .bind(
        requestedMode,
        Number(passwordMode),
        hash,
        Number(isOneTime(requestedMode)),
        requestedMode === 'none' ? null : randomHex(32),
        id,
        expected,
      ),
    db
      .prepare(
        `INSERT INTO audit_events (id, user_id, action, entity_type, entity_id)
       SELECT ?, ?, 'link.protection_changed', 'link', ? WHERE changes() = 1`,
      )
      .bind(uuidV7(), userId, id),
  ]);
  return result.meta.changes > 0
    ? { ok: true }
    : { ok: false, code: 'stale_link' };
}
