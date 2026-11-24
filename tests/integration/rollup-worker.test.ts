import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import {
  loadClickRepair,
  processClickRepair,
  queueClickRepair,
} from '../../src/lib/server/analytics/click-repair';
import worker from '../../workers/rollup';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
const schedule = '15,45 * * * *';

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).sort()) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    await platform.env.DB.batch(
      unstable_splitSqlQuery(sql).map((statement) =>
        platform.env.DB.prepare(statement),
      ),
    );
  }
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

beforeEach(async () => {
  await platform.env.DB.batch(
    ['click_rollup_repair', 'analytics_rollups', 'rollup_jobs'].map((table) =>
      platform.env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});

it('rolls up yesterday and reconciles a previously uncovered day on the hourly schedule', async () => {
  const { DB } = platform.env;
  const query = vi.fn(async () => ({
    rows: 0,
    statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
    data: [],
  }));
  const env = { DB, ANALYTICS_SQL: { query } as AnalyticsSQLBinding };
  const scheduledDay = new Date(Date.now() - 86_400_000);
  const dailyTime = scheduledDay.setUTCHours(3, 15, 0, 0);
  const yesterday = new Date(dailyTime - 86_400_000).toISOString().slice(0, 10);
  const previous = new Date(dailyTime - 2 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const scheduledTime of [
    dailyTime,
    scheduledDay.setUTCHours(3, 45, 0, 0),
    scheduledDay.setUTCHours(4, 45, 0, 0),
  ]) {
    await worker.scheduled(
      { scheduledTime, cron: schedule, noRetry() {} },
      env,
    );
  }

  const { results } = await DB.prepare(
    'SELECT day_utc, status, attempt_count FROM rollup_jobs ORDER BY day_utc DESC',
  ).all();
  expect(results).toHaveLength(3);
  expect(results.slice(0, 2)).toEqual([
    { day_utc: yesterday, status: 'completed', attempt_count: 1 },
    { day_utc: previous, status: 'completed', attempt_count: 1 },
  ]);
});

it.each([0, 2, 4, 23])(
  'skips %i:15 UTC without accessing bindings',
  async (hour) => {
    await worker.scheduled(
      {
        scheduledTime: Date.UTC(2026, 0, 11, hour, 15),
        cron: schedule,
        noRetry() {},
      },
      {
        get DB(): never {
          throw new Error('Unexpected D1 access');
        },
        get ANALYTICS_SQL(): never {
          throw new Error('Unexpected Analytics SQL access');
        },
      },
    );
  },
);

it('runs the hourly schedule without an analytics binding while tracking is deferred', async () => {
  const { DB } = platform.env;
  await worker.scheduled(
    {
      scheduledTime: new Date().setUTCMinutes(45, 0, 0),
      cron: schedule,
      noRetry() {},
    },
    { DB },
  );
  expect(
    await DB.prepare('SELECT COUNT(*) AS count FROM rollup_jobs').first(
      'count',
    ),
  ).toBe(0);
});

it('validates, bounds and restores a missing day outside automatic reconciliation', async () => {
  const { DB } = platform.env;
  const now = Math.floor(Date.now() / 1000);
  const scheduledTime = new Date(Date.now() - 3_600_000).setUTCMinutes(
    45,
    0,
    0,
  );
  const date = new Date(now * 1000 - 15 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const anotherDate = new Date(now * 1000 - 16 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  expect(await queueClickRepair(DB, '2026-02-30', now)).toBe('invalid');
  expect(await queueClickRepair(DB, date, now)).toBe('queued');
  expect(await queueClickRepair(DB, anotherDate, now)).toBe('limited');

  const query = vi.fn(async () => ({
    rows: 0,
    statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
    data: [],
  }));
  await worker.scheduled(
    { scheduledTime, cron: schedule, noRetry() {} },
    { DB, ANALYTICS_SQL: { query } as AnalyticsSQLBinding },
  );

  expect(await loadClickRepair(DB, now)).toMatchObject({
    latestRequest: { date, status: 'restored' },
  });
  expect(await queueClickRepair(DB, date, now)).toBe('alreadyStored');
  expect(await queueClickRepair(DB, anotherDate, now)).toBe('limited');
  const count = await DB.prepare(
    'SELECT COUNT(*) AS count FROM rollup_jobs',
  ).first<number>('count');
  expect(count).toBe(1);
});

it('backs off failed attempts, then reports the final failure or out-of-window date', async () => {
  const db = platform.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const hour = 3600;
  const day = 24 * hour;
  const date = new Date((now - 9 * day) * 1000).toISOString().slice(0, 10);
  const getDailyClickRollup = vi.fn(async () => {
    throw new Error('provider unavailable');
  });
  const repository = { getDailyClickRollup };

  expect(await queueClickRepair(db, date, now)).toBe('queued');
  expect(await processClickRepair(db, repository, now)).toMatchObject({
    status: 'failed',
    code: 'analytics_query',
  });
  expect(await processClickRepair(db, repository, now + hour)).toBeNull();
  expect((await loadClickRepair(db, now + hour)).latestRequest).toMatchObject({
    status: 'retrying',
    attempts: 1,
  });
  expect(
    await processClickRepair(db, repository, now + 2 * hour),
  ).toMatchObject({
    status: 'failed',
  });
  expect(await processClickRepair(db, repository, now + 5 * hour)).toBeNull();
  expect(
    await processClickRepair(db, repository, now + 6 * hour),
  ).toMatchObject({
    status: 'failed',
  });
  expect(await processClickRepair(db, repository, now + 7 * hour)).toBeNull();
  expect(
    (await loadClickRepair(db, now + 7 * hour)).latestRequest,
  ).toMatchObject({
    status: 'failed',
    attempts: 3,
  });
  expect(await processClickRepair(db, repository, now + 91 * day)).toBeNull();
  expect(
    (await loadClickRepair(db, now + 91 * day)).latestRequest,
  ).toMatchObject({
    status: 'expired',
  });
  expect(getDailyClickRollup).toHaveBeenCalledTimes(3);
});
