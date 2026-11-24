import { timingSafeEqual } from 'node:crypto';
import type { Theme } from '../../theme/theme';
import { isValidPassword, normalizeEmail, verifyPassword } from './credential';
import { encode, hex, randomHex, sha256, uuidV7 } from './crypto';

export const sessionCookie = '__Host-linkrovia_session';
export const sessionMaxAge = 7 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  email: string;
  role: 'owner' | 'admin';
  locale: string;
  timezone: string | null;
  theme: Theme;
}

export interface Session {
  user: SessionUser;
  csrfToken: string;
}

function validToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length === 64 &&
    /^[0-9a-f]{64}$/.test(token)
  );
}

export async function authenticate(
  db: D1Database,
  email: unknown,
  password: unknown,
): Promise<string | null> {
  if (!isValidPassword(password)) return null;
  const account = await db
    .prepare(
      'SELECT id, password_hash FROM users WHERE email = ? AND disabled_at IS NULL',
    )
    .bind(normalizeEmail(email))
    .first<{ id: string; password_hash: string }>();

  const matches = await verifyPassword(
    password,
    account?.password_hash ?? null,
  );
  return account && matches ? account.id : null;
}

export async function createSession(
  db: D1Database,
  userId: string,
): Promise<string> {
  const token = randomHex(32);
  const tokenHash = hex(await sha256(token));
  const { meta } = await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
       SELECT ?, id, ?, unixepoch() + ?, unixepoch()
       FROM users
       WHERE id = ? AND disabled_at IS NULL`,
    )
    .bind(uuidV7(), tokenHash, sessionMaxAge, userId)
    .run();
  if (meta.changes !== 1) throw new Error('Could not create a session');
  return token;
}

export async function getSession(
  db: D1Database,
  token: unknown,
): Promise<Session | null> {
  if (!validToken(token)) return null;
  const user = await db
    .prepare(
      `SELECT users.id, users.email, users.role, users.locale, users.timezone, users.theme
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL
         AND sessions.expires_at > unixepoch() AND users.disabled_at IS NULL`,
    )
    .bind(hex(await sha256(token)))
    .first<SessionUser>();
  if (!user) return null;

  const csrfToken = hex(await sha256(`linkrovia:session-csrf:v1:${token}`));
  return { user, csrfToken };
}

export async function revokeSession(
  db: D1Database,
  token: unknown,
): Promise<void> {
  if (!validToken(token)) return;
  await db
    .prepare(
      'UPDATE sessions SET revoked_at = unixepoch() WHERE token_hash = ? AND revoked_at IS NULL',
    )
    .bind(hex(await sha256(token)))
    .run();
}

export function checkCsrfToken(submitted: unknown, expected: string): boolean {
  if (!validToken(submitted) || !validToken(expected)) return false;
  return timingSafeEqual(encode.encode(submitted), encode.encode(expected));
}
