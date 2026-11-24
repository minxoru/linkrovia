import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { AnalyticsInputError } from '$lib/server/analytics/report';
import { conversionSummary } from '$lib/server/conversions/events';
import { parseConversionReport } from '$lib/server/conversions/report';
import {
  archiveGoal,
  getLinkTracking,
  listGoals,
  parseGoal,
  saveGoal,
  setLinkTracking,
} from '$lib/server/conversions/goals';
import { getDb } from '$lib/server/db/client';
import { getEffectiveTimeZone } from '$lib/server/db/preferences';
import { requireForm, requireSession } from '$lib/server/links/form';
import { listLinks } from '$lib/server/links/store';

export async function requestedLinkConversions(
  db: D1Database,
  params: URLSearchParams,
) {
  const linkId = params.get('linkId');
  const query = new URLSearchParams(params);
  query.delete('linkId');
  const search = query.size ? `?${query}` : '';
  const path =
    linkId && (await getLinkTracking(db, linkId))
      ? linkConversionsPath(linkId)
      : '/admin/analytics/conversions';
  return `${path}${search}`;
}

export async function loadConversions(event: RequestEvent, linkId?: string) {
  const { db, session } = requireSession(event);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const timezone = await getEffectiveTimeZone(getDb(db), session.user.timezone);
  const dates = new URLSearchParams(
    [...event.url.searchParams].filter(
      ([key]) => key === 'from' || key === 'to',
    ),
  );
  let filterError = false;
  let period;
  try {
    period = parseConversionReport(dates, timezone);
  } catch (cause) {
    if (!(cause instanceof AnalyticsInputError)) throw cause;
    filterError = true;
    period = parseConversionReport(new URLSearchParams(), timezone);
  }
  const { from, to, query } = period;
  const [goals, { links }, tracking, summary] = await Promise.all([
    listGoals(db, linkId),
    linkId ? { links: [] } : listLinks(db, { limit: 60 }),
    linkId ? getLinkTracking(db, linkId) : null,
    conversionSummary(db, query.from, query.to, linkId),
  ]);
  if (linkId && !tracking) error(404, 'Link not found');
  const linkChoices = links.map(({ id, title, slug, hostname }) => ({
    id,
    title,
    slug,
    hostname,
  }));
  const targets = new Set(goals.map((goal) => goal.linkId));
  targets.delete(null);
  for (const link of linkChoices) targets.delete(link.id);
  if (!linkId && targets.size) {
    const extra = await db
      .prepare(
        `SELECT l.id, l.title, l.slug, d.hostname
      FROM links l JOIN domains d ON d.id = l.domain_id
      WHERE l.deleted_at IS NULL AND l.id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify([...targets]))
      .all<(typeof linkChoices)[number]>();
    linkChoices.push(...extra.results);
  }
  return {
    isOwner: session.user.role === 'owner',
    goals,
    links: linkChoices,
    tracking,
    summary,
    from,
    to,
    reportTimeZone: period.timezone,
    filterError,
    linkId,
    saved: event.url.searchParams.get('saved'),
  };
}

async function ownerForm(event: RequestEvent) {
  const current = await requireForm(event);
  if (current.session.user.role !== 'owner') error(403, 'Forbidden');
  return current;
}

function goalValues(form: URLSearchParams, linkId?: string) {
  return parseGoal({
    name: form.get('name'),
    eventName: form.get('eventName'),
    linkId: linkId ?? (form.get('linkId') || null),
    attributionWindowHours: Number(form.get('window')),
    isActive: form.get('active') === '1',
  });
}

function success(name: string, linkId?: string) {
  const query = new URLSearchParams({ saved: name });
  const path = linkId
    ? linkConversionsPath(linkId)
    : '/admin/analytics/conversions';
  redirect(303, `${path}?${query}`);
}

export function linkConversionsPath(linkId: string) {
  return `/admin/links/${encodeURIComponent(linkId)}/conversions`;
}

export const conversionActions = {
  create: async (event: RequestEvent, linkId?: string) => {
    const { db, form } = await ownerForm(event);
    const input = goalValues(form, linkId);
    if (!input || !(await saveGoal(db, input)))
      return fail(400, { code: 'invalid_goal' });
    success('created', linkId);
  },
  update: async (event: RequestEvent, linkId?: string) => {
    const { db, form } = await ownerForm(event);
    const input = goalValues(form, linkId);
    const id = form.get('goalId');
    if (!input || !id || !(await saveGoal(db, input, id)))
      return fail(400, { code: 'invalid_goal' });
    success('updated', linkId);
  },
  archive: async (event: RequestEvent, linkId?: string) => {
    const { db, form } = await ownerForm(event);
    const id = form.get('goalId');
    if (!id || !(await archiveGoal(db, id, linkId)))
      return fail(400, { code: 'invalid_goal' });
    success('removed', linkId);
  },
  tracking: async (event: RequestEvent, linkId?: string) => {
    const { db, form } = await ownerForm(event);
    const id = linkId ?? form.get('linkId');
    if (!id || !(await setLinkTracking(db, id, form.get('enabled') === '1')))
      return fail(400, { code: 'invalid_tracking' });
    success('changed', id);
  },
};
