import { describe, expect, it, vi } from 'vitest';
import {
  hashPassword,
  isValidPassword,
  normalizeEmail,
  verifyPassword,
} from '../../src/lib/server/auth/credential';
import {
  checkSetupToken,
  createSetupProof,
  verifySetupProof,
} from '../../src/lib/server/auth/setup';

const password = ' longer秘密 password 🌔 ';
const knownHash =
  'scrypt-v1$32768$8$3$0123456789abcdef0123456789abcdef$a11766ca64368a43003cf3756bcc80c0f2a2314792c7af29e4cbd60e5bd0b8ea';
const setupSecret = '32-characters-of-test-data----0001';

describe('password credentials', () => {
  it('normalizes the account identifier and preserves valid password characters', () => {
    expect(normalizeEmail('  Owner+link@Example.com  ')).toBe(
      'owner+link@example.com',
    );
    expect(normalizeEmail('person@example..com')).toBeNull();
    expect(isValidPassword(password)).toBe(true);
    expect(isValidPassword('too short')).toBe(false);
    expect(isValidPassword('a'.repeat(129))).toBe(false);
    expect(isValidPassword('a'.repeat(12) + '\ud800')).toBe(false);
  });

  it('verifies an independent scrypt vector without changing the password', async () => {
    await expect(verifyPassword(password, knownHash)).resolves.toBe(true);
    await expect(verifyPassword(password.trim(), knownHash)).resolves.toBe(
      false,
    );
  });

  it('creates distinct salts for the same password', async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first.split('$')[4]).toMatch(/^[0-9a-f]{32}$/);
    expect(first.split('$')[4]).not.toBe(second.split('$')[4]);
    await expect(verifyPassword(password, second)).resolves.toBe(true);
  });

  it.each([
    knownHash + '\n',
    knownHash.slice(0, -1),
    knownHash.replace('32768', '32767'),
    knownHash.replace('scrypt-v1', 'scrypt-v2'),
  ])('rejects an unrecognized or malformed password hash', async (hash) => {
    await expect(verifyPassword(password, hash)).resolves.toBe(false);
  });
});

describe('setup authorization', () => {
  it('requires an exact token and a configured production-length secret', async () => {
    await expect(checkSetupToken(setupSecret, setupSecret)).resolves.toBe(true);
    await expect(
      checkSetupToken(setupSecret.trim() + ' ', setupSecret),
    ).resolves.toBe(false);
    await expect(checkSetupToken('short', 'short')).resolves.toBe(false);
    await expect(checkSetupToken(setupSecret, undefined)).resolves.toBe(false);
  });

  it('signs proofs that expire after ten minutes and fail after token rotation', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const proof = await createSetupProof(setupSecret);
      const secondProof = await createSetupProof(setupSecret);
      const [version, expiry, nonce, tag] = proof.split('.');
      const tampered = [
        version,
        expiry,
        nonce,
        (tag[0] === '0' ? '1' : '0') + tag.slice(1),
      ].join('.');
      expect(proof).not.toBe(secondProof);
      await expect(verifySetupProof(proof, setupSecret)).resolves.toBe(true);
      await expect(verifySetupProof(tampered, setupSecret)).resolves.toBe(
        false,
      );
      await expect(verifySetupProof(proof + '\n', setupSecret)).resolves.toBe(
        false,
      );
      await expect(
        verifySetupProof(proof, 'rotated-' + setupSecret),
      ).resolves.toBe(false);
      vi.setSystemTime(new Date('2026-01-01T00:09:59Z'));
      await expect(verifySetupProof(proof, setupSecret)).resolves.toBe(true);
      vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
      await expect(verifySetupProof(proof, setupSecret)).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
