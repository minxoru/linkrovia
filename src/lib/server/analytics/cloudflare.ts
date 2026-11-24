import { dayBuckets } from './date-buckets';
import {
  breakdownLimit,
  clickRollupDimensions,
  clickRollupMaxRows,
  combinedBreakdownLimit,
  compareKeys,
  type AnalyticsDimension,
  type AnalyticsRepository,
  type BreakdownResult,
  type ClickRollupRepository,
  type ClickRollupRow,
  type Device,
  type StatsQuery,
  type TrendQuery,
  type TrendResult,
} from './repository';

export type ClickAnalyticsEnv = Partial<
  Pick<Cloudflare.Env, 'ANALYTICS_SQL'>
> & {
  LINKROVIA_CLICKS_DATASET?: string;
};

const columns = {
  country: 'blob2',
  region: 'blob3',
  referrer: 'blob4',
  device: 'blob5',
  os: 'blob6',
  browser: 'blob7',
  rule: 'blob8',
  source: 'blob9',
  traffic: 'blob10',
  link: 'index1',
} as const satisfies Record<AnalyticsDimension, string>;

function dimensionColumn(dimension: AnalyticsDimension) {
  if (!Object.hasOwn(columns, dimension)) {
    throw new Error('Invalid analytics SQL dimension');
  }
  return columns[dimension];
}

function whereClause(
  query: StatsQuery,
  includeAllTraffic = false,
): {
  where: string;
  params: Record<string, AnalyticsSQLParameter>;
} {
  const params: Record<string, AnalyticsSQLParameter> = {
    from: new Date(query.from * 1000).toISOString(),
    to: new Date(query.to * 1000).toISOString(),
  };
  const predicates = ['timestamp >= $from', 'timestamp < $to'];
  const filters = [
    ['blob1', 'domainId', query.domainId],
    ['index1', 'linkId', query.linkId],
    ['blob8', 'ruleId', query.ruleId],
    ['blob9', 'source', query.source],
  ] as const;
  for (const [column, parameter, value] of filters) {
    if (value === undefined) continue;
    predicates.push(`${column} = $${parameter}`);
    params[parameter] = value;
  }
  if (
    !includeAllTraffic &&
    (query.dimension !== 'traffic' || query.key === undefined)
  ) {
    predicates.push("blob10 NOT IN ('bot', 'preview')");
  }
  if (query.dimension !== undefined && query.key !== undefined) {
    predicates.push(`${dimensionColumn(query.dimension)} = $key`);
    params.key = query.key;
  }
  return { where: predicates.join(' AND '), params };
}

function clicksFrom(value: unknown): number {
  const clicks =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof clicks !== 'number' ||
    !Number.isSafeInteger(clicks) ||
    clicks < 0
  ) {
    throw new Error('Invalid analytics SQL click count');
  }
  return clicks;
}

function stringFrom(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid analytics SQL dimension value');
  return value;
}

function deviceFrom(value: unknown): Device {
  switch (value) {
    case 'mobile':
    case 'tablet':
    case 'desktop':
    case 'other':
      return value;
    default:
      throw new Error('Invalid analytics SQL device');
  }
}

// Analytics SQL weights COUNT(*) automatically, including Workers Analytics Engine datasets.
// https://developers.cloudflare.com/analytics/sql-api/datasets/#workers-analytics-engine-datasets
export class CloudflareAnalyticsRepository
  implements AnalyticsRepository, ClickRollupRepository
{
  private readonly dataset: string;

  constructor(
    private readonly binding: AnalyticsSQLBinding,
    datasetName = 'linkrovia_clicks',
  ) {
    if (
      typeof datasetName !== 'string' ||
      !datasetName ||
      /[^A-Za-z0-9_-]/.test(datasetName)
    )
      throw new Error('Invalid analytics dataset name');
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/.test(datasetName)
      ? datasetName
      : `"${datasetName}"`;
    this.dataset = `events.analyticsEngine.${identifier}`;
  }

  async checkAvailability({ from, to }: Pick<StatsQuery, 'from' | 'to'>) {
    await this.binding.query({
      query: `SELECT index1 FROM ${this.dataset} WHERE timestamp >= $from AND timestamp < $to LIMIT 1`,
      params: {
        from: new Date(from * 1000).toISOString(),
        to: new Date(to * 1000).toISOString(),
      },
    });
  }

  async getDailyClickRollup({ from, to }: Pick<StatsQuery, 'from' | 'to'>) {
    const rows: ClickRollupRow[] = [];
    for (const dimension of clickRollupDimensions) {
      const column =
        dimension === 'total' ? undefined : dimensionColumn(dimension);
      const { where, params } = whereClause(
        { from, to, timezone: 'UTC' },
        dimension === 'traffic',
      );
      const { data } = await this.binding.query({
        query: `SELECT index1 AS link_id, ${column ?? "'all'"} AS dimension_key, COUNT(*) AS clicks
FROM ${this.dataset} WHERE ${where}
GROUP BY index1${column ? `, ${column}` : ''}
LIMIT ${clickRollupMaxRows - rows.length + 1}`,
        params,
      });
      if (rows.length + data.length > clickRollupMaxRows)
        throw new Error('Daily click rollup exceeds storage capacity');
      for (const { link_id, dimension_key, clicks } of data) {
        rows.push({
          linkId: stringFrom(link_id),
          dimension,
          value: stringFrom(dimension_key),
          clicks: clicksFrom(clicks),
          estimated: true,
        });
      }
    }
    return rows;
  }

  async getClickTrend(query: TrendQuery): Promise<TrendResult> {
    const { where, params } = whereClause(query);
    const { timezone, dateBasis } = dayBuckets(query.timezone);
    const granularity = query.granularity ?? 'day';
    const hourly = granularity === 'hour';
    const bucket = hourly
      ? "formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' HOUR, 'UTC'), '%Y-%m-%dT%H:00:00Z', 'UTC')"
      : "formatDateTime(timestamp, '%Y-%m-%d', $timezone)";
    const labelPattern = hourly
      ? /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/
      : /^\d{4}-\d{2}-\d{2}$/;
    const { data } = await this.binding.query({
      query: `SELECT ${bucket} AS date, COUNT(*) AS clicks
FROM ${this.dataset} WHERE ${where}
GROUP BY date ORDER BY date ASC`,
      params: hourly ? params : { ...params, timezone },
    });
    const series = data.map(({ date, clicks }) => {
      if (typeof date !== 'string' || !labelPattern.test(date)) {
        throw new Error('Invalid analytics SQL date');
      }
      return { date, clicks: clicksFrom(clicks) };
    });
    return {
      meta: {
        from: query.from,
        to: query.to,
        timezone: query.timezone,
        granularity,
        dateBasis: hourly ? 'UTC' : dateBasis,
        source: 'analytics-engine',
        // The binding result does not identify whether represented events were sampled.
        estimated: series.length > 0,
      },
      series,
    };
  }

  async getBreakdown(
    query: StatsQuery,
    dimension: AnalyticsDimension,
    limit:
      typeof breakdownLimit | typeof combinedBreakdownLimit = breakdownLimit,
  ): Promise<BreakdownResult> {
    const column = dimensionColumn(dimension);
    const { where, params } = whereClause(query);
    // Analytics SQL rejects dimension aliases in these ordered WAE queries.
    const { data } = await this.binding.query({
      query: `SELECT ${column}, COUNT(*) AS clicks
FROM ${this.dataset} WHERE ${where}
GROUP BY ${column} ORDER BY clicks DESC, ${column} ASC LIMIT ${limit}`,
      params,
    });
    const breakdown = data
      .map(({ [column]: key, clicks }) => ({
        key: stringFrom(key),
        clicks: clicksFrom(clicks),
      }))
      .sort((a, b) => b.clicks - a.clicks || compareKeys(a.key, b.key))
      .slice(0, limit);
    return { breakdown, estimated: breakdown.length > 0 };
  }

  async getCountries(query: StatsQuery) {
    const { breakdown } = await this.getBreakdown(query, 'country');
    return breakdown.map(({ key, clicks }) => ({ country: key, clicks }));
  }

  async getReferrers(query: StatsQuery) {
    const { breakdown } = await this.getBreakdown(query, 'referrer');
    return breakdown.map(({ key, clicks }) => ({ host: key, clicks }));
  }

  async getDevices(query: StatsQuery) {
    const { where, params } = whereClause(query);
    const { data } = await this.binding.query({
      query: `SELECT blob5, blob6, blob7, COUNT(*) AS clicks
FROM ${this.dataset} WHERE ${where}
GROUP BY blob5, blob6, blob7 ORDER BY clicks DESC, blob5 ASC, blob6 ASC, blob7 ASC LIMIT ${breakdownLimit}`,
      params,
    });
    return data
      .slice(0, breakdownLimit)
      .map(({ blob5: device, blob6: os, blob7: browser, clicks }) => ({
        device: deviceFrom(device),
        os: stringFrom(os),
        browser: stringFrom(browser),
        clicks: clicksFrom(clicks),
      }));
  }
}
