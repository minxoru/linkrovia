import { Temporal } from '@js-temporal/polyfill';
import { csvCell } from '../../csv';
import { analyticsCsvHeaders } from '../../i18n/analytics-csv';
import type { Locale } from '../../i18n/locale';
import { isTimeZone } from '../../timezone/timezone';
import { clickRollupRetentionSeconds } from './click-rollup';
import {
  CloudflareAnalyticsRepository,
  type ClickAnalyticsEnv,
} from './cloudflare';
import { hourSeconds, utcHourLabel, utcHourStart } from './date-buckets';
import { MockAnalyticsRepository } from './mock';
import { loadArchivedClickReport } from './stored-report';
import {
  breakdownLimit,
  combinedBreakdownLimit,
  compareKeys,
  type AnalyticsDimension,
  type StatsQuery,
  type TrendResult,
} from './repository';

const analyticsDimensions = [
  'country',
  'region',
  'referrer',
  'device',
  'os',
  'browser',
  'rule',
  'source',
  'traffic',
  'link',
] as const satisfies readonly AnalyticsDimension[];
const queryFields = new Set([
  'range',
  'from',
  'to',
  'tz',
  'granularity',
  'domainId',
  'ruleId',
  'source',
  'dimension',
  'filter',
  'key',
  'bom',
]);
const dayPresets = { '7d': 7, '30d': 30, '90d': 90 } as const;
type RangePreset = keyof typeof dayPresets | '1y' | '24h' | 'all';
type ReportGranularity = 'hour' | 'day' | 'week' | 'month';

function isRangePreset(value: string): value is RangePreset {
  return (
    value === '1y' ||
    value === '24h' ||
    value === 'all' ||
    Object.hasOwn(dayPresets, value)
  );
}

export class AnalyticsInputError extends Error {
  constructor(
    readonly code:
      | 'invalid_filters'
      | 'invalid_dates'
      | 'invalid_timezone'
      | 'out_of_range'
      | 'unsupported_archive_filters',
  ) {
    super(code);
  }
}

function isDimension(value: string): value is AnalyticsDimension {
  return analyticsDimensions.some((dimension) => dimension === value);
}

function civilDay(value: string | undefined, fallback: Temporal.PlainDate) {
  if (!value) return fallback;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return Temporal.PlainDate.from(value);
  } catch {
    // An invalid calendar date is not clamped.
  }
  throw new AnalyticsInputError('invalid_dates');
}

export function parseAnalyticsQuery(
  params: URLSearchParams,
  defaultTimezone: string,
  {
    linkId,
    allowArchived = false,
    now = Math.floor(Date.now() / 1000),
  }: { linkId?: string; allowArchived?: boolean; now?: number } = {},
) {
  for (const key of params.keys()) {
    if (!queryFields.has(key) || params.getAll(key).length !== 1)
      throw new AnalyticsInputError('invalid_filters');
  }
  const get = (key: string) => params.get(key) || undefined;
  const rangeValue = params.get('range') ?? undefined;
  if (
    rangeValue !== undefined &&
    (!allowArchived ||
      !isRangePreset(rangeValue) ||
      params.has('from') ||
      params.has('to'))
  ) {
    throw new AnalyticsInputError('invalid_filters');
  }
  const range = rangeValue as RangePreset | undefined;
  const hourly = range === '24h';
  const all = range === 'all';
  const endYesterday = all || range === '1y';
  const defaultGranularity = hourly ? 'hour' : endYesterday ? 'month' : 'day';
  const granularity = get('granularity') ?? defaultGranularity;
  if (
    hourly
      ? granularity !== 'hour'
      : all
        ? granularity !== 'month'
        : granularity !== 'day' &&
          (!allowArchived ||
            (granularity !== 'week' && granularity !== 'month'))
  ) {
    throw new AnalyticsInputError('invalid_filters');
  }
  const timezone = get('tz') ?? defaultTimezone;
  if (!isTimeZone(timezone)) throw new AnalyticsInputError('invalid_timezone');
  const instant = Temporal.Instant.fromEpochMilliseconds(now * 1000);
  const today = instant.toZonedDateTimeISO(timezone).toPlainDate();
  const utcToday = instant.toZonedDateTimeISO('UTC').toPlainDate();
  const presetDays =
    range && range !== '1y' && range !== '24h' && range !== 'all'
      ? dayPresets[range]
      : undefined;
  let to = endYesterday
    ? utcToday.subtract({ days: 1 })
    : civilDay(get('to'), today);
  let from = all
    ? to
    : range === '1y'
      ? to.subtract({ years: 1 }).add({ days: 1 })
      : hourly
        ? instant
            .subtract({ hours: 24 })
            .toZonedDateTimeISO(timezone)
            .toPlainDate()
        : civilDay(get('from'), to.subtract({ days: (presetDays ?? 14) - 1 }));
  const retention = today.subtract({ months: 3 }).add({ days: 1 });
  const archived =
    !hourly &&
    (all ||
      Temporal.PlainDate.compare(from, retention) < 0 ||
      from.until(to).days >= 90);
  if (archived && allowArchived && !endYesterday && !get('to')) {
    to = utcToday;
    if (presetDays) from = to.subtract({ days: presetDays - 1 });
  }
  if (
    Temporal.PlainDate.compare(from, to) > 0 ||
    Temporal.PlainDate.compare(
      to,
      archived && allowArchived ? utcToday : today,
    ) > 0
  )
    throw new AnalyticsInputError('invalid_dates');
  if (archived && (!allowArchived || from.until(to).days >= 366))
    throw new AnalyticsInputError('out_of_range');

  const dimension = get('dimension') ?? 'country';
  const filter = get('filter');
  const key = get('key');
  const source = get('source');
  const domainId = get('domainId');
  const ruleId = get('ruleId');
  const bom = get('bom');
  const validId = (value?: string) =>
    value === undefined || /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(value);
  if (
    !isDimension(dimension) ||
    (source !== undefined && source !== 'link' && source !== 'qr') ||
    !validId(domainId) ||
    !validId(ruleId) ||
    (bom !== undefined && bom !== '0' && bom !== '1') ||
    ((key !== undefined || filter !== undefined) &&
      (!filter ||
        !isDimension(filter) ||
        !key ||
        key.length > 255 ||
        !key.isWellFormed() ||
        /\p{Cc}/u.test(key)))
  )
    throw new AnalyticsInputError('invalid_filters');

  const midnight = (date: Temporal.PlainDate) =>
    date.toZonedDateTime(archived ? 'UTC' : timezone).epochMilliseconds / 1000;
  const query: StatsQuery = {
    from: hourly ? now - 24 * hourSeconds : midnight(from),
    to: hourly ? now : midnight(to.add({ days: 1 })),
    timezone,
    domainId,
    linkId,
    ruleId,
    source,
    ...(filter && isDimension(filter) ? { dimension: filter, key } : {}),
  };
  if (query.from >= query.to) throw new AnalyticsInputError('invalid_dates');
  return {
    query,
    range,
    granularity: granularity as ReportGranularity,
    archived,
    dimension,
    bom: bom === '1',
    now,
    from: from.toString(),
    to: to.toString(),
  };
}

export type AnalyticsQuery = ReturnType<typeof parseAnalyticsQuery>;

export type AnalyticsReport = {
  meta: Pick<TrendResult['meta'], 'timezone' | 'estimated' | 'dateBasis'> & {
    source: TrendResult['meta']['source'] | 'daily-rollup' | 'archive-and-live';
    granularity: ReportGranularity;
    from: string;
    to: string;
    completeThrough: string | null;
    gaps: string[];
  };
  totalClicks: number | null;
  series: Array<{ date: string; clicks: number | null }>;
  dimension: AnalyticsDimension;
  breakdown: Array<{ key: string; clicks: number }>;
};

function groupReport(
  report: AnalyticsReport,
  granularity: ReportGranularity,
): AnalyticsReport {
  if (granularity === 'day' || granularity === 'hour') return report;
  const grouped = new Map<string, AnalyticsReport['series'][number]>();
  for (const row of report.series) {
    let key = row.date.slice(0, 7);
    if (granularity === 'week') {
      const date = Temporal.PlainDate.from(row.date);
      key = date.subtract({ days: date.dayOfWeek - 1 }).toString();
    }
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row });
    } else {
      current.clicks =
        current.clicks === null || row.clicks === null
          ? null
          : current.clicks + row.clicks;
    }
  }
  return {
    ...report,
    meta: { ...report.meta, granularity },
    series: [...grouped.values()],
  };
}

const daySeconds = 24 * hourSeconds;

function firstRetainedUtcDay(now: number) {
  const utcToday = Temporal.Instant.fromEpochMilliseconds(now * 1000)
    .toZonedDateTimeISO('UTC')
    .toPlainDate();
  const calendarBound =
    Date.parse(utcToday.subtract({ months: 3 }).add({ days: 1 }).toString()) /
    1000;
  const rollingBound =
    Math.ceil((now - clickRollupRetentionSeconds) / daySeconds) * daySeconds;
  return Math.max(calendarBound, rollingBound);
}

async function appendLiveTail(
  env: ClickAnalyticsEnv,
  archive: AnalyticsReport,
  query: StatsQuery,
  retentionStart: number,
) {
  if (!env.ANALYTICS_SQL || archive.breakdown.length >= combinedBreakdownLimit)
    return archive;
  const lastSaved = archive.series.findLast(({ clicks }) => clicks !== null);
  const nextDay = lastSaved
    ? Date.parse(lastSaved.date) / 1000 + daySeconds
    : query.from;
  const from = Math.max(nextDay, retentionStart);
  if (from >= query.to) return archive;

  const liveQuery = { ...query, from, timezone: 'UTC' };
  try {
    const repository = new CloudflareAnalyticsRepository(
      env.ANALYTICS_SQL,
      env.LINKROVIA_CLICKS_DATASET,
    );
    const [trend, live] = await Promise.all([
      repository.getClickTrend(liveQuery),
      repository.getBreakdown(
        liveQuery,
        archive.dimension,
        combinedBreakdownLimit,
      ),
    ]);
    if (live.breakdown.length >= combinedBreakdownLimit) return archive;

    const fromDay = new Date(from * 1000).toISOString().slice(0, 10);
    const toDay = new Date((query.to - 1) * 1000).toISOString().slice(0, 10);
    const coveredByLive = (date: string) => date >= fromDay && date <= toDay;
    const byDate = new Map(
      trend.series.map(({ date, clicks }) => [date, clicks]),
    );
    const series = archive.series.map((row) =>
      coveredByLive(row.date)
        ? { date: row.date, clicks: byDate.get(row.date) ?? 0 }
        : row,
    );
    const counts = new Map(
      archive.breakdown.map(({ key, clicks }) => [key, clicks]),
    );
    for (const { key, clicks } of live.breakdown)
      counts.set(key, (counts.get(key) ?? 0) + clicks);

    return {
      ...archive,
      meta: {
        ...archive.meta,
        source: 'archive-and-live' as const,
        estimated:
          archive.meta.estimated || trend.meta.estimated || live.estimated,
        gaps: archive.meta.gaps.filter((date) => !coveredByLive(date)),
      },
      totalClicks: series.reduce(
        (total, { clicks }) => total + (clicks ?? 0),
        0,
      ),
      series,
      breakdown: [...counts.entries()]
        .map(([key, clicks]) => ({ key, clicks }))
        .sort((a, b) => b.clicks - a.clicks || compareKeys(a.key, b.key)),
    };
  } catch {
    // Keep the known archive available, including gaps for the unread live tail.
    console.warn('Analytics SQL could not supplement the saved click report');
    return archive;
  }
}

export async function loadAnalyticsReport(
  env: ClickAnalyticsEnv & { DB?: D1Database },
  {
    query,
    dimension,
    from,
    to,
    archived,
    granularity,
    range,
    now,
  }: AnalyticsQuery,
  { development }: { development: boolean },
): Promise<AnalyticsReport> {
  if (archived) {
    if (!env.DB) throw new Error('D1 binding is unavailable');
    if (range === 'all') {
      from =
        (await env.DB.prepare(
          'SELECT MIN(day_utc) AS first_day FROM rollup_jobs WHERE day_utc <= ? AND completed_at IS NOT NULL',
        )
          .bind(to)
          .first<string>('first_day')) ?? to;
    }
    const retentionStart = firstRetainedUtcDay(now);
    const liveEnd = Math.min(query.to, now);
    const useLive =
      !development &&
      !!env.ANALYTICS_SQL &&
      range !== 'all' &&
      retentionStart < liveEnd;
    const saved = await loadArchivedClickReport(
      env.DB,
      { query, dimension, from, to },
      useLive ? combinedBreakdownLimit : breakdownLimit,
    );
    if (!saved) throw new AnalyticsInputError('unsupported_archive_filters');
    const report = useLive
      ? await appendLiveTail(
          env,
          saved,
          { ...query, to: liveEnd },
          retentionStart,
        )
      : saved;
    return groupReport(
      { ...report, breakdown: report.breakdown.slice(0, breakdownLimit) },
      granularity,
    );
  }
  const repository = development
    ? new MockAnalyticsRepository()
    : env.ANALYTICS_SQL
      ? new CloudflareAnalyticsRepository(
          env.ANALYTICS_SQL,
          env.LINKROVIA_CLICKS_DATASET,
        )
      : null;
  if (!repository) throw new Error('Analytics SQL binding is unavailable');
  const hourly = granularity === 'hour';
  const [trend, result] = await Promise.all([
    repository.getClickTrend({
      ...query,
      granularity: hourly ? 'hour' : 'day',
    }),
    repository.getBreakdown(query, dimension),
  ]);
  const { timezone, source, dateBasis } = trend.meta;
  const fromDay =
    dateBasis === 'UTC'
      ? new Date(query.from * 1000).toISOString().slice(0, 10)
      : from;
  const toDay =
    dateBasis === 'UTC'
      ? new Date((query.to - 1) * 1000).toISOString().slice(0, 10)
      : to;
  const series = [];
  const byDate = new Map(
    trend.series.map(({ date, clicks }) => [date, clicks]),
  );
  if (hourly) {
    for (
      let hour = utcHourStart(query.from);
      hour < query.to;
      hour += hourSeconds
    ) {
      const date = utcHourLabel(hour);
      series.push({ date, clicks: byDate.get(date) ?? 0 });
    }
  } else {
    for (
      let date = Temporal.PlainDate.from(fromDay);
      Temporal.PlainDate.compare(date, toDay) <= 0;
      date = date.add({ days: 1 })
    ) {
      const key = date.toString();
      series.push({ date: key, clicks: byDate.get(key) ?? 0 });
    }
  }
  return groupReport(
    {
      meta: {
        from: hourly ? new Date(query.from * 1000).toISOString() : from,
        to: hourly ? new Date(query.to * 1000).toISOString() : to,
        timezone,
        source,
        dateBasis,
        granularity: trend.meta.granularity,
        estimated: trend.meta.estimated || result.estimated,
        completeThrough: null,
        gaps: [],
      },
      totalClicks: series.reduce((total, row) => total + row.clicks, 0),
      series,
      dimension,
      breakdown: result.breakdown,
    },
    granularity,
  );
}

export function analyticsCsv(
  report: AnalyticsReport,
  bom: boolean,
  locale: Locale = 'en',
): Response {
  const { dateBasis, estimated, source, timezone, granularity } = report.meta;
  const metadata = [
    dateBasis,
    timezone,
    String(estimated),
    source,
    granularity,
  ];
  const rowType = {
    hour: 'hourly',
    day: 'daily',
    week: 'weekly',
    month: 'monthly',
  }[granularity];
  const rows = [
    analyticsCsvHeaders[locale],
    ...report.series.map((row) => [
      rowType,
      row.date,
      '',
      '',
      row.clicks === null ? '' : String(row.clicks),
      ...metadata,
    ]),
    ...report.breakdown.map((row) => [
      'breakdown',
      '',
      report.dimension,
      row.key,
      String(row.clicks),
      ...metadata,
    ]),
  ];
  return new Response(
    (bom ? '\ufeff' : '') +
      rows.map((row) => row.map(csvCell).join(',')).join('\r\n') +
      '\r\n',
    {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="linkrovia-analytics.csv"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
