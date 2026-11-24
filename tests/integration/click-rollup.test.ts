import { readFile } from 'node:fs/promises';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { runDailyClickRollup } from '../../src/lib/server/analytics/click-rollup';
import { InMemoryAnalyticsRepository } from '../../src/lib/server/analytics/in-memory';
import {
  analyticsCsv,
  loadAnalyticsReport,
  parseAnalyticsQuery,
} from '../../src/lib/server/analytics/report';
import type { ClickRollupRow } from '../../src/lib/server/analytics/repository';

const date = '2026-11-21';
const from = Date.parse(date) / 1000;
const to = from + 86400;
const now = to + 3 * 3600;
const total = {
  linkId: 'link-a',
  dimension: 'total',
  value: 'all',
  clicks: 3,
  estimated: true,
} satisfies ClickRollupRow;

let db: D1Database;
let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

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
  await db.batch(
    unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
  );
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM analytics_rollups'),
    db.prepare('DELETE FROM rollup_jobs'),
  ]);
});

function run(getDailyClickRollup: () => Promise<ClickRollupRow[]>, time = now) {
  return runDailyClickRollup({
    date,
    db,
    analyticsRepository: { getDailyClickRollup },
    now: time,
  });
}

async function totals() {
  return (
    await db
      .prepare('SELECT click_count FROM analytics_rollups WHERE dimension = ?')
      .bind('total')
      .all<{ click_count: number }>()
  ).results.map(({ click_count }) => click_count);
}

async function job() {
  return db
    .prepare('SELECT * FROM rollup_jobs WHERE day_utc = ?')
    .bind(date)
    .first();
}

describe('Daily click rollup', () => {
  it('uses UTC bounds, excludes preview and bot traffic from totals, and includes it in traffic breakdowns', async () => {
    const sample = {
      domainId: 'domain',
      linkId: 'link-a',
      country: 'JP',
      region: 'JP-13',
      referrer: 'example.com',
      device: 'mobile',
      os: 'iOS',
      browser: 'Safari',
      ruleId: 'default',
      source: 'qr',
      traffic: 'human',
      clicks: 2,
    } as const;
    const analyticsRepository = new InMemoryAnalyticsRepository(
      [
        { ...sample, timestamp: from - 1 },
        { ...sample, timestamp: from },
        { ...sample, timestamp: to - 1, traffic: 'bot', clicks: 5 },
        { ...sample, timestamp: to },
      ],
      'fixture',
    );
    expect(
      await runDailyClickRollup({ date, db, analyticsRepository, now }),
    ).toMatchObject({
      status: 'completed',
    });
    expect(await totals()).toEqual([2]);
    const { results } = await db
      .prepare(
        "SELECT dimension_value, click_count FROM analytics_rollups WHERE dimension = 'traffic' ORDER BY dimension_value",
      )
      .all();
    expect(results).toEqual([
      { dimension_value: 'bot', click_count: 5 },
      { dimension_value: 'human', click_count: 2 },
    ]);
    expect(await job()).toMatchObject({ estimated: 0 });
  });

  it('replaces a complete day including stale dimensions and reruns without double counting', async () => {
    expect(
      await run(async () => [
        total,
        { ...total, dimension: 'country', value: 'JP' },
      ]),
    ).toMatchObject({
      status: 'completed',
    });
    expect(
      await run(async () => [{ ...total, clicks: 6 }], now + 1),
    ).toMatchObject({
      status: 'completed',
    });
    expect(await totals()).toEqual([6]);
    expect(
      await db
        .prepare('SELECT COUNT(*) AS rows FROM analytics_rollups')
        .first('rows'),
    ).toBe(1);
    expect(await job()).toMatchObject({
      status: 'completed',
      attempt_count: 2,
      completed_at: now + 1,
      estimated: 1,
    });
  });

  it('records source and SQL failures and preserves the previous publication until a successful retry', async () => {
    expect(
      await run(async () => {
        throw new Error('private details');
      }),
    ).toMatchObject({
      status: 'failed',
    });
    expect(await job()).toMatchObject({
      status: 'failed',
      completed_at: null,
      error_code: 'analytics_query',
    });
    await run(async () => [total], now + 1);
    expect(await run(async () => [total, total], now + 2)).toMatchObject({
      status: 'failed',
    });
    expect(await totals()).toEqual([3]);
    expect(await job()).toMatchObject({
      status: 'failed',
      completed_at: now + 1,
      attempt_count: 3,
      error_code: 'storage_write',
    });
    await run(async () => [], now + 3);
    expect(await totals()).toEqual([]);
    expect(await job()).toMatchObject({
      status: 'completed',
      completed_at: now + 3,
      estimated: 0,
      error_code: null,
    });
  });

  it('excludes concurrent or expired attempts from publishing', async () => {
    const started = Promise.withResolvers<void>();
    const slow = Promise.withResolvers<ClickRollupRow[]>();
    const first = run(() => {
      started.resolve();
      return slow.promise;
    });
    await started.promise;
    const query = vi.fn(async () => [total]);
    expect(await run(query, now + 1)).toMatchObject({ status: 'busy' });
    expect(query).not.toHaveBeenCalled();
    expect(
      await run(async () => [{ ...total, clicks: 9 }], now + 901),
    ).toMatchObject({
      status: 'completed',
    });
    slow.resolve([total]);
    expect(await first).toMatchObject({ status: 'superseded' });
    expect(await totals()).toEqual([9]);
    expect(await job()).toMatchObject({
      status: 'completed',
      attempt_count: 2,
    });
  });

  it('preserves gaps when a whole UTC day is outside retention or incomplete', async () => {
    const query = vi.fn(async () => [total]);
    expect(await run(query, from)).toMatchObject({ status: 'unavailable' });
    expect(await run(query, from + 90 * 86400 + 1)).toMatchObject({
      status: 'unavailable',
    });
    expect(
      await runDailyClickRollup({
        date: '2026-02-30',
        db,
        analyticsRepository: { getDailyClickRollup: query },
        now,
      }),
    ).toMatchObject({
      status: 'unavailable',
    });
    expect(query).not.toHaveBeenCalled();
    expect(await job()).toBeNull();
  });
});

describe('Archived click report', () => {
  it('adds retained clicks after the latest saved day without filling older gaps or re-reading saved clicks', async () => {
    await db.batch([
      db.prepare(
        "INSERT INTO rollup_jobs (day_utc, status, completed_at) VALUES ('2026-07-16', 'completed', 1), ('2026-11-21', 'completed', 2)",
      ),
      db.prepare(
        "INSERT INTO analytics_rollups (day_utc, link_id, dimension, dimension_value, click_count) VALUES ('2026-07-16', 'link-a', 'total', 'all', 9), ('2026-07-16', 'link-a', 'country', 'JP', 9), ('2026-11-21', 'link-a', 'total', 'all', 2), ('2026-11-21', 'link-a', 'country', 'JP', 2)",
      ),
    ]);
    const query = parseAnalyticsQuery(
      new URLSearchParams('from=2026-07-16&to=2026-11-22&tz=Asia%2FTokyo'),
      'UTC',
      { allowArchived: true, now },
    );
    const live: AnalyticsSQLBinding = {
      query: vi.fn(async ({ query, params }) => {
        expect(params).toMatchObject({
          from: '2026-11-22T00:00:00.000Z',
          to: '2026-11-22T03:00:00.000Z',
        });
        const data = query.includes('GROUP BY date')
          ? [{ date: '2026-11-22', clicks: 5 }]
          : [
              { blob2: 'JP', clicks: 3 },
              { blob2: 'US', clicks: 2 },
            ];
        return {
          data,
          rows: data.length,
          statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
        };
      }) as AnalyticsSQLBinding['query'],
    };
    const report = await loadAnalyticsReport(
      { DB: db, ANALYTICS_SQL: live },
      query,
      {
        development: false,
      },
    );
    expect(live.query).toHaveBeenCalledTimes(2);
    expect(report.meta).toMatchObject({
      source: 'archive-and-live',
      timezone: 'UTC',
      dateBasis: 'UTC',
      completeThrough: '2026-07-16',
      estimated: true,
    });
    expect(report.meta.gaps).toContain('2026-07-17');
    expect(report.meta.gaps).not.toContain('2026-11-22');
    expect(report.series.slice(-2)).toEqual([
      { date: '2026-11-21', clicks: 2 },
      { date: '2026-11-22', clicks: 5 },
    ]);
    expect(report.totalClicks).toBe(16);
    expect(report.breakdown).toEqual([
      { key: 'JP', clicks: 14 },
      { key: 'US', clicks: 2 },
    ]);
    expect(await analyticsCsv(report, false).text()).toContain(
      '"daily","2026-11-22","","","5","UTC","UTC","true","archive-and-live","day"',
    );

    const fallback = await loadAnalyticsReport(
      {
        DB: db,
        ANALYTICS_SQL: {
          query: async () => {
            throw new Error('analytics unavailable');
          },
        },
      },
      query,
      { development: false },
    );
    expect(fallback.meta.source).toBe('daily-rollup');
    expect(fallback.meta.gaps).toContain('2026-11-22');
    expect(fallback.totalClicks).toBe(11);
  });

  it('shows known zeroes and unknown days separately, uses UTC, and reads one D1 snapshot', async () => {
    await db.batch([
      db.prepare(
        "INSERT INTO rollup_jobs (day_utc, status, completed_at) VALUES ('2026-07-16','completed',1), ('2026-07-17','completed',1), ('2026-07-18','failed',NULL), ('2026-07-19','failed',1)",
      ),
      db.prepare(
        "INSERT INTO analytics_rollups (day_utc,link_id,dimension,dimension_value,click_count,estimated) VALUES ('2026-07-16','removed','total','all',9,1), ('2026-07-16','removed','country','JP',9,1), ('2026-07-18','removed','total','all',99,0), ('2026-07-19','removed','total','all',2,0), ('2026-07-19','removed','country','IT',2,0)",
      ),
    ]);
    const query = parseAnalyticsQuery(
      new URLSearchParams({
        from: '2026-07-16',
        to: '2026-07-19',
        tz: 'Asia/Tokyo',
      }),
      'UTC',
      { allowArchived: true, now },
    );
    const live = vi.fn(async () => {
      throw new Error('unexpected live query');
    });
    const report = await loadAnalyticsReport(
      { DB: db, ANALYTICS_SQL: { query: live } },
      query,
      { development: false },
    );
    expect(live).not.toHaveBeenCalled();
    expect(report.meta).toMatchObject({
      timezone: 'UTC',
      dateBasis: 'UTC',
      source: 'daily-rollup',
      completeThrough: '2026-07-17',
      gaps: ['2026-07-18'],
      estimated: true,
    });
    expect(report.totalClicks).toBe(11);
    const monthly = await loadAnalyticsReport(
      { DB: db, ANALYTICS_SQL: { query: live } },
      { ...query, granularity: 'month' },
      { development: false },
    );
    expect(monthly.meta).toMatchObject({
      granularity: 'month',
      gaps: ['2026-07-18'],
    });
    expect(monthly.totalClicks).toBe(11);
    expect(monthly.series).toEqual([{ date: '2026-07-16', clicks: null }]);
    expect(report.series.map(({ clicks }) => clicks)).toEqual([9, 0, null, 2]);
    expect(report.breakdown).toEqual([
      { key: 'JP', clicks: 9 },
      { key: 'IT', clicks: 2 },
    ]);
    expect(await analyticsCsv(report, false).text()).toContain(
      '"daily","2026-07-18","","","","UTC"',
    );
  });

  it('includes all saved months, including totals older than a one-year request', async () => {
    await db.batch([
      db.prepare(
        "INSERT INTO rollup_jobs (day_utc, status, completed_at) VALUES ('2024-12-31', 'completed', 1)",
      ),
      db.prepare(
        "INSERT INTO analytics_rollups (day_utc, link_id, dimension, dimension_value, click_count) VALUES ('2024-12-31', 'legacy', 'total', 'all', 7)",
      ),
    ]);
    const parsed = parseAnalyticsQuery(
      new URLSearchParams('range=all'),
      'Asia/Tokyo',
      { allowArchived: true, now },
    );
    const report = await loadAnalyticsReport(
      {
        DB: db,
        ANALYTICS_SQL: {
          query: async () => {
            throw new Error('unexpected live query');
          },
        },
      },
      parsed,
      { development: false },
    );
    expect(report.meta).toMatchObject({
      from: '2024-12-31',
      granularity: 'month',
      timezone: 'UTC',
    });
    expect(report.totalClicks).toBe(7);
    expect(report.series.slice(0, 2)).toEqual([
      { date: '2024-12-31', clicks: 7 },
      { date: '2025-01-01', clicks: null },
    ]);
  });

  it('scopes archived queries by current link domain and rejects unsupported cross-dimension filters', async () => {
    await db.batch([
      db.prepare(
        "INSERT INTO domains(id, hostname) VALUES ('archived-domain', 'archive.example.com')",
      ),
      db.prepare(
        "INSERT INTO links(id,domain_id,slug,destination_url,deleted_at) VALUES ('soft-deleted','archived-domain','old','https://example.com',1)",
      ),
      db.prepare(
        "INSERT INTO rollup_jobs (day_utc,status,completed_at) VALUES ('2026-07-16','completed',1)",
      ),
      db.prepare(
        "INSERT INTO analytics_rollups (day_utc,link_id,dimension,dimension_value,click_count) VALUES ('2026-07-16','soft-deleted','source','qr',3), ('2026-07-16','removed','source','qr',4), ('2026-07-16','soft-deleted','source','link',5)",
      ),
    ]);
    const params = new URLSearchParams(
      'from=2026-07-16&to=2026-07-16&domainId=archived-domain&dimension=source&source=qr',
    );
    const options = { allowArchived: true, now };
    const env = {
      DB: db,
      ANALYTICS_SQL: {
        query: async () => {
          throw new Error('unexpected live query');
        },
      },
    };
    const scoped = await loadAnalyticsReport(
      env,
      parseAnalyticsQuery(params, 'UTC', options),
      { development: false },
    );
    expect(scoped.totalClicks).toBe(3);
    expect(scoped.breakdown).toEqual([{ key: 'qr', clicks: 3 }]);
    params.set('dimension', 'country');
    await expect(
      loadAnalyticsReport(env, parseAnalyticsQuery(params, 'UTC', options), {
        development: false,
      }),
    ).rejects.toThrow('unsupported_archive_filters');
    params.delete('source');
    params.set('to', '2026-07-15');
    params.set('from', '2026-07-15');
    const missing = await loadAnalyticsReport(
      env,
      parseAnalyticsQuery(params, 'UTC', options),
      { development: false },
    );
    expect(missing.totalClicks).toBeNull();
    expect(missing.meta.gaps).toEqual(['2026-07-15']);
  });
});
