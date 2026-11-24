import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { requireSession, effectiveTimeZone } from '$lib/server/links/form';
import {
  analyticsCsv,
  loadAnalyticsReport,
  parseAnalyticsQuery,
} from '$lib/server/analytics/report';
import type { RequestHandler } from './$types';
export const GET = (async (event) => {
  const { db, session } = requireSession(event);
  try {
    const parsed = parseAnalyticsQuery(
      event.url.searchParams,
      await effectiveTimeZone(db, session.user.timezone),
      { allowArchived: true },
    );
    return analyticsCsv(
      await loadAnalyticsReport(event.locals.env, parsed, { development: dev }),
      parsed.bom,
      event.locals.locale,
    );
  } catch {
    error(400, 'Unable to export analytics');
  }
}) satisfies RequestHandler;
