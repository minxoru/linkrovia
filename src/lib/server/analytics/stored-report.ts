import {
  breakdownLimit,
  combinedBreakdownLimit,
  type AnalyticsDimension,
  type StatsQuery,
} from './repository';
import type { AnalyticsReport, AnalyticsQuery } from './report';

function archiveScope(query: StatsQuery, dimension: AnalyticsDimension) {
  const filters = [
    { dimension: 'source', key: query.source },
    { dimension: 'rule', key: query.ruleId },
    { dimension: query.dimension, key: query.key },
  ].filter(
    (filter) => filter.dimension !== undefined && filter.key !== undefined,
  );

  const rollupFilters = filters.filter(({ dimension }) => dimension !== 'link');
  const seriesDimension = rollupFilters[0]?.dimension ?? 'total';
  const breakdownDimension = dimension === 'link' ? seriesDimension : dimension;
  if (rollupFilters.some((filter) => filter.dimension !== breakdownDimension))
    return null;

  const conditions: string[] = [];
  const bindings: string[] = [];
  for (const id of [
    query.linkId,
    ...filters
      .filter((filter) => filter.dimension === 'link')
      .map(({ key }) => key),
  ]) {
    if (id === undefined) continue;
    conditions.push('a.link_id = ?');
    bindings.push(id);
  }
  if (query.domainId !== undefined) {
    conditions.push('a.link_id IN (SELECT id FROM links WHERE domain_id = ?)');
    bindings.push(query.domainId);
  }
  for (const { key } of rollupFilters) {
    if (key === undefined) continue;
    conditions.push('a.dimension_value = ?');
    bindings.push(key);
  }
  return {
    seriesDimension,
    breakdownDimension,
    scope: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    bindings,
    excludeNonhuman: dimension === 'traffic' && seriesDimension !== 'traffic',
  };
}

export async function loadArchivedClickReport(
  db: D1Database,
  {
    from,
    to,
    query,
    dimension,
  }: Pick<AnalyticsQuery, 'from' | 'to' | 'query' | 'dimension'>,
  groupLimit:
    typeof breakdownLimit | typeof combinedBreakdownLimit = breakdownLimit,
): Promise<AnalyticsReport | null> {
  const scope = archiveScope(query, dimension);
  if (!scope) return null;

  const bounds =
    'j.day_utc >= ? AND j.day_utc <= ? AND j.completed_at IS NOT NULL';
  const breakdownKey = dimension === 'link' ? 'a.link_id' : 'a.dimension_value';
  const [dates, groups] = await db.batch([
    db
      .prepare(
        `SELECT j.day_utc AS date, COALESCE(SUM(a.click_count), 0) AS clicks,
        COALESCE(MAX(a.estimated), 0) AS estimated
      FROM rollup_jobs j
      LEFT JOIN analytics_rollups a ON a.day_utc = j.day_utc
        AND a.dimension = ?${scope.scope}
      WHERE ${bounds}
      GROUP BY j.day_utc ORDER BY j.day_utc`,
      )
      .bind(scope.seriesDimension, ...scope.bindings, from, to),
    db
      .prepare(
        `SELECT ${breakdownKey} AS key, SUM(a.click_count) AS clicks,
        MAX(a.estimated) AS estimated
      FROM analytics_rollups a
      INNER JOIN rollup_jobs j ON j.day_utc = a.day_utc
      WHERE ${bounds} AND a.dimension = ?${scope.scope}
      ${scope.excludeNonhuman ? "AND a.dimension_value NOT IN ('bot', 'preview')" : ''}
      GROUP BY ${breakdownKey} ORDER BY clicks DESC, key ASC LIMIT ?`,
      )
      .bind(from, to, scope.breakdownDimension, ...scope.bindings, groupLimit),
  ]);

  const days = new Map(
    (
      dates.results as Array<{
        date: string;
        clicks: number;
        estimated: number;
      }>
    ).map((row) => [row.date, row]),
  );
  const series: AnalyticsReport['series'] = [];
  const gaps: string[] = [];
  let completeThrough: string | null = null;
  let totalClicks = 0;
  const end = Date.parse(to);
  for (let day = Date.parse(from); day <= end; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const clicks = days.get(date)?.clicks ?? null;
    if (clicks === null) {
      gaps.push(date);
    } else {
      totalClicks += clicks;
      if (gaps.length === 0) completeThrough = date;
    }
    series.push({ date, clicks });
  }

  const breakdown = groups.results as Array<{
    key: string;
    clicks: number;
    estimated: number;
  }>;
  return {
    meta: {
      from,
      to,
      timezone: 'UTC',
      dateBasis: 'UTC',
      source: 'daily-rollup',
      granularity: 'day',
      estimated:
        [...days.values()].some(({ estimated }) => estimated === 1) ||
        breakdown.some(({ estimated }) => estimated === 1),
      completeThrough,
      gaps,
    },
    totalClicks: days.size === 0 ? null : totalClicks,
    series,
    dimension,
    breakdown: breakdown.map(({ key, clicks }) => ({ key, clicks })),
  };
}
