import { dev } from '$app/env';
import {
  requireSession,
  requireForm,
  effectiveTimeZone,
} from '$lib/server/links/form';
import { listDomains } from '$lib/server/links/store';
import {
  AnalyticsInputError,
  parseAnalyticsQuery,
  loadAnalyticsReport,
} from '$lib/server/analytics/report';
import {
  loadClickRepair,
  queueClickRepair,
} from '$lib/server/analytics/click-repair';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  const [timezone, domains, repair] = await Promise.all([
    effectiveTimeZone(db, session.user.timezone),
    listDomains(db),
    session.user.role === 'owner' ? loadClickRepair(db) : null,
  ]);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const requestedFilters = Object.fromEntries(event.url.searchParams);
  let filters: Record<string, string> = { ...requestedFilters, tz: timezone };
  try {
    const parsed = parseAnalyticsQuery(event.url.searchParams, timezone, {
      allowArchived: true,
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
      domains,
      repair,
      report,
      failed: false,
      filters,
    };
  } catch (cause) {
    return {
      domains,
      repair,
      report: null,
      failed:
        cause instanceof AnalyticsInputError &&
        cause.code === 'unsupported_archive_filters'
          ? ('unsupported_archive_filters' as const)
          : true,
      filters,
    };
  }
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { session, db, form } = await requireForm(event);
    if (session.user.role !== 'owner') error(403, 'Forbidden');
    const date = form.get('date') ?? '';
    const status = await queueClickRepair(db, date);
    if (status === 'queued')
      redirect(303, event.url.pathname + event.url.search);
    return fail(status === 'invalid' ? 400 : 409, { status, date });
  },
} satisfies Actions;
