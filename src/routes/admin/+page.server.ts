import { dev } from '$app/env';
import { Temporal } from '@js-temporal/polyfill';
import { CloudflareAnalyticsRepository } from '$lib/server/analytics/cloudflare';
import { MockAnalyticsRepository } from '$lib/server/analytics/mock';
import type {
  AnalyticsDimension,
  BreakdownResult,
} from '$lib/server/analytics/repository';
import {
  requireSession,
  shortUrl,
  effectiveTimeZone,
} from '$lib/server/links/form';
import { getLink, listLinks } from '$lib/server/links/store';
import {
  loadAnalyticsReport,
  parseAnalyticsQuery,
  type AnalyticsReport,
} from '$lib/server/analytics/report';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  const [{ links }, timezone] = await Promise.all([
    listLinks(db, { limit: 5 }),
    effectiveTimeZone(db, session.user.timezone),
  ]);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  let report: AnalyticsReport | null = null;
  let popularLinks: Array<{
    key: string;
    clicks: number;
    title: string | null;
    url: string | null;
    id: string | null;
  }> = [];
  let previous: {
    total: number;
    from: string;
    to: string;
    estimated: boolean;
  } | null = null;
  let breakdowns: Array<{
    dimension: AnalyticsDimension;
    result: BreakdownResult | null;
  }> = [];
  try {
    const { ANALYTICS_SQL: binding, LINKROVIA_CLICKS_DATASET: dataset } =
      event.locals.env;
    const repository = dev
      ? new MockAnalyticsRepository()
      : binding
        ? new CloudflareAnalyticsRepository(binding, dataset)
        : null;
    if (!repository) throw new Error('Analytics SQL binding is unavailable');
    const parsed = parseAnalyticsQuery(
      new URLSearchParams({ dimension: 'link' }),
      timezone,
    );
    report = await loadAnalyticsReport(event.locals.env, parsed, {
      development: dev,
    });
    const priorEnd = Temporal.PlainDate.from(parsed.from).subtract({ days: 1 });
    const priorStart = priorEnd.subtract({ days: 13 });
    const prior = parseAnalyticsQuery(
      new URLSearchParams({
        from: priorStart.toString(),
        to: priorEnd.toString(),
      }),
      timezone,
    );
    const dimensions = ['country', 'referrer', 'os', 'rule'] as const;
    const [priorResult, ...dimensionResults] = await Promise.allSettled([
      repository.getClickTrend({ ...prior.query, granularity: 'day' }),
      ...dimensions.map((dimension) =>
        repository.getBreakdown(parsed.query, dimension),
      ),
    ]);
    if (priorResult.status === 'fulfilled' && 'series' in priorResult.value) {
      previous = {
        total: priorResult.value.series.reduce(
          (sum, row) => sum + row.clicks,
          0,
        ),
        from: prior.from,
        to: prior.to,
        estimated: priorResult.value.meta.estimated,
      };
    }
    breakdowns = dimensions.map((dimension, index) => {
      const result = dimensionResults[index];
      return {
        dimension,
        result:
          result.status === 'fulfilled' && 'breakdown' in result.value
            ? result.value
            : null,
      };
    });
    popularLinks = await Promise.all(
      report.breakdown.slice(0, 5).map(async (row) => {
        // Sample identifiers must never be presented as real links.
        const link =
          report?.meta.source === 'analytics-engine'
            ? await getLink(db, row.key)
            : null;
        return {
          ...row,
          id: link?.id ?? null,
          title: link?.title ?? null,
          url: link ? shortUrl(link, event.url) : null,
        };
      }),
    );
  } catch {
    report = null;
    popularLinks = [];
  }
  return {
    report,
    popularLinks,
    previous,
    breakdowns,
    recentLinks: links.map((link) => ({
      id: link.id,
      title: link.title,
      shortUrl: shortUrl(link, event.url),
      isActive: link.isActive,
    })),
  };
}) satisfies PageServerLoad;
