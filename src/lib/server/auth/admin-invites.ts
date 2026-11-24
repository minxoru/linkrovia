import { normalizeEmail } from './credential';
import { hex, randomHex, sha256, uuidV7 } from './crypto';

const inviteMaxAge = 24 * 60 * 60;
const activeOwner =
  "SELECT 1 FROM users WHERE id = ? AND role = 'owner' AND disabled_at IS NULL";

export async function inviteCodeHash(code: unknown): Promise<string | null> {
  if (
    typeof code !== 'string' ||
    !/^[a-f0-9]{64}$/.test(code) ||
    code.length !== 64
  )
    return null;
  return hex(await sha256(`linkrovia:admin-invite:v1:${code}`));
}

export async function createAdminInvite(
  db: D1Database,
  ownerId: string,
  email: string,
) {
  if (email !== normalizeEmail(email)) return null;
  const code = randomHex(32);
  const codeHash = await inviteCodeHash(code);
  const [, inserted] = await db.batch([
    db
      .prepare(
        `UPDATE admin_invites SET revoked_at = unixepoch()
       WHERE email = ? AND accepted_by IS NULL AND revoked_at IS NULL
         AND expires_at <= unixepoch() AND EXISTS (${activeOwner})`,
      )
      .bind(email, ownerId),
    db
      .prepare(
        `INSERT INTO admin_invites (id, email, code_hash, created_by, expires_at)
       SELECT ?, ?, ?, users.id, unixepoch() + ?
       FROM users
       WHERE id = ? AND role = 'owner' AND disabled_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM users WHERE email = ?)
       ON CONFLICT DO NOTHING`,
      )
      .bind(uuidV7(), email, codeHash, inviteMaxAge, ownerId, email),
  ]);
  return inserted.meta.changes === 1 ? code : null;
}

export async function listAdminAccess(db: D1Database) {
  const [invitations, admins] = await db.batch([
    db.prepare(
      `SELECT id, email, expires_at FROM admin_invites
       WHERE accepted_by IS NULL AND revoked_at IS NULL AND expires_at > unixepoch()
       ORDER BY expires_at, id`,
    ),
    db.prepare(
      `SELECT id, email, disabled_at FROM users
       WHERE role = 'admin' ORDER BY disabled_at IS NOT NULL, email`,
    ),
  ]);
  return {
    invitations: invitations.results as {
      id: string;
      email: string;
      expires_at: number;
    }[],
    admins: admins.results as {
      id: string;
      email: string;
      disabled_at: number | null;
    }[],
  };
}

export async function getInviteEmail(db: D1Database, codeHash: string) {
  return db
    .prepare(
      `SELECT email FROM admin_invites
     WHERE code_hash = ? AND accepted_by IS NULL AND revoked_at IS NULL
       AND expires_at > unixepoch()`,
    )
    .bind(codeHash)
    .first<string>('email');
}

export async function revokeAdminInvite(
  db: D1Database,
  ownerId: string,
  id: string,
) {
  await db
    .prepare(
      `UPDATE admin_invites SET revoked_at = unixepoch()
     WHERE id = ? AND accepted_by IS NULL AND revoked_at IS NULL
       AND EXISTS (${activeOwner})`,
    )
    .bind(id, ownerId)
    .run();
}

export async function disableAdmin(
  db: D1Database,
  ownerId: string,
  id: string,
) {
  await db.batch([
    db
      .prepare(
        `UPDATE users SET disabled_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND role = 'admin' AND disabled_at IS NULL AND EXISTS (${activeOwner})`,
      )
      .bind(id, ownerId),
    db
      .prepare(
        `UPDATE sessions SET revoked_at = unixepoch()
       WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (${activeOwner})
         AND EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'admin' AND disabled_at IS NOT NULL)`,
      )
      .bind(id, ownerId),
    db
      .prepare(
        `UPDATE api_keys SET revoked_at = unixepoch()
       WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (${activeOwner})
         AND EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'admin' AND disabled_at IS NOT NULL)`,
      )
      .bind(id, ownerId),
  ]);
}
