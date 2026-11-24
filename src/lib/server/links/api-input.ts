import { isValidSlug } from '../security/slug';
import { parseDestinationUrl } from '../security/url-policy';
import { parseConditions } from '../targeting';
import { parseUtmConfig } from '../utm';
import type {
  LinkFilter,
  LinkInput,
  LinkRuleInput,
  LinkSummary,
  RedirectType,
} from './store';

export type FieldErrors = Record<string, string[]>;
const maxJsonBytes = 256 * 1024;
const statuses = new Set([301, 302, 307, 308]);

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEpochSecond(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= 8_640_000_000_000
  );
}

export async function readApiJson(
  request: Request,
  maxBytes = maxJsonBytes,
): Promise<{ body: unknown } | { status: 400 | 413 | 415 }> {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== 'application/json') return { status: 415 };
  if (Number(request.headers.get('content-length')) > maxBytes)
    return { status: 413 };
  if (!request.body) return { status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let json = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return { body: JSON.parse(json + decoder.decode()) };
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { status: 413 };
      }
      json += decoder.decode(value, { stream: true });
    }
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    value.isWellFormed() &&
    !/\p{Cc}/u.test(value)
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_-]{1,100}$/i.test(value);
}

function parseTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;

  const uniqueTags = new Map<string, string>();
  for (const tag of value) {
    if (!validText(tag, 50) || !tag.trim()) return null;
    const name = tag.trim();
    const key = name.toLowerCase();
    if (!uniqueTags.has(key)) uniqueTags.set(key, name);
  }
  return [...uniqueTags.values()];
}

export function parseRule(value: unknown): LinkRuleInput | null {
  if (!isObject(value)) return null;

  const allowed = new Set([
    'type',
    'operator',
    'value',
    'conditions',
    'destinationUrl',
    'priority',
    'isActive',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const {
    type,
    operator,
    value: ruleValue,
    conditions: rawConditions,
    priority,
  } = value;
  if (
    rawConditions !== undefined &&
    (type !== undefined || operator !== undefined || ruleValue !== undefined)
  )
    return null;

  const conditions =
    rawConditions === undefined
      ? parseConditions([
          { type, operator: operator ?? 'eq', value: ruleValue },
        ])
      : Array.isArray(rawConditions)
        ? parseConditions(rawConditions)
        : null;
  const destination = parseDestinationUrl(value.destinationUrl);
  const isActive = Object.hasOwn(value, 'isActive') ? value.isActive : true;
  if (
    !conditions ||
    !destination ||
    typeof isActive !== 'boolean' ||
    typeof priority !== 'number' ||
    !Number.isSafeInteger(priority)
  )
    return null;
  return { conditions, destinationUrl: destination.href, priority, isActive };
}

const linkFields = new Set([
  'domainId',
  'destinationUrl',
  'slug',
  'title',
  'redirectType',
  'isActive',
  'startsAt',
  'expiresAt',
  'tags',
  'rules',
  'utmConfig',
]);
type ParsedLinkPayload =
  | { input: LinkInput; expected: number | undefined }
  | { fieldErrors: FieldErrors };

export function parseLinkPayload(
  value: unknown,
  current?: LinkSummary,
): ParsedLinkPayload {
  if (!isObject(value))
    return { fieldErrors: { body: ['Expected a JSON object.'] } };

  const fieldErrors: FieldErrors = {};
  if (
    Object.keys(value).some(
      (key) => !linkFields.has(key) && !(current && key === 'updatedAt'),
    )
  )
    fieldErrors.body = ['The request includes an unsupported field.'];

  const field = (name: string, fallback: unknown) =>
    Object.hasOwn(value, name) ? value[name] : fallback;
  const domainId = field('domainId', current?.domainId);
  const destination = parseDestinationUrl(
    field('destinationUrl', current?.destinationUrl),
  );
  const slug = field('slug', current?.slug ?? null);
  const title = field('title', current?.title ?? null);
  const redirectType = field('redirectType', current?.redirectType ?? 302);
  const isActive = field('isActive', current?.isActive ?? true);
  const startsAt = field('startsAt', current?.startsAt ?? null);
  const expiresAt = field('expiresAt', current?.expiresAt ?? null);
  const tags = parseTags(field('tags', current?.tags ?? []));
  const expected = value.updatedAt;

  if (!isIdentifier(domainId))
    fieldErrors.domainId = ['Enter a valid domain ID.'];
  if (!destination)
    fieldErrors.destinationUrl = ['Enter a public HTTP or HTTPS URL.'];
  if ((current || slug !== null) && !isValidSlug(slug))
    fieldErrors.slug = ['Enter an available slug format.'];
  if (title !== null && !validText(title, 200))
    fieldErrors.title = ['Enter a title of up to 200 characters.'];
  if (typeof redirectType !== 'number' || !statuses.has(redirectType))
    fieldErrors.redirectType = ['Use 301, 302, 307, or 308.'];
  if (typeof isActive !== 'boolean')
    fieldErrors.isActive = ['Expected a boolean.'];
  if (startsAt !== null && !isEpochSecond(startsAt))
    fieldErrors.startsAt = ['Expected integer epoch seconds or null.'];
  if (expiresAt !== null && !isEpochSecond(expiresAt))
    fieldErrors.expiresAt = ['Expected integer epoch seconds or null.'];
  if (
    isEpochSecond(startsAt) &&
    isEpochSecond(expiresAt) &&
    expiresAt <= startsAt
  )
    fieldErrors.expiresAt = ['Expiration must be after the start.'];
  if (!tags)
    fieldErrors.tags = [
      'Use up to 20 non-empty tags of up to 50 characters each.',
    ];
  if (current && (!isEpochSecond(expected) || expected < 0))
    fieldErrors.updatedAt = ['Provide the current updatedAt value.'];

  let utmConfigJson: string | null | undefined;
  if (Object.hasOwn(value, 'utmConfig')) {
    if (value.utmConfig === null) {
      utmConfigJson = null;
    } else {
      const config = parseUtmConfig(value.utmConfig);
      if (config) utmConfigJson = JSON.stringify(config);
      else
        fieldErrors.utmConfig = [
          'Provide UTM values for the default destination or matching rule IDs.',
        ];
    }
  }

  let rules: LinkRuleInput[] | undefined;
  if (Object.hasOwn(value, 'rules')) {
    if (!Array.isArray(value.rules) || value.rules.length > 20) {
      fieldErrors.rules = ['Use an array with at most 20 rules.'];
    } else {
      rules = [];
      for (const [index, candidate] of value.rules.entries()) {
        const parsed = parseRule(candidate);
        if (parsed) rules.push(parsed);
        else
          fieldErrors[`rules.${index}`] = [
            'Enter valid conditions, priority and destination.',
          ];
      }
    }
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return {
    expected: expected as number | undefined,
    input: {
      domainId: domainId as string,
      slug: slug as string | null,
      destinationUrl: destination!.href,
      title: (title as string | null)?.trim() || null,
      redirectType: redirectType as RedirectType,
      isActive: isActive as boolean,
      startsAt: startsAt as number | null,
      expiresAt: expiresAt as number | null,
      tags: tags!,
      rules,
      ...(utmConfigJson !== undefined && { utmConfigJson }),
    },
  };
}

export function parseLinkQuery(
  query: URLSearchParams,
): { filter: LinkFilter } | { fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const filter: LinkFilter = {};
  const fields = {
    q: 200,
    domain: 100,
    tag: 50,
    status: 8,
    cursor: 49,
    limit: 3,
  } as const;
  for (const name of Object.keys(fields) as (keyof typeof fields)[]) {
    const values = query.getAll(name);
    if (values.length === 0) continue;
    const value = values[0];
    if (values.length !== 1 || !validText(value, fields[name]) || !value) {
      fieldErrors[name] = ['Expected a single valid value.'];
      continue;
    }
    if (name === 'limit') {
      if (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 100)
        filter.limit = Number(value);
      else fieldErrors.limit = ['Use a page size from 1 to 100.'];
    } else if (
      (name === 'domain' && !isIdentifier(value)) ||
      (name === 'status' && value !== 'active' && value !== 'inactive') ||
      (name === 'cursor' && !/^\d{1,12}:[0-9a-f-]{36}$/.test(value))
    ) {
      fieldErrors[name] = ['Expected a valid filter value.'];
    } else {
      filter[name] = value;
    }
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : { filter };
}
