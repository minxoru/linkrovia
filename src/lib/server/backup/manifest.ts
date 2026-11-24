import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomHex } from '../auth/crypto';
import { BackupError } from './format';

export type RestoreOptions =
  | { mode: 'merge'; conflict: 'skip' | 'overwrite' }
  | { mode: 'replace'; conflict: 'overwrite' };

type Claims = RestoreOptions & {
  checksum: string;
  revision: number;
  expiresAt: number;
  nonce: string;
};

function signature(
  key: string,
  purpose: string,
  session: string,
  value: string,
) {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`linkrovia/backup/${purpose}/v1\n${session}\n${value}`)
    .digest();
}

function matchesMac(value: string, expected: Buffer) {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    timingSafeEqual(
      Buffer.from(value),
      Buffer.from(expected.toString('base64url')),
    )
  );
}

export function issueManifest(
  key: string,
  session: string,
  options: RestoreOptions,
  checksum: string,
  revision: number,
) {
  const claims: Claims = {
    ...options,
    checksum,
    revision,
    expiresAt: Date.now() + 10 * 60_000,
    nonce: randomHex(16),
  };
  const value = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${value}.${signature(key, 'manifest', session, value).toString('base64url')}`;
}

export function verifyManifest(
  key: string,
  session: string,
  manifest: string | null,
): Claims {
  const parts =
    manifest?.length && manifest.length <= 512 ? manifest.split('.') : [];
  if (
    parts.length !== 2 ||
    !matchesMac(parts[1], signature(key, 'manifest', session, parts[0]))
  )
    throw new BackupError('stale_manifest');
  const claims = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString(),
  ) as Claims;
  if (claims.expiresAt <= Date.now()) throw new BackupError('stale_manifest');
  return claims;
}

export function downloadReceipt(
  key: string,
  session: string,
  manifest: string,
) {
  return signature(key, 'download', session, manifest).toString('base64url');
}

export function verifyDownload(
  key: string,
  session: string,
  manifest: string,
  receipt: string,
) {
  return matchesMac(receipt, signature(key, 'download', session, manifest));
}
