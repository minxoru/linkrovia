import type { Cookies } from '@sveltejs/kit';
import {
  managementHostname,
  secondaryManagementDomain,
} from '../domains/connection';
import { normalizeHostname } from '../security/url-policy';
import { hex, randomHex, sha256 } from './crypto';

const transferMaxAge = 5 * 60;
const codeMaxAge = 60;
export const transferStateCookie = '__Host-linkrovia_transfer_state';
export const transferVerifierCookie = '__Host-linkrovia_transfer_verifier';
export const transferFinishPath = '/login/transfer/finish';
export const transferCookieOptions = {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: transferMaxAge,
} as const;

function validSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

async function hash(value: string) {
  return hex(await sha256(value));
}

function loopback(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

export async function managementOrigin(
  db: D1Database,
  url: URL,
  { development = false } = {},
): Promise<string | null> {
  const hostname = await managementHostname(db);
  if (
    !hostname ||
    normalizeHostname(hostname, { allowLoopback: development }) !== hostname
  )
    return null;

  if (development && loopback(hostname) && loopback(url.hostname)) {
    return new URL(
      `${url.protocol}//${hostname}${url.port ? ':' + url.port : ''}`,
    ).origin;
  }
  return `https://${hostname}`;
}

const enabledTarget = `EXISTS (
  SELECT 1 FROM domains WHERE hostname = ? AND ${secondaryManagementDomain}
)`;

export async function startManagementSignIn(db: D1Database, target: URL) {
  const state = randomHex(32);
  const verifier = randomHex(32);
  const [stateHash, verifierHash] = await Promise.all([
    hash(state),
    hash(verifier),
  ]);
  const [, created] = await db.batch([
    db.prepare(
      'DELETE FROM management_signins WHERE expires_at <= unixepoch()',
    ),
    db
      .prepare(
        `INSERT INTO management_signins (state_hash, verifier_hash, target_origin, expires_at)
       SELECT ?, ?, ?, unixepoch() + ?
       WHERE ${enabledTarget}
         AND (SELECT count(*) FROM management_signins) < 1024`,
      )
      .bind(
        stateHash,
        verifierHash,
        target.origin,
        transferMaxAge,
        target.hostname,
      ),
  ]);
  return created.meta.changes === 1 ? { state, verifier } : null;
}

export async function pendingManagementSignIn(db: D1Database, state: unknown) {
  if (!validSecret(state)) return null;
  const pending = await db
    .prepare(
      `SELECT target_origin FROM management_signins
     WHERE state_hash = ? AND code_hash IS NULL AND expires_at > unixepoch()`,
    )
    .bind(await hash(state))
    .first<string>('target_origin');
  return pending ? new URL(pending) : null;
}

export async function authorizeManagementSignIn(
  db: D1Database,
  state: unknown,
  userId: string,
) {
  if (!validSecret(state)) return null;
  const target = await pendingManagementSignIn(db, state);
  if (!target) return null;

  const code = randomHex(32);
  const [stateHash, codeHash] = await Promise.all([hash(state), hash(code)]);
  const authorized = await db
    .prepare(
      `UPDATE management_signins SET code_hash = ?, user_id = ?,
       expires_at = min(expires_at, unixepoch() + ?)
     WHERE state_hash = ? AND code_hash IS NULL AND expires_at > unixepoch()
       AND target_origin = ? AND ${enabledTarget}
       AND EXISTS (SELECT 1 FROM users WHERE id = ? AND disabled_at IS NULL)
     RETURNING target_origin`,
    )
    .bind(
      codeHash,
      userId,
      codeMaxAge,
      stateHash,
      target.origin,
      target.hostname,
      userId,
    )
    .first<string>('target_origin');
  if (!authorized) return null;
  const destination = new URL('/login/transfer/complete', authorized);
  destination.searchParams.set('code', code);
  return destination;
}

export async function consumeManagementSignIn(
  db: D1Database,
  target: URL,
  code: unknown,
  verifier: unknown,
) {
  if (!validSecret(code) || !validSecret(verifier)) return null;
  const [codeHash, verifierHash] = await Promise.all([
    hash(code),
    hash(verifier),
  ]);
  return db
    .prepare(
      `DELETE FROM management_signins
     WHERE code_hash = ? AND verifier_hash = ? AND target_origin = ?
       AND expires_at > unixepoch() AND ${enabledTarget}
       AND EXISTS (SELECT 1 FROM users WHERE id = user_id AND disabled_at IS NULL)
     RETURNING user_id`,
    )
    .bind(codeHash, verifierHash, target.origin, target.hostname)
    .first<string>('user_id');
}

export async function finishManagementSignIn(
  db: D1Database,
  cookies: Cookies,
  userId: string,
): Promise<string> {
  const state = cookies.get(transferStateCookie);
  if (!state) return '/admin';
  cookies.delete(transferStateCookie, transferCookieOptions);
  const destination = await authorizeManagementSignIn(db, state, userId).catch(
    () => null,
  );
  return destination?.href ?? '/admin';
}

export function postSignInPath(cookies: Cookies) {
  return cookies.get(transferStateCookie) ? transferFinishPath : '/admin';
}

export function transferRedirect(location: string | URL) {
  return new Response(null, {
    status: 303,
    headers: {
      location: String(location),
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}
