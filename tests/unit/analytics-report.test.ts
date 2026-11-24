import { expect, it } from 'vitest';
import {
  analyticsCsv,
  loadAnalyticsReport,
  parseAnalyticsQuery,
} from '../../src/lib/server/analytics/report';

const now = Date.parse('2026-11-12T12:00:00Z') / 1000;

it('treats a deferred production analytics binding as unavailable', async () => {
  const query = parseAnalyticsQuery(new URLSearchParams(), 'UTC', { now });
  await expect(
    loadAnalyticsReport({}, query, { development: false }),
  ).rejects.toThrow('Analytics SQL binding is unavailable');
});

it('uses the local civil dates and a half-open interval on a 25-hour day', () => {
  const params = new URLSearchParams({
    from: '2026-11-01',
    to: '2026-11-01',
    tz: 'America/New_York',
    dimension: 'source',
    source: 'qr',
  });
  const report = parseAnalyticsQuery(params, 'UTC', { now, linkId: 'fixture' });
  expect(report).toMatchObject({
    from: '2026-11-01',
    to: '2026-11-01',
    dimension: 'source',
    query: {
      from: Date.parse('2026-11-01T04:00:00Z') / 1000,
      to: Date.parse('2026-11-02T05:00:00Z') / 1000,
      linkId: 'fixture',
      source: 'qr',
    },
  });
});

it('bounds retention and rejects invalid dates or filter combinations', () => {
  for (const [query, reason] of [
    ['from=2026-02-30', 'invalid_dates'],
    ['from=2026-01-01', 'out_of_range'],
    ['to=2026-12-01', 'invalid_dates'],
    ['dimension=unknown', 'invalid_filters'],
    ['filter=traffic', 'invalid_filters'],
    ['source=qr&source=link', 'invalid_filters'],
    ['tz=Invalid/Zone', 'invalid_timezone'],
  ]) {
    expect(() =>
      parseAnalyticsQuery(new URLSearchParams(query), 'UTC', { now }),
    ).toThrow(reason);
  }
});

it('uses a local fixture and exposes a production provider failure', async () => {
  let calls = 0;
  const env = {
    ANALYTICS_SQL: {
      query: async () => {
        calls++;
        throw new Error('provider unavailable');
      },
    },
  };
  const query = parseAnalyticsQuery(new URLSearchParams(), 'UTC', {
    linkId: 'missing',
  });
  const stats = await loadAnalyticsReport(env, query, { development: true });
  expect(stats.meta.source).toBe('mock');
  expect(stats.series).toHaveLength(14);
  expect(stats.totalClicks).toBe(0);
  expect(calls).toBe(0);
  await expect(
    loadAnalyticsReport(env, query, { development: false }),
  ).rejects.toThrow('provider unavailable');
  expect(calls).toBe(2);
});

it('escapes spreadsheet values and marks date basis and sampling in CSV', async () => {
  const response = analyticsCsv(
    {
      meta: {
        from: '2026-11-01',
        to: '2026-11-01',
        source: 'analytics-engine',
        granularity: 'day',
        dateBasis: 'UTC',
        timezone: 'UTC',
        estimated: true,
        completeThrough: null,
        gaps: [],
      },
      totalClicks: 2,
      series: [{ date: '2026-11-01', clicks: 2 }],
      dimension: 'referrer',
      breakdown: [{ key: '＝SUM(1)', clicks: 2 }],
    },
    true,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
  expect(new TextDecoder().decode(bytes)).toContain(
    `"'＝SUM(1)","2","UTC","UTC","true","analytics-engine"`,
  );
  expect(response.headers.get('content-disposition')).toContain('attachment');
});

it('translates downloaded CSV headers without changing report rows', async () => {
  const parsed = parseAnalyticsQuery(new URLSearchParams(), 'UTC', { now });
  const report = await loadAnalyticsReport(
    {
      ANALYTICS_SQL: {
        async query() {
          throw new Error('Unexpected provider call');
        },
      },
    },
    parsed,
    { development: true },
  );
  const [apiHeader, ...apiRows] = (
    await analyticsCsv(report, false).text()
  ).split('\r\n');
  const [jaHeader, ...jaRows] = (
    await analyticsCsv(report, false, 'ja').text()
  ).split('\r\n');
  const [frHeader] = (await analyticsCsv(report, false, 'fr').text()).split(
    '\r\n',
  );
  expect(apiHeader).toContain('"date_basis"');
  expect(jaHeader).toContain('"クリック数"');
  expect(frHeader).toContain('"Clics"');
  expect(jaRows).toEqual(apiRows);
});

it('resolves calendar presets and retains explicit dates for custom ranges', () => {
  const options = { now, allowArchived: true };
  for (const [range, from] of [
    ['7d', '2026-11-06'],
    ['30d', '2026-10-14'],
    ['90d', '2026-08-15'],
  ]) {
    expect(
      parseAnalyticsQuery(new URLSearchParams({ range }), 'UTC', options),
    ).toMatchObject({
      from,
      to: '2026-11-12',
      archived: false,
      range,
    });
  }
  expect(
    parseAnalyticsQuery(
      new URLSearchParams({ range: '1y' }),
      'Asia/Tokyo',
      options,
    ),
  ).toMatchObject({
    from: '2025-11-12',
    to: '2026-11-11',
    archived: true,
    granularity: 'month',
    range: '1y',
  });
  expect(() =>
    parseAnalyticsQuery(
      new URLSearchParams('range=7d&from=2026-11-09'),
      'UTC',
      options,
    ),
  ).toThrow('invalid_filters');
  expect(() =>
    parseAnalyticsQuery(new URLSearchParams('granularity=week'), 'UTC', {
      now,
    }),
  ).toThrow('invalid_filters');
});

it('groups live local days by ISO week across a daylight saving transition', async () => {
  const env = {
    ANALYTICS_SQL: {
      query: async <T>({ query }: { query: string }) => ({
        rows: 3,
        statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
        data: (query.includes('GROUP BY date')
          ? [
              { date: '2026-11-01', clicks: 1 },
              { date: '2026-11-02', clicks: 4 },
              { date: '2026-11-08', clicks: 2 },
            ]
          : []) as T[],
      }),
    },
  } as Parameters<typeof loadAnalyticsReport>[0];
  const parsed = parseAnalyticsQuery(
    new URLSearchParams('from=2026-11-01&to=2026-11-08&granularity=week'),
    'America/New_York',
    { allowArchived: true, now },
  );
  const result = await loadAnalyticsReport(env, parsed, { development: false });
  expect(result.meta).toMatchObject({
    granularity: 'week',
    timezone: 'America/New_York',
    dateBasis: 'local',
  });
  expect(result.totalClicks).toBe(7);
  expect(result.series).toEqual([
    { date: '2026-11-01', clicks: 1 },
    { date: '2026-11-02', clicks: 6 },
  ]);
  expect(await analyticsCsv(result, false).text()).toContain(
    '"weekly","2026-11-02","","","6","local","America/New_York","true","analytics-engine","week"',
  );
});

it('bounds 24h reports to the exact rolling day and returns UTC hour buckets', async () => {
  const midHour = Date.parse('2026-11-12T12:15:45Z') / 1000;
  const calls: Array<{
    query: string;
    params?: Record<string, AnalyticsSQLParameter>;
  }> = [];
  const env = {
    ANALYTICS_SQL: {
      query: async <T>(request: (typeof calls)[number]) => {
        calls.push(request);
        return {
          rows: 2,
          statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
          data: (request.query.includes('GROUP BY date')
            ? [
                { date: '2026-11-11T12:00:00Z', clicks: 1 },
                { date: '2026-11-12T12:00:00Z', clicks: 2 },
              ]
            : []) as T[],
        };
      },
    },
  } as Parameters<typeof loadAnalyticsReport>[0];
  const query = parseAnalyticsQuery(
    new URLSearchParams('range=24h'),
    'Australia/Adelaide',
    {
      allowArchived: true,
      now: midHour,
    },
  );
  const report = await loadAnalyticsReport(env, query, { development: false });
  expect(report.meta).toMatchObject({
    from: '2026-11-11T12:15:45.000Z',
    to: '2026-11-12T12:15:45.000Z',
    dateBasis: 'UTC',
    timezone: 'Australia/Adelaide',
    granularity: 'hour',
    estimated: true,
  });
  expect(report.series).toHaveLength(25);
  expect(report.series.at(0)).toEqual({
    date: '2026-11-11T12:00:00Z',
    clicks: 1,
  });
  expect(report.series.at(1)).toEqual({
    date: '2026-11-11T13:00:00Z',
    clicks: 0,
  });
  expect(report.series.at(-1)).toEqual({
    date: '2026-11-12T12:00:00Z',
    clicks: 2,
  });
  expect(report.totalClicks).toBe(3);
  expect(calls[0].query).toContain(
    "toStartOfInterval(timestamp, INTERVAL '1' HOUR, 'UTC')",
  );
  expect(
    calls.every(
      ({ params }) =>
        params?.from === report.meta.from && params.to === report.meta.to,
    ),
  ).toBe(true);
  expect(await analyticsCsv(report, false).text()).toContain(
    '"hourly","2026-11-12T12:00:00Z"',
  );
  for (const params of [
    'granularity=hour',
    'range=24h&granularity=day',
    'range=24h&to=2026-11-12',
  ]) {
    expect(() =>
      parseAnalyticsQuery(new URLSearchParams(params), 'UTC', {
        allowArchived: true,
        now: midHour,
      }),
    ).toThrow('invalid_filters');
  }
});
