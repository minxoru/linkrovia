export type ClickSource = 'link' | 'qr';
export type AnalyticsDimension =
  | 'country'
  | 'region'
  | 'referrer'
  | 'device'
  | 'os'
  | 'browser'
  | 'rule'
  | 'source'
  | 'traffic'
  | 'link';
export type Device = 'mobile' | 'tablet' | 'desktop' | 'other';

export interface StatsQuery {
  /** Inclusive Unix timestamp in seconds. */
  from: number;
  /** Exclusive Unix timestamp in seconds. */
  to: number;
  /** IANA time zone for display. */
  timezone: string;
  domainId?: string;
  linkId?: string;
  ruleId?: string;
  source?: ClickSource;
  /** Optional additional filter. Supply both dimension and key together. */
  dimension?: AnalyticsDimension;
  key?: string;
}

export interface TrendQuery extends StatsQuery {
  granularity?: 'day' | 'hour';
}

export interface TrendResult {
  meta: Pick<StatsQuery, 'from' | 'to' | 'timezone'> & {
    granularity: 'day' | 'hour';
    dateBasis: 'UTC' | 'local';
    source: 'analytics-engine' | 'mock' | 'fixture';
    estimated: boolean;
  };
  series: Array<{ date: string; clicks: number }>;
}

export interface CountryStat {
  country: string;
  clicks: number;
}

export interface ReferrerStat {
  host: string;
  clicks: number;
}

export interface DeviceStat {
  device: Device;
  os: string;
  browser: string;
  clicks: number;
}

export interface BreakdownResult {
  breakdown: Array<{ key: string; clicks: number }>;
  estimated: boolean;
}

export const breakdownLimit = 25;
// Read one extra group to detect truncation before combining sources.
export const combinedBreakdownLimit = 1001;

export const clickRollupDimensions = [
  'total',
  'country',
  'region',
  'referrer',
  'device',
  'os',
  'browser',
  'rule',
  'source',
  'traffic',
] as const;

export const clickRollupMaxRows = 10_000;

export interface ClickRollupRow {
  linkId: string;
  dimension: (typeof clickRollupDimensions)[number];
  value: string;
  clicks: number;
  estimated: boolean;
}

export interface ClickRollupRepository {
  getDailyClickRollup(
    query: Pick<StatsQuery, 'from' | 'to'>,
  ): Promise<ClickRollupRow[]>;
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface AnalyticsRepository {
  getBreakdown(
    query: StatsQuery,
    dimension: AnalyticsDimension,
  ): Promise<BreakdownResult>;
  getClickTrend(query: TrendQuery): Promise<TrendResult>;
  getCountries(query: StatsQuery): Promise<CountryStat[]>;
  getReferrers(query: StatsQuery): Promise<ReferrerStat[]>;
  getDevices(query: StatsQuery): Promise<DeviceStat[]>;
}
