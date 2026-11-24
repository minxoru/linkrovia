import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { checkCsrfToken } from '$lib/server/auth/session';
import { getDb } from '$lib/server/db/client';
import { getEffectiveTimeZone } from '$lib/server/db/preferences';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { isValidSlug } from '$lib/server/security/slug';
import { parseDestinationUrl } from '$lib/server/security/url-policy';
import { interpretLocalDateTime } from '$lib/timezone/timezone';
import {
  isAvailableLinkDomain,
  type LinkInput,
  type LinkSummary,
  type RedirectType,
} from './store';

export function requireSession(event: RequestEvent) {
  const session = event.locals.session;
  if (!session) redirect(303, '/login');
  if (!event.locals.env.DB) error(503, 'Database unavailable');
  return { session, db: event.locals.env.DB };
}
export async function requireForm(event: RequestEvent, maxBytes?: number) {
  const auth = requireSession(event);
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request, maxBytes);
  if (!form) error(400, 'Invalid form');
  if (!checkCsrfToken(form.get('csrfToken'), auth.session.csrfToken))
    error(403, 'Forbidden');
  return { ...auth, form };
}
export function shortUrl(link: LinkSummary, url: URL) {
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  const origin =
    loopback.includes(url.hostname) && url.hostname === link.hostname
      ? url.origin
      : `https://${link.hostname}`;
  return `${origin}/${encodeURIComponent(link.slug)}`;
}
export type FormValues = {
  domainId: string;
  slug: string;
  destinationUrl: string;
  title: string;
  status: string;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  tags: string;
  startFold: string;
  expiryFold: string;
  updatedAt: string;
};
export function formValues(form: URLSearchParams): FormValues {
  const get = (key: string, max: number) => (form.get(key) ?? '').slice(0, max);
  return {
    domainId: get('domainId', 100),
    slug: get('slug', 100),
    destinationUrl: get('destinationUrl', 4096),
    title: get('title', 300),
    status: get('status', 3),
    active: form.has('active'),
    startsAt: get('startsAt', 30),
    expiresAt: get('expiresAt', 30),
    tags: get('tags', 2048),
    startFold: get('startFold', 10),
    expiryFold: get('expiryFold', 10),
    updatedAt: get('updatedAt', 12),
  };
}
export async function parseLinkForm(
  form: URLSearchParams,
  db: D1Database,
  timeZone: string,
  editing: boolean,
): Promise<
  | { input: LinkInput; values: FormValues }
  | { code: string; values: FormValues }
> {
  const values = formValues(form);
  const limits: Record<string, number> = {
    domainId: 100,
    slug: 100,
    destinationUrl: 4096,
    title: 300,
    status: 3,
    startsAt: 30,
    expiresAt: 30,
    tags: 2048,
    startFold: 10,
    expiryFold: 10,
    updatedAt: 12,
  };
  if (
    Object.entries(limits).some(
      ([key, limit]) => (form.get(key)?.length ?? 0) > limit,
    )
  )
    return { code: 'invalid_input', values };
  const slug = values.slug.trim();
  const title = values.title.trim();
  const destination = parseDestinationUrl(values.destinationUrl.trim());
  const type = Number(values.status);
  const tags = [
    ...new Map(
      values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => [t.toLowerCase(), t]),
    ).values(),
  ];
  const domain = await isAvailableLinkDomain(db, values.domainId);
  if (
    !domain ||
    !destination ||
    (slug ? !isValidSlug(slug) : editing) ||
    title.length > 200 ||
    ![301, 302, 307, 308].includes(type) ||
    tags.length > 20 ||
    tags.some((t) => t.length > 50 || /[\x00-\x1f\x7f]/.test(t))
  )
    return { code: 'invalid_input', values };
  function parseTime(value: string, fold: string) {
    if (!value) return { value: null } as const;
    const parsed = interpretLocalDateTime(value, timeZone);
    if (parsed.kind === 'gap') return { code: 'time_gap' } as const;
    if (parsed.kind === 'invalid') return { code: 'invalid_input' } as const;
    if (parsed.kind === 'overlap') {
      if (fold === 'earlier' || fold === 'later')
        return { value: parsed[fold] } as const;
      return { code: 'time_overlap' } as const;
    }
    return { value: parsed.epochSeconds } as const;
  }
  const start = parseTime(values.startsAt, values.startFold),
    expiry = parseTime(values.expiresAt, values.expiryFold);
  if (start.code) return { code: start.code, values };
  if (expiry.code) return { code: expiry.code, values };
  if (
    start.value !== null &&
    expiry.value !== null &&
    start.value >= expiry.value
  )
    return { code: 'invalid_input', values };
  return {
    values,
    input: {
      domainId: values.domainId,
      slug: slug || null,
      destinationUrl: destination.href,
      title: title || null,
      redirectType: type as RedirectType,
      isActive: values.active,
      startsAt: start.value,
      expiresAt: expiry.value,
      tags,
    },
  };
}
export async function effectiveTimeZone(
  db: D1Database,
  timezone: string | null,
) {
  return getEffectiveTimeZone(getDb(db), timezone);
}
