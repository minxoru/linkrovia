import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getLink } from '$lib/server/links/store';
import { requireSession, effectiveTimeZone } from '$lib/server/links/form';
import {
  AnalyticsInputError,
  parseAnalyticsQuery,
  loadAnalyticsReport,
} from '$lib/server/analytics/report';
import type { PageServerLoad } from './$types';
export const load = (async (event) => {
  const { db, session } = requireSession(event);
  if (!(await getLink(db, event.params.id))) error(404, 'Not found');
  const timezone = await effectiveTimeZone(db, session.user.timezone);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const requestedFilters = Object.fromEntries(event.url.searchParams);
  let filters: Record<string, string> = { ...requestedFilters, tz: timezone };
  try {
    const parsed = parseAnalyticsQuery(event.url.searchParams, timezone, {
      allowArchived: true,
      linkId: event.params.id,
    });
    filters = {
      ...requestedFilters,
      from: parsed.from,
      to: parsed.to,
      dimension: parsed.dimension,
      granularity: parsed.granularity,
      tz: parsed.query.timezone,
    };
    const report = await loadAnalyticsReport(event.locals.env, parsed, {
      development: dev,
    });
    return {
      report,
      failed: false,
      filters,
      linkId: event.params.id,
    };
  } catch (cause) {
    return {
      report: null,
      failed:
        cause instanceof AnalyticsInputError &&
        cause.code === 'unsupported_archive_filters'
          ? ('unsupported_archive_filters' as const)
          : true,
      filters,
      linkId: event.params.id,
    };
  }
}) satisfies PageServerLoad;
