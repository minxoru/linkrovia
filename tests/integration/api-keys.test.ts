import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import {
  authorizeApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../src/lib/server/auth/api-keys';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  const sql = await readFile(
    new URL('../../migrations/0001_initial.sql', import.meta.url),
    'utf8',
  );
  const statements = sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, role) VALUES
       ('owner', 'owner@example.com', 'unused', 'owner'),
       ('admin', 'admin@example.com', 'unused', 'admin')`,
    )
    .run();
}, 15_000);

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM api_keys'),
    db.prepare('UPDATE users SET disabled_at = NULL'),
  ]);
});

afterAll(async () => {
  await platform?.dispose();
});

async function issueKey(userId = 'owner') {
  const key = await createApiKey(db, userId, {
    name: 'Test automation',
    scopes: ['links:read'],
  });
  if (!key) throw new Error('Could not issue test key');
  return key;
}

describe('scoped API keys in local D1', () => {
  it('shows the opaque key at issuance and stores only its fingerprint', async () => {
    const key = await issueKey();
    expect(key.token).toMatch(/^lrk_[0-9a-f]{12}_[0-9a-f]{64}$/);
    expect(key.prefix).toBe(key.token.slice(0, 16));
    expect(
      await db
        .prepare('SELECT key_hash FROM api_keys WHERE id = ?')
        .bind(key.id)
        .first(),
    ).toEqual({
      key_hash: createHash('sha256').update(key.token).digest('hex'),
    });
    const keys = await listApiKeys(db, 'owner');
    expect(keys).toEqual([
      {
        id: key.id,
        name: 'Test automation',
        prefix: key.prefix,
        scopes: ['links:read'],
        createdAt: expect.any(Number),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    expect(await listApiKeys(db, 'admin')).toEqual([]);
    expect((await issueKey()).token).not.toBe(key.token);
  });

  it('rejects missing, unknown, invalid expiry, and disabled-principal issuance', async () => {
    const name = 'Automation';
    await expect(
      createApiKey(db, 'owner', { name, scopes: [] }),
    ).resolves.toBeNull();
    await expect(
      createApiKey(db, 'owner', { name, scopes: ['links:delete'] }),
    ).resolves.toBeNull();
    await expect(
      createApiKey(db, 'owner', { name, scopes: ['links:read'], expiresAt: 1 }),
    ).resolves.toBeNull();
    await db
      .prepare("UPDATE users SET disabled_at = unixepoch() WHERE id = 'owner'")
      .run();
    await expect(
      createApiKey(db, 'owner', { name, scopes: ['links:read'] }),
    ).resolves.toBeNull();
    expect(await listApiKeys(db, 'owner')).toEqual([]);
  });

  it('authorizes only the granted scope and recognizes the Bearer scheme', async () => {
    const key = await issueKey();
    const header = 'bearer ' + key.token;
    await expect(
      authorizeApiKey(db, header, 'links:write'),
    ).resolves.toBeNull();
    await expect(
      authorizeApiKey(db, key.token, 'links:read'),
    ).resolves.toBeNull();
    expect((await listApiKeys(db, 'owner'))[0].lastUsedAt).toBeNull();
    await expect(authorizeApiKey(db, header, 'links:read')).resolves.toEqual({
      id: key.id,
      userId: 'owner',
      role: 'owner',
      scopes: ['links:read'],
    });
  });

  it('returns scoped identity when callers need to check permissions separately', async () => {
    const key = await issueKey();
    const header = 'Bearer ' + key.token;
    await expect(authorizeApiKey(db, header)).resolves.toMatchObject({
      id: key.id,
      scopes: ['links:read'],
    });
    await db.prepare("UPDATE api_keys SET scopes = 'invalid JSON'").run();
    await expect(authorizeApiKey(db, header)).resolves.toBeNull();
  });

  it('denies keys after expiration, revocation, and user disablement', async () => {
    const expired = await issueKey();
    const revoked = await issueKey();
    const disabled = await issueKey('admin');
    await db
      .prepare('UPDATE api_keys SET expires_at = unixepoch() WHERE id = ?')
      .bind(expired.id)
      .run();
    await expect(revokeApiKey(db, 'admin', revoked.id)).resolves.toBe(false);
    await expect(
      authorizeApiKey(db, 'Bearer ' + revoked.token, 'links:read'),
    ).resolves.not.toBeNull();
    await expect(revokeApiKey(db, 'owner', revoked.id)).resolves.toBe(true);
    await db
      .prepare("UPDATE users SET disabled_at = unixepoch() WHERE id = 'admin'")
      .run();
    for (const key of [expired, revoked, disabled]) {
      await expect(
        authorizeApiKey(db, 'Bearer ' + key.token, 'links:read'),
      ).resolves.toBeNull();
    }
  });

  it('records successful use at most once per UTC day', async () => {
    const key = await issueKey();
    await db
      .prepare(
        "UPDATE api_keys SET last_used_at = unixepoch('now', 'start of day')",
      )
      .run();
    const today = (await listApiKeys(db, 'owner'))[0].lastUsedAt;
    await authorizeApiKey(db, 'Bearer ' + key.token, 'links:read');
    expect((await listApiKeys(db, 'owner'))[0].lastUsedAt).toBe(today);
    await db
      .prepare(
        "UPDATE api_keys SET last_used_at = unixepoch('now', 'start of day', '-1 day')",
      )
      .run();
    await authorizeApiKey(db, 'Bearer ' + key.token, 'links:read');
    expect(
      (await listApiKeys(db, 'owner'))[0].lastUsedAt,
    ).toBeGreaterThanOrEqual(today!);
  });

  it('validates dry-run requests without changing the last-used time', async () => {
    const key = await issueKey();
    await expect(
      authorizeApiKey(db, 'Bearer ' + key.token, 'links:read', {
        recordUse: false,
      }),
    ).resolves.toMatchObject({ id: key.id });
    expect((await listApiKeys(db, 'owner'))[0].lastUsedAt).toBeNull();
  });
});
