import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { loadOperationsHealth } from '../../src/lib/server/operations/health';

const seconds = (iso: string) => Date.parse(iso) / 1000;
const opened = seconds('2026-11-21T12:00:00Z');
const now = seconds('2026-11-23T05:00:00Z');

let db: D1Database;
let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  for (const file of [
    '0001_initial',
    '0006_backup',
    '0007_conversions',
    '0008_conversion_rollups',
  ]) {
    const sql = await readFile(
      new URL(`../../migrations/${file}.sql`, import.meta.url),
      'utf8',
    );
    await db.batch(
      unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
    );
  }
  await db.batch([
    db.prepare(
      "INSERT INTO domains (id,hostname) VALUES ('domain','example.test')",
    ),
    db.prepare(
      "INSERT INTO links (id,domain_id,slug,destination_url) VALUES ('link','domain','test','https://example.test/')",
    ),
    db.prepare(
      "INSERT INTO conversion_goals (id,name,event_name) VALUES ('goal','Goal','event')",
    ),
  ]);
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM conversion_receipts'),
    db.prepare('DELETE FROM click_attributions'),
    db.prepare('DELETE FROM rollup_jobs'),
    db
      .prepare('UPDATE setup_state SET completed_at = ? WHERE singleton = 1')
      .bind(opened),
  ]);
});

function health(nowSeconds = now) {
  return loadOperationsHealth(
    { DB: db },
    { development: true, now: nowSeconds },
  );
}

it('shows a fresh installation waiting until the first daily deadline', async () => {
  const result = await health(seconds('2026-11-22T03:14:59Z'));
  expect(result).toMatchObject({
    database: { status: 'available' },
    analytics: 'local',
    clicks: {
      latestDay: null,
      completedAt: null,
      status: 'waiting',
      missingDays: [],
    },
    conversions: { oldestDueAt: null, status: 'current' },
    version: null,
  });
  expect(result.database.sizeBytes).toBeGreaterThan(0);
  expect((await health(seconds('2026-11-22T03:15:00Z'))).clicks.status).toBe(
    'pending',
  );
});

it('distinguishes a zero-event snapshot from an overdue or failed daily job', async () => {
  const completedAt = seconds('2026-11-22T03:15:10Z');
  await db
    .prepare(
      "INSERT INTO rollup_jobs (day_utc,status,completed_at) VALUES ('2026-11-21','completed',?)",
    )
    .bind(completedAt)
    .run();
  expect((await health(seconds('2026-11-23T03:14:59Z'))).clicks).toEqual({
    latestDay: '2026-11-21',
    completedAt,
    status: 'current',
    missingDays: [],
  });
  expect((await health()).clicks).toEqual({
    latestDay: '2026-11-21',
    completedAt,
    status: 'overdue',
    missingDays: ['2026-11-22'],
  });
  await db
    .prepare(
      "INSERT INTO rollup_jobs (day_utc,status,error_code) VALUES ('2026-11-22','failed','secret')",
    )
    .run();
  const result = (await health()).clicks;
  expect(result.status).toBe('failed');
  expect(JSON.stringify(result)).not.toContain('secret');
});

it('reports only work eligible for conversion aggregation', async () => {
  const old = now - 32 * 86400;
  await db.batch([
    db
      .prepare(
        "INSERT INTO click_attributions (ref_hash,link_id,created_at,expires_at) VALUES ('expired','link',?,?),('unexpired','link',?,?)",
      )
      .bind(old, now - 1, old - 55, now + 1),
    db
      .prepare(
        "INSERT INTO conversion_receipts (id,goal_id,click_ref_hash,dedupe_key_hash,occurred_at,status,created_at) VALUES ('blocked','goal','unexpired','x',?,'accepted',?),('recent','goal',NULL,'y',?,'unattributed',?)",
      )
      .bind(old - 100, old - 100, now - 2, now - 1),
  ]);
  expect((await health()).conversions).toEqual({
    oldestDueAt: now - 1,
    status: 'pending',
  });
  await db
    .prepare(
      "INSERT INTO conversion_receipts (id,goal_id,dedupe_key_hash,occurred_at,status,created_at) VALUES ('ready','goal','z',?,'unattributed',?)",
    )
    .bind(old - 200, old - 100)
    .run();
  expect((await health()).conversions).toEqual({
    oldestDueAt: seconds('2026-11-22T00:00:00Z'),
    status: 'pending',
  });
});

it('queries the fixed Analytics SQL binding and reports independent failures', async () => {
  const query = vi.fn(async () => ({
    data: [],
  })) as unknown as AnalyticsSQLBinding['query'];
  const version = {
    id: 'b4035300-8384-4bd1-81ca-c94463189596',
    timestamp: '2026-11-20T03:15:00.000Z',
    tag: 'secret',
  };
  const result = await loadOperationsHealth(
    { DB: db, ANALYTICS_SQL: { query }, CF_VERSION_METADATA: version },
    { development: false, now },
  );
  expect(query).toHaveBeenCalledWith(
    expect.objectContaining({
      query: expect.stringContaining(
        'FROM events.analyticsEngine.linkrovia_clicks',
      ),
      params: {
        from: '2026-11-23T04:00:00.000Z',
        to: '2026-11-23T05:00:00.000Z',
      },
    }),
  );
  expect(result.analytics).toBe('available');
  expect(result.version).toEqual({
    id: version.id,
    timestamp: version.timestamp,
  });
  const failed = await loadOperationsHealth(
    {
      DB: db,
      ANALYTICS_SQL: {
        query: async () => {
          throw new Error('secret');
        },
      },
    },
    { development: false, now },
  );
  expect(failed.analytics).toBe('unavailable');
  expect(failed.database.status).toBe('available');
  expect(JSON.stringify(failed)).not.toContain('secret');
  const missingDatabase = await loadOperationsHealth(
    { ANALYTICS_SQL: { query } },
    { development: false, now },
  );
  expect(missingDatabase).toMatchObject({
    analytics: 'available',
    database: { status: 'unavailable', sizeBytes: null },
    clicks: { status: 'unavailable', missingDays: [] },
    conversions: { status: 'unavailable', oldestDueAt: null },
  });
  expect(
    (await loadOperationsHealth({}, { development: false, now })).analytics,
  ).toBe('unconfigured');
});
