import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import {
  authenticate,
  checkCsrfToken,
  createSession,
  getSession,
  revokeSession,
} from '../../src/lib/server/auth/session';
import { registerOwner, setupComplete } from '../../src/lib/server/auth/setup';

const password = 'A suitable test password';
const ownerEmail = 'owner@example.com';
let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  for (const migration of [
    '0001_initial.sql',
    '0002_domain_connections.sql',
    '0005_user_theme.sql',
  ]) {
    const sql = await readFile(
      new URL('../../migrations/' + migration, import.meta.url),
      'utf8',
    );
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}, 15_000);

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM users'),
    db.prepare('DELETE FROM domains'),
    db.prepare(
      'UPDATE setup_state SET completed_at = NULL, owner_user_id = NULL, token_consumed_at = NULL',
    ),
  ]);
});

afterAll(async () => {
  await platform?.dispose();
});

async function createOwnerSession(): Promise<string> {
  await registerOwner(db, { email: ownerEmail, password, locale: 'ja' });
  const ownerId = await authenticate(db, ownerEmail, password);
  if (!ownerId) throw new Error('Test owner could not sign in');
  return createSession(db, ownerId);
}

describe('first owner in local D1', () => {
  it('commits exactly one owner and consumes setup under ten concurrent registrations', async () => {
    expect(await setupComplete(db)).toBe(false);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        registerOwner(db, {
          email: `owner${index}@example.com`,
          password,
          managementHostname: `go${index}.example.com`,
        }),
      ),
    );
    const winner = attempts.indexOf(true);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const { results } = await db
      .prepare('SELECT id, role, email FROM users')
      .all<{ id: string; role: string; email: string }>();
    expect(results).toEqual([
      {
        id: expect.stringMatching(
          /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
        ),
        role: 'owner',
        email: `owner${winner}@example.com`,
      },
    ]);
    expect(
      await db
        .prepare(
          'SELECT owner_user_id, completed_at, token_consumed_at FROM setup_state WHERE singleton = 1',
        )
        .first(),
    ).toEqual({
      owner_user_id: results[0].id,
      completed_at: expect.any(Number),
      token_consumed_at: expect.any(Number),
    });
    expect(await setupComplete(db)).toBe(true);
    const domains = await db
      .prepare(
        'SELECT hostname, is_primary, connection_status, provider_mode FROM domains',
      )
      .all();
    expect(domains.results).toEqual([
      {
        hostname: `go${winner}.example.com`,
        is_primary: 1,
        connection_status: 'active',
        provider_mode: 'unconfigured',
      },
    ]);
    expect(await registerOwner(db, { email: ownerEmail, password })).toBe(
      false,
    );
  }, 15_000);

  it('does not consume setup when owner creation fails', async () => {
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, role) VALUES ('existing', ?, 'invalid', 'admin')",
      )
      .bind(ownerEmail)
      .run();
    await expect(
      registerOwner(db, { email: ownerEmail, password }),
    ).rejects.toThrow();
    expect(await setupComplete(db)).toBe(false);
  });

  it('preserves the configured primary domain when setup creates the owner', async () => {
    await db
      .prepare(
        "INSERT INTO domains (id, hostname, is_primary) VALUES ('existing', 'original.example.com', 1)",
      )
      .run();
    await expect(
      registerOwner(db, {
        email: ownerEmail,
        password,
        managementHostname: 'workers.example.com',
      }),
    ).resolves.toBe(true);
    const { results } = await db.prepare('SELECT hostname FROM domains').all();
    expect(results).toEqual([{ hostname: 'original.example.com' }]);
  });

  it('uses the existing domain row when the management hostname is already configured', async () => {
    await db
      .prepare(
        "INSERT INTO domains (id, hostname, provider_mode, connection_status) VALUES ('existing', 'workers.example.com', 'external_dns_guided', 'active')",
      )
      .run();
    await expect(
      registerOwner(db, {
        email: ownerEmail,
        password,
        managementHostname: 'workers.example.com',
      }),
    ).resolves.toBe(true);
    const { results } = await db
      .prepare('SELECT id, is_primary, provider_mode FROM domains')
      .all();
    expect(results).toEqual([
      { id: 'existing', is_primary: 1, provider_mode: 'external_dns_guided' },
    ]);
  });
});

describe('sessions in local D1', () => {
  it('reads a saved theme from the user across sessions and rejects invalid values', async () => {
    const token = await createOwnerSession();
    const session = await getSession(db, token);
    const userId = session!.user.id;
    const updateTheme = db.prepare('UPDATE users SET theme = ? WHERE id = ?');

    await updateTheme.bind('dark', userId).run();
    const secondToken = await createSession(db, userId);
    expect((await getSession(db, token))?.user.theme).toBe('dark');
    expect((await getSession(db, secondToken))?.user.theme).toBe('dark');

    await expect(updateTheme.bind('invalid', userId).run()).rejects.toThrow(
      'CHECK constraint failed',
    );
    expect((await getSession(db, secondToken))?.user.theme).toBe('dark');
  });

  it('stores only the hash of a seven-day bearer and derives session-specific CSRF tokens', async () => {
    const token = await createOwnerSession();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await db
      .prepare(
        'SELECT token_hash, expires_at - created_at AS duration FROM sessions',
      )
      .first();
    expect(stored).toEqual({
      token_hash: createHash('sha256').update(token).digest('hex'),
      duration: 604800,
    });
    const session = await getSession(db, token);
    expect(session?.user).toEqual({
      id: expect.any(String),
      email: ownerEmail,
      locale: 'ja',
      role: 'owner',
      timezone: null,
      theme: 'system',
    });
    expect(session?.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.csrfToken).not.toBe(token);
    expect(session?.csrfToken).not.toBe(stored?.token_hash);
    const secondToken = await createSession(db, session!.user.id);
    const secondSession = await getSession(db, secondToken);
    expect(secondToken).not.toBe(token);
    expect(await checkCsrfToken(session!.csrfToken, session!.csrfToken)).toBe(
      true,
    );
    expect(
      await checkCsrfToken(secondSession!.csrfToken, session!.csrfToken),
    ).toBe(false);
    expect(
      await checkCsrfToken(session!.csrfToken + '\n', session!.csrfToken),
    ).toBe(false);
  });

  it('revokes only the session logged out', async () => {
    const token = await createOwnerSession();
    const session = await getSession(db, token);
    const secondToken = await createSession(db, session!.user.id);
    await revokeSession(db, token);
    await revokeSession(db, token);
    await expect(getSession(db, token)).resolves.toBeNull();
    await expect(getSession(db, secondToken)).resolves.not.toBeNull();
  });

  it('rejects a session at the expiration boundary', async () => {
    const token = await createOwnerSession();
    await db.prepare('UPDATE sessions SET expires_at = unixepoch()').run();
    await expect(getSession(db, token)).resolves.toBeNull();
  });

  it('rejects credentials and sessions for disabled accounts', async () => {
    const token = await createOwnerSession();
    await db.prepare('UPDATE users SET disabled_at = unixepoch()').run();
    await expect(authenticate(db, ownerEmail, password)).resolves.toBeNull();
    await expect(getSession(db, token)).resolves.toBeNull();
  });

  it('rejects invalid login attempts', async () => {
    await createOwnerSession();
    await expect(
      authenticate(db, 'nobody@example.com', password),
    ).resolves.toBeNull();
    await expect(
      authenticate(db, ownerEmail, 'wrong test password'),
    ).resolves.toBeNull();
  });
});
