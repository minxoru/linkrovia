import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import {
  createBackup,
  type BackupDocument,
} from '../../src/lib/server/backup/format';
import {
  issueManifest,
  verifyManifest,
  downloadReceipt,
  verifyDownload,
} from '../../src/lib/server/backup/manifest';
import { planRestore } from '../../src/lib/server/backup/restore';
import { readBackupState } from '../../src/lib/server/backup/snapshot';

const options = { mode: 'replace', conflict: 'overwrite' } as const;
const foreign = 'f'.repeat(32);
let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).sort()) {
    const text = await readFile(new URL(file, migrations), 'utf8');
    await db.batch(unstable_splitSqlQuery(text).map((sql) => db.prepare(sql)));
  }
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES ('owner', 'owner@example.com', 'private', 'owner')",
    ),
    db.prepare(
      "INSERT INTO domains (id, hostname, is_primary, connection_status) VALUES ('primary', 'go.example.com', 1, 'active'), ('secondary', 'links.example.com', 0, 'active')",
    ),
    db.prepare(
      "INSERT INTO links (id, domain_id, slug, destination_url, protection_mode) VALUES ('once', 'secondary', 'claim', 'https://example.com/', 'one_time')",
    ),
    db.prepare(
      "INSERT INTO links (id, domain_id, slug, destination_url, protection_mode, protection_password_hash) VALUES ('locked', 'primary', 'locked', 'https://example.net/', 'password', '!backup-locked')",
    ),
    db.prepare(
      "INSERT INTO conversion_goals (id, name, link_id, event_name) VALUES ('goal', 'Signup', 'once', 'signup')",
    ),
    db.prepare(
      "INSERT INTO conversion_receipts (id, goal_id, dedupe_key_hash, occurred_at, link_id, status) VALUES ('receipt', 'goal', 'fixture', 50, 'once', 'accepted')",
    ),
    db.prepare(
      "INSERT INTO qr_codes (id, link_id, token) VALUES ('default:once', 'once', 'private-token')",
    ),
  ]);
}, 20_000);

afterAll(async () => platform?.dispose());

async function restore(backup: BackupDocument) {
  const state = await readBackupState(db, backup);
  const plan = planRestore(db, 'owner', state, backup, options);
  await db.batch(plan.statements);
  return plan.result;
}

it('restores the previous secondary domain and goal identity without reopening a consumed or locked link', async () => {
  const before = await readBackupState(db);
  const saved = await createBackup(before.data, before.instanceId);
  await db
    .prepare(
      "UPDATE links SET slug = 'renamed', consumed_at = 123 WHERE id = 'once'",
    )
    .run();
  expect(await restore(saved)).toMatchObject({
    preview: { locked: 1 },
    linkIds: { once: 'once' },
  });
  expect(
    await db
      .prepare("SELECT slug, consumed_at FROM links WHERE id = 'once'")
      .first(),
  ).toEqual({ slug: 'claim', consumed_at: 123 });
  expect(
    await db
      .prepare("SELECT is_active FROM links WHERE id = 'locked'")
      .first('is_active'),
  ).toBe(0);

  const empty = await createBackup(
    {
      ...before.data,
      domains: [],
      links: [],
      conversionGoals: [],
      qrMetadata: [],
    },
    foreign,
  );
  const removed = await restore(empty);
  expect(removed.preview.removed).toBe(5);
  expect(
    await db
      .prepare("SELECT is_primary FROM domains WHERE id = 'primary'")
      .first('is_primary'),
  ).toBe(1);
  expect(
    await db
      .prepare("SELECT is_active FROM domains WHERE id = 'secondary'")
      .first('is_active'),
  ).toBe(0);

  expect(await restore(saved)).toMatchObject({
    preview: { qrRegenerated: 1, domainsToConnect: 0 },
    qrIds: { 'default:once': 'default:once' },
  });
  const after = (await readBackupState(db)).data;
  expect(after.domains).toContainEqual(
    expect.objectContaining({ id: 'secondary', isActive: true }),
  );
  expect(after.links).toContainEqual(
    expect.objectContaining({ id: 'once', consumedAt: 123 }),
  );
  expect(after.conversionGoals).toContainEqual(
    expect.objectContaining({ id: 'goal', linkId: 'once' }),
  );
  expect(
    await db
      .prepare('SELECT goal_id FROM conversion_receipts')
      .first('goal_id'),
  ).toBe('goal');
  expect(
    await db
      .prepare("SELECT password_hash FROM users WHERE id = 'owner'")
      .first('password_hash'),
  ).toBe('private');
  expect(
    await db
      .prepare("SELECT token FROM qr_codes WHERE id = 'default:once'")
      .first('token'),
  ).not.toBe('private-token');
});

it('rejects a merge whose resulting configuration would exceed the file limit', async () => {
  const state = await readBackupState(db);
  const old = state.data.links[0];
  const largeUrl = `https://example.com/?value=${'a'.repeat(6800)}`;
  const extra = (prefix: string) =>
    Array.from({ length: 11 }, (_, n) => ({
      ...old,
      id: `fixture-${prefix}-${n}`,
      slug: `${prefix}-${n}`,
      destinationUrl: largeUrl,
      redirectType: 302 as const,
      isActive: true,
      protectionMode: 'none' as const,
      consumedAt: null,
    }));
  const existing = extra('existing');
  for (const link of existing) {
    await db
      .prepare(
        'INSERT INTO links (id, domain_id, slug, destination_url) VALUES (?, ?, ?, ?)',
      )
      .bind(link.id, link.domainId, link.slug, link.destinationUrl)
      .run();
  }
  const backup = await createBackup(
    { ...state.data, links: [...state.data.links, ...extra('incoming')] },
    foreign,
  );
  const current = await readBackupState(db, backup);
  expect(() =>
    planRestore(db, 'owner', current, backup, {
      mode: 'merge',
      conflict: 'skip',
    }),
  ).toThrow('too_large');
  await expect(
    createBackup(current.data, current.instanceId),
  ).resolves.toMatchObject({ schemaVersion: 1 });
});

it('binds a manifest and replacement receipt to the current owner session', () => {
  const key = 'ab'.repeat(32);
  const checksum = 'bc'.repeat(32);
  const manifest = issueManifest(key, 'owner-session', options, checksum, 12);
  expect(verifyManifest(key, 'owner-session', manifest)).toMatchObject({
    checksum,
    revision: 12,
    ...options,
  });
  expect(() => verifyManifest(key, 'another-session', manifest)).toThrow(
    'stale_manifest',
  );
  const receipt = downloadReceipt(key, 'owner-session', manifest);
  expect(verifyDownload(key, 'owner-session', manifest, receipt)).toBe(true);
  expect(verifyDownload(key, 'another-session', manifest, receipt)).toBe(false);
});
