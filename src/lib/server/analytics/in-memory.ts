import type {
  AnalyticsDimension,
  AnalyticsRepository,
  BreakdownResult,
  ClickRollupRepository,
  ClickRollupRow,
  ClickSource,
  Device,
  StatsQuery,
  TrendQuery,
  TrendResult,
} from './repository';
import {
  breakdownLimit,
  clickRollupDimensions,
  compareKeys,
} from './repository';
import { dayBuckets, utcHourLabel } from './date-buckets';

export interface ClickSample {
  timestamp: number;
  domainId: string;
  linkId: string;
  country: string;
  region: string;
  referrer: string;
  device: Device;
  os: string;
  browser: string;
  ruleId: string;
  source: ClickSource;
  traffic: 'human' | 'preview' | 'bot' | 'unknown';
  clicks: number;
}

const sampleField = {
  country: 'country',
  region: 'region',
  referrer: 'referrer',
  device: 'device',
  os: 'os',
  browser: 'browser',
  rule: 'ruleId',
  source: 'source',
  traffic: 'traffic',
  link: 'linkId',
} as const satisfies Record<AnalyticsDimension, keyof ClickSample>;

/** Shared by the local demo and the test fixture. */
export class InMemoryAnalyticsRepository
  implements AnalyticsRepository, ClickRollupRepository
{
  constructor(
    private readonly samples: readonly ClickSample[],
    private readonly source: 'mock' | 'fixture',
  ) {}

  private groupBy<T extends Record<string, string>>(
    query: StatsQuery,
    dimensions: (sample: ClickSample) => T,
    includeAllTraffic = false,
  ) {
    const groups = new Map<string, T & { clicks: number }>();
    for (const sample of this.samples) {
      if (
        sample.timestamp < query.from ||
        sample.timestamp >= query.to ||
        (query.linkId !== undefined && sample.linkId !== query.linkId) ||
        (query.domainId !== undefined && sample.domainId !== query.domainId) ||
        (query.ruleId !== undefined && sample.ruleId !== query.ruleId) ||
        (!includeAllTraffic &&
          (query.dimension !== 'traffic' || query.key === undefined) &&
          (sample.traffic === 'bot' || sample.traffic === 'preview')) ||
        (query.source !== undefined && sample.source !== query.source) ||
        (query.dimension !== undefined &&
          query.key !== undefined &&
          sample[sampleField[query.dimension]] !== query.key)
      ) {
        continue;
      }

      const group = dimensions(sample);
      const key = JSON.stringify(group);
      const clicks = (groups.get(key)?.clicks ?? 0) + sample.clicks;
      if (
        !Number.isSafeInteger(sample.clicks) ||
        sample.clicks < 0 ||
        !Number.isSafeInteger(clicks)
      ) {
        throw new Error('Invalid click count in analytics sample');
      }
      groups.set(key, { ...group, clicks });
    }
    return [...groups.values()];
  }

  async getDailyClickRollup({ from, to }: Pick<StatsQuery, 'from' | 'to'>) {
    return clickRollupDimensions.flatMap((dimension) =>
      this.groupBy(
        { from, to, timezone: 'UTC' },
        (sample) => ({
          linkId: sample.linkId,
          value: dimension === 'total' ? 'all' : sample[sampleField[dimension]],
        }),
        dimension === 'traffic',
      ).map((group): ClickRollupRow => ({
        ...group,
        dimension,
        estimated: false,
      })),
    );
  }

  async getClickTrend(query: TrendQuery): Promise<TrendResult> {
    const { from, to, timezone, granularity = 'day' } = query;
    const { dateBasis, dateFor } = dayBuckets(timezone);
    const series = this.groupBy(query, (sample) => ({
      date:
        granularity === 'hour'
          ? utcHourLabel(sample.timestamp)
          : dateFor(sample.timestamp),
    }));
    series.sort((a, b) => a.date.localeCompare(b.date));
    return {
      meta: {
        from,
        to,
        timezone,
        granularity,
        dateBasis: granularity === 'hour' ? 'UTC' : dateBasis,
        source: this.source,
        estimated: false,
      },
      series,
    };
  }

  async getBreakdown(
    query: StatsQuery,
    dimension: AnalyticsDimension,
  ): Promise<BreakdownResult> {
    const breakdown = this.groupBy(query, (sample) => ({
      key: sample[sampleField[dimension]],
    }))
      .sort((a, b) => b.clicks - a.clicks || compareKeys(a.key, b.key))
      .slice(0, breakdownLimit);
    return { breakdown, estimated: false };
  }

  async getCountries(query: StatsQuery) {
    return this.groupBy(query, ({ country }) => ({ country }));
  }

  async getReferrers(query: StatsQuery) {
    return this.groupBy(query, ({ referrer }) => ({ host: referrer }));
  }

  async getDevices(query: StatsQuery) {
    return this.groupBy(query, ({ device, os, browser }) => ({
      device,
      os,
      browser,
    }));
  }
}
