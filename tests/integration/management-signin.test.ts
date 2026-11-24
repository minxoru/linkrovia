import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import {
  authorizeManagementSignIn,
  consumeManagementSignIn,
  startManagementSignIn,
} from '../../src/lib/server/auth/management-signin';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

const target = new URL('https://links.example.com');
const owner = 'owner';

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).sort()) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((sql) => db.prepare(sql)));
  }
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES ('owner', 'owner@example.com', 'unused', 'owner')",
    ),
    db.prepare(`INSERT INTO domains
      (id, hostname, is_active, connection_status, verified_at, provider_mode, management_enabled)
      VALUES ('target', 'links.example.com', 1, 'active', unixepoch(), 'cloudflare_custom_domain', 1)`),
  ]);
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

async function pending() {
  const flow = await startManagementSignIn(db, target);
  if (!flow) throw new Error('Could not start transfer');
  return flow;
}

async function authorized() {
  const { state, verifier } = await pending();
  const location = await authorizeManagementSignIn(db, state, owner);
  const code = location?.searchParams.get('code');
  if (!code) throw new Error('Could not authorize transfer');
  return { code, verifier };
}

it('consumes a code exactly once under concurrent requests', async () => {
  const { code, verifier } = await authorized();
  const results = await Promise.all([
    consumeManagementSignIn(db, target, code, verifier),
    consumeManagementSignIn(db, target, code, verifier),
  ]);
  expect(results.filter((result) => result === owner)).toHaveLength(1);
  expect(await consumeManagementSignIn(db, target, code, verifier)).toBeNull();
});

it('rejects a valid code at a different origin on the opted-in hostname', async () => {
  const { code, verifier } = await authorized();
  const other = new URL('https://links.example.com:8443');
  expect(await consumeManagementSignIn(db, other, code, verifier)).toBeNull();
  expect(await consumeManagementSignIn(db, target, code, verifier)).toBe(owner);
});

it('requires the same browser verifier to consume a code', async () => {
  const { code, verifier } = await authorized();
  expect(
    await consumeManagementSignIn(db, target, code, 'a'.repeat(64)),
  ).toBeNull();
  expect(await consumeManagementSignIn(db, target, code, verifier)).toBe(owner);
});

it('does not use the primary state as the target code', async () => {
  const { state, verifier } = await pending();
  const location = await authorizeManagementSignIn(db, state, owner);
  expect(location?.searchParams.get('code')).not.toBe(state);
  expect(await consumeManagementSignIn(db, target, state, verifier)).toBeNull();
  expect(await authorizeManagementSignIn(db, state, owner)).toBeNull();
});

it('rejects a code once the flow expires', async () => {
  const { code, verifier } = await authorized();
  await db
    .prepare('UPDATE management_signins SET expires_at = unixepoch()')
    .run();
  expect(await consumeManagementSignIn(db, target, code, verifier)).toBeNull();
});

it('rejects a code once management access is switched off', async () => {
  const { code, verifier } = await authorized();
  await db
    .prepare("UPDATE domains SET management_enabled = 0 WHERE id = 'target'")
    .run();
  try {
    expect(
      await consumeManagementSignIn(db, target, code, verifier),
    ).toBeNull();
  } finally {
    await db
      .prepare("UPDATE domains SET management_enabled = 1 WHERE id = 'target'")
      .run();
  }
});

it('rejects a code after the user is disabled', async () => {
  const { code, verifier } = await authorized();
  await db
    .prepare("UPDATE users SET disabled_at = unixepoch() WHERE id = 'owner'")
    .run();
  try {
    expect(
      await consumeManagementSignIn(db, target, code, verifier),
    ).toBeNull();
  } finally {
    await db
      .prepare("UPDATE users SET disabled_at = NULL WHERE id = 'owner'")
      .run();
  }
});
