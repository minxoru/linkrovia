import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { isLocale } from '../../i18n/locale';
import { hashPassword, isValidPassword, normalizeEmail } from './credential';
import { encode, hex, randomHex, sha256, uuidV7 } from './crypto';

export const setupProofCookie = '__Host-linkrovia_setup';
export const setupProofMaxAge = 600;

export function isConfiguredSetupToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    value.trim().length >= 32 &&
    value.isWellFormed()
  );
}

export async function checkSetupToken(
  submitted: unknown,
  configured: string | undefined,
): Promise<boolean> {
  if (
    !isConfiguredSetupToken(configured) ||
    typeof submitted !== 'string' ||
    submitted.length > 512 ||
    !submitted.isWellFormed()
  ) {
    return false;
  }
  const [actual, expected] = await Promise.all([
    sha256(submitted),
    sha256(configured),
  ]);
  return timingSafeEqual(actual, expected);
}

function proofKey(
  secret: string,
  usage: 'sign' | 'verify',
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encode.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

function proofMessage(
  payload: string,
  origin?: string,
): Uint8Array<ArrayBuffer> {
  return encode.encode(
    `linkrovia:setup-proof:${payload}${origin ? `:${origin}` : ''}`,
  );
}

export async function createSetupProof(
  secret: string,
  origin?: string,
): Promise<string> {
  if (!isConfiguredSetupToken(secret))
    throw new TypeError('Invalid setup secret');
  const expiry = Math.floor(Date.now() / 1000) + setupProofMaxAge;
  const payload = `v1.${expiry}.${randomHex(16)}`;
  const tag = await crypto.subtle.sign(
    'HMAC',
    await proofKey(secret, 'sign'),
    proofMessage(payload, origin),
  );
  return `${payload}.${hex(new Uint8Array(tag))}`;
}

export async function verifySetupProof(
  proof: unknown,
  secret: string | undefined,
  origin?: string,
): Promise<boolean> {
  if (
    typeof proof !== 'string' ||
    proof.length > 114 ||
    !isConfiguredSetupToken(secret)
  ) {
    return false;
  }
  const match = /^(v1\.(\d{1,12})\.[0-9a-f]{32})\.([0-9a-f]{64})$/.exec(proof);
  if (!match || match[0] !== proof) return false;

  const [, payload, expiry, tag] = match;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(expiry);
  if (expiresAt <= now || expiresAt > now + setupProofMaxAge) return false;
  return crypto.subtle.verify(
    'HMAC',
    await proofKey(secret, 'verify'),
    Buffer.from(tag, 'hex'),
    proofMessage(payload, origin),
  );
}

export async function setupComplete(db: D1Database): Promise<boolean> {
  const completed = await db
    .prepare(
      `SELECT
         (completed_at IS NOT NULL OR owner_user_id IS NOT NULL OR token_consumed_at IS NOT NULL)
           AS complete
       FROM setup_state
       WHERE singleton = 1`,
    )
    .first<number>('complete');
  return completed === 1;
}

export const setupOpen = `singleton = 1 AND completed_at IS NULL
  AND owner_user_id IS NULL AND token_consumed_at IS NULL`;

export function setupHosts(db: D1Database) {
  return db
    .prepare(
      `SELECT deployment_hostname AS deployment, management_hostname AS management
      FROM setup_state WHERE singleton = 1`,
    )
    .first<{ deployment: string | null; management: string | null }>();
}

export async function canEnrollOwner(db: D1Database, hostname: string) {
  return (await setupHosts(db))?.management === hostname;
}

export function activateManagementDomain(
  db: D1Database,
  hostname: string,
  ownerId: string,
) {
  return db
    .prepare(
      `INSERT INTO domains
         (id, hostname, is_primary, provider_mode, connection_status, verified_at)
       SELECT ?, ?, 1, 'unconfigured', 'active', unixepoch()
       FROM setup_state
       WHERE singleton = 1 AND owner_user_id = ?
         AND NOT EXISTS (SELECT 1 FROM domains WHERE is_primary = 1)
       ON CONFLICT(hostname) DO UPDATE
       SET is_primary = 1, is_active = 1, connection_status = 'active',
           verified_at = unixepoch(), updated_at = unixepoch()`,
    )
    .bind(uuidV7(), hostname, ownerId);
}

export async function registerOwner(
  db: D1Database,
  input: {
    email: string;
    password: string;
    locale?: string;
    managementHostname?: string;
    requireSelectedHostname?: boolean;
  },
): Promise<boolean> {
  const email = normalizeEmail(input.email);
  if (!email || !isValidPassword(input.password)) return false;

  const ownerId = uuidV7();
  const passwordHash = await hashPassword(input.password);
  const locale = isLocale(input.locale) ? input.locale : 'en';
  // Both statements commit together. Only the transaction that inserted this
  // owner can consume the initial setup state.
  const statements = [
    db
      .prepare(
        `INSERT INTO users (id, email, password_hash, role, locale)
         SELECT ?, ?, ?, 'owner', ?
         FROM setup_state
         WHERE ${setupOpen}
           ${input.requireSelectedHostname ? 'AND management_hostname = ?' : ''}`,
      )
      .bind(
        ownerId,
        email,
        passwordHash,
        locale,
        ...(input.requireSelectedHostname
          ? [input.managementHostname ?? null]
          : []),
      ),
    db
      .prepare(
        `UPDATE setup_state
         SET completed_at = unixepoch(), owner_user_id = ?, token_consumed_at = unixepoch()
         WHERE singleton = 1 AND completed_at IS NULL
           AND owner_user_id IS NULL AND token_consumed_at IS NULL
           AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'owner')`,
      )
      .bind(ownerId, ownerId),
  ];

  if (input.managementHostname) {
    statements.push(
      activateManagementDomain(db, input.managementHostname, ownerId),
    );
  }

  const [, completion] = await db.batch(statements);
  return completion.meta.changes === 1;
}
