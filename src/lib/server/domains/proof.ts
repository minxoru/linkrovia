import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomHex } from '../auth/crypto';
import {
  domainHostname,
  managementDomainEnabled,
  managementHostname,
  type DomainConnection,
} from './connection';

type Claim = {
  id: string;
  hostname: string;
  origin: string;
  version: number;
  session: string;
  nonce: string;
  expires: number;
};
const verificationPath = '/domain-verification/';
const ticketPattern = /^([A-Za-z0-9_-]{1,1100})\.([a-f0-9]{64})$/;

async function getKey(db: D1Database) {
  return db
    .prepare('SELECT signing_key FROM backup_state WHERE singleton = 1')
    .first<string>('signing_key');
}

function sign(key: string, purpose: string, value: string) {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`linkrovia:domain:${purpose}:v1\n${value}`)
    .digest('hex');
}

function same(value: unknown, expected: string) {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}

function verifiedClaims(ticket: unknown, key: string): Claim | null {
  const match =
    typeof ticket === 'string' && ticket.length <= 1200
      ? ticketPattern.exec(ticket)
      : null;
  if (!match || !same(match[2], sign(key, 'ticket', match[1]))) return null;
  const claim = JSON.parse(
    Buffer.from(match[1], 'base64url').toString(),
  ) as Claim;
  return claim.expires > Date.now() ? claim : null;
}

export async function issueDomainTicket(
  db: D1Database,
  domain: DomainConnection,
  thisUrl: URL,
  csrfToken: string,
) {
  const primary = await managementHostname(db);
  if (
    thisUrl.protocol !== 'https:' ||
    thisUrl.port ||
    domain.isPrimary ||
    domainHostname(domain.hostname) !== domain.hostname ||
    (thisUrl.hostname !== primary &&
      !(await managementDomainEnabled(db, thisUrl.hostname)))
  )
    return null;
  const key = await getKey(db);
  if (!key) return null;
  const claims: Claim = {
    id: domain.id,
    hostname: domain.hostname,
    origin: thisUrl.origin,
    version: domain.version,
    session: sign(key, 'session', csrfToken),
    nonce: randomHex(16),
    expires: Date.now() + 5 * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const ticket = `${encoded}.${sign(key, 'ticket', encoded)}`;
  return {
    ticket,
    url: `https://${domain.hostname}${verificationPath}${ticket}`,
  };
}

export async function respondToDomainProbe(
  db: D1Database,
  ticket: string,
  target: URL,
  origin: string | null,
) {
  if (target.protocol !== 'https:' || !ticketPattern.test(ticket) || !origin)
    return null;
  const key = await getKey(db);
  if (!key) return null;
  const claims = verifiedClaims(ticket, key);
  if (
    !claims ||
    claims.origin !== origin ||
    target.origin !== `https://${claims.hostname}`
  )
    return null;
  const available = await db
    .prepare(
      `SELECT 1 FROM domains WHERE id = ? AND hostname = ? AND connection_version = ?
    AND is_primary = 0 AND backup_archived_at IS NULL`,
    )
    .bind(claims.id, claims.hostname, claims.version)
    .first();
  if (!available) return null;
  return { origin: claims.origin, proof: sign(key, 'browser-proof', ticket) };
}

export async function verifyDomainProof(
  db: D1Database,
  domain: DomainConnection,
  origin: string,
  csrfToken: string,
  ticket: unknown,
  proof: unknown,
) {
  if (typeof ticket !== 'string') return null;
  const key = await getKey(db);
  if (!key) return null;
  const claims = verifiedClaims(ticket, key);
  if (
    !claims ||
    domain.isPrimary ||
    claims.id !== domain.id ||
    claims.hostname !== domain.hostname ||
    claims.version !== domain.version ||
    claims.origin !== origin ||
    !same(claims.session, sign(key, 'session', csrfToken)) ||
    !same(proof, sign(key, 'browser-proof', ticket))
  )
    return null;
  return claims.nonce;
}
