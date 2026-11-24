import { Buffer } from 'node:buffer';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { randomHex } from './crypto';

const emailPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim();
  return email.indexOf('@') <= 64 && emailPattern.test(email)
    ? email.toLowerCase()
    : null;
}

export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 12 &&
    value.length <= 128 &&
    value.isWellFormed()
  );
}

// This OWASP profile fits the Workers scrypt cost ceiling (N * r * p).
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashVersion = 'scrypt-v1$32768$8$3';
const hashPattern = /^scrypt-v1\$32768\$8\$3\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
const decoySalt = Buffer.alloc(16);
const decoyKey = Buffer.alloc(32);

function deriveKey(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) throw new TypeError('Invalid password');
  const salt = randomHex(16);
  const key = await deriveKey(password, Buffer.from(salt, 'hex'));
  return `${hashVersion}$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  if (!isValidPassword(password)) return false;
  const match =
    hash?.length === hashVersion.length + 98 ? hashPattern.exec(hash) : null;
  // Missing accounts and unsupported hashes perform the same KDF work.
  const salt = match ? Buffer.from(match[1], 'hex') : decoySalt;
  const expected = match ? Buffer.from(match[2], 'hex') : decoyKey;
  const actual = await deriveKey(password, salt);
  const equal = timingSafeEqual(actual, expected);
  return match !== null && equal;
}
