import { Temporal } from '@js-temporal/polyfill';
import { interpretLocalDateTime } from '../../timezone/timezone';
import { generateSlug } from '../security/slug';
import { normalizeHostname } from '../security/url-policy';
import { parseLinkPayload } from './api-input';
import { CsvInputError, csvPreviewBatchSize, type CsvFile } from '../../csv';
import { createLink, type LinkInput } from './store';

export const csvBatchSize = 4;
export type DuplicatePolicy = 'skip' | 'error';
export type CsvOptions = { timeZone: string; duplicate: DuplicatePolicy };
export type CsvRow = {
  row: number;
  status: 'ready' | 'created' | 'skipped' | 'error';
  code?: string;
  fields?: string[];
  slug?: string;
  domain?: string;
  id?: string;
  record?: string[];
};

type Domain = { id: string; hostname: string; primaryDomain: number };
type PreparedRow = { row: CsvRow; input?: LinkInput };

const csvFields: Record<string, string> = {
  destinationUrl: 'destination_url',
  domainId: 'domain',
  redirectType: 'redirect_type',
  startsAt: 'starts_at',
  expiresAt: 'expires_at',
  isActive: 'is_active',
};

async function importDomains(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT id, hostname, is_primary AS primaryDomain FROM domains WHERE is_active = 1 AND connection_status = 'active'",
    )
    .all<Domain>();
  return {
    byHostname: new Map(results.map((domain) => [domain.hostname, domain])),
    primary: results.find((domain) => domain.primaryDomain === 1),
  };
}

function parseDate(value: string, timeZone: string) {
  if (!value) return { value: null };
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    try {
      return { value: Temporal.Instant.from(value).epochMilliseconds / 1000 };
    } catch {
      return { code: 'invalid_fields' };
    }
  }
  const parsed = interpretLocalDateTime(value, timeZone);
  if (parsed.kind === 'exact') return { value: parsed.epochSeconds };
  if (parsed.kind === 'invalid') return { code: 'invalid_fields' };
  return { code: parsed.kind === 'gap' ? 'time_gap' : 'time_overlap' };
}

function prepareRow(
  headers: string[],
  values: string[],
  row: number,
  domains: Awaited<ReturnType<typeof importDomains>>,
  options: CsvOptions,
  preview: boolean,
): PreparedRow {
  const error = (code: string, fields?: string[]) => ({
    row: {
      row,
      status: 'error' as const,
      code,
      ...(fields && { fields }),
    },
  });
  if (headers.length !== values.length) return error('column_count');

  const fields = new Map(headers.map((name, index) => [name, values[index]]));
  const get = (name: string) => fields.get(name)?.trim() ?? '';
  const domainValue = get('domain');
  const domain = domainValue
    ? domains.byHostname.get(
        normalizeHostname(domainValue, { allowLoopback: true }) ?? '',
      )
    : domains.primary;
  if (!domain) return error('missing_domain', ['domain']);

  const startsAt = parseDate(get('starts_at'), options.timeZone);
  const expiresAt = parseDate(get('expires_at'), options.timeZone);
  if (startsAt.code) return error(startsAt.code, ['starts_at']);
  if (expiresAt.code) return error(expiresAt.code, ['expires_at']);

  const active = get('is_active');
  const type = get('redirect_type');
  const tags = get('tags');
  if (tags.length > 2048) return error('invalid_fields', ['tags']);
  let rules: unknown[] = [];
  let normalizedRuleJson = '';
  const ruleJson = get('rules');
  if (ruleJson.length > 192 * 1024) return error('invalid_fields', ['rules']);
  if (ruleJson) {
    try {
      const decoded: unknown = JSON.parse(ruleJson);
      if (!Array.isArray(decoded) || decoded.length > 20)
        return error('invalid_fields', ['rules']);
      rules = decoded;
      if (preview) normalizedRuleJson = JSON.stringify(decoded);
    } catch {
      return error('invalid_fields', ['rules']);
    }
  }
  for (const [type, priority] of [
    ['ios', 10],
    ['android', 20],
  ] as const) {
    const url = get(`${type}_url`);
    if (url)
      rules.push({ type: 'os', value: type, priority, destinationUrl: url });
  }

  const requestedSlug = get('slug');
  const checked = parseLinkPayload({
    domainId: domain.id,
    destinationUrl: get('destination_url'),
    slug: requestedSlug || null,
    title: get('title') || null,
    redirectType: type ? (/^\d{3}$/.test(type) ? Number(type) : NaN) : 302,
    isActive:
      active === '' || active === 'true'
        ? true
        : active === 'false'
          ? false
          : active,
    startsAt: startsAt.value,
    expiresAt: expiresAt.value,
    tags: tags ? tags.split(',').map((tag) => tag.trim()) : [],
    ...(rules.length && { rules }),
  });
  if ('fieldErrors' in checked) {
    const specialRules = [
      ...(get('ios_url') ? ['ios_url'] : []),
      ...(get('android_url') ? ['android_url'] : []),
    ];
    const invalid = new Set(
      Object.keys(checked.fieldErrors).map((field) => {
        if (field === 'rules' || field.startsWith('rules.')) {
          const index =
            Number(field.slice(6)) - (rules.length - specialRules.length);
          return specialRules[index] ?? 'rules';
        }
        return csvFields[field] ?? field;
      }),
    );
    return error('invalid_fields', [...invalid]);
  }

  if (!requestedSlug && !preview) return error('slug_required', ['slug']);
  const slug = requestedSlug || generateSlug();
  fields.set('slug', slug);
  fields.set('domain', domain.hostname);
  return {
    row: {
      row,
      status: 'ready',
      slug,
      domain: domain.hostname,
      ...(preview && {
        record: commitHeaders(headers).map((name) =>
          name === 'rules' ? normalizedRuleJson : get(name),
        ),
      }),
    },
    input: { ...checked.input, slug },
  };
}

function commitHeaders(headers: string[]) {
  return [...new Set([...headers, 'slug', 'domain'])];
}

function duplicateRow(row: CsvRow, duplicate: DuplicatePolicy): CsvRow {
  const { record: _record, ...details } = row;
  return {
    ...details,
    status: duplicate === 'skip' ? 'skipped' : 'error',
    code: 'duplicate',
    fields: ['slug'],
  };
}

function candidateKey(domain: string, slug: string) {
  return `${domain}/${slug}`;
}

export async function previewCsv(
  db: D1Database,
  file: CsvFile,
  options: CsvOptions,
  offset = 0,
) {
  const end = endOfBatch(file, offset, csvPreviewBatchSize);
  const domains = await importDomains(db);
  const prepared = file.rows
    .slice(offset, end)
    .map((values, index) =>
      prepareRow(
        file.headers,
        values,
        offset + index + 2,
        domains,
        options,
        true,
      ),
    );
  const candidates = prepared.flatMap(({ input }) =>
    input ? [[input.domainId, input.slug]] : [],
  );
  const seen = new Set<string>();
  if (candidates.length) {
    const existing = await db
      .prepare(
        `SELECT l.domain_id AS domainId, l.slug FROM json_each(?) AS candidate
         CROSS JOIN links l ON l.domain_id = json_extract(candidate.value, '$[0]')
           AND l.slug = json_extract(candidate.value, '$[1]')`,
      )
      .bind(JSON.stringify(candidates))
      .all<{ domainId: string; slug: string }>();
    for (const item of existing.results)
      seen.add(candidateKey(item.domainId, item.slug));
  }
  return {
    headers: commitHeaders(file.headers),
    timeZone: options.timeZone,
    commitBatchSize: csvBatchSize,
    previewBatchSize: csvPreviewBatchSize,
    nextOffset: end < file.rows.length ? end : null,
    rows: prepared.map(({ row, input }) => {
      if (!input) return row;
      const key = candidateKey(input.domainId, input.slug!);
      if (seen.has(key)) return duplicateRow(row, options.duplicate);
      seen.add(key);
      return row;
    }),
  };
}

function endOfBatch(file: CsvFile, offset: number, size: number) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= file.rows.length
  ) {
    throw new CsvInputError('invalid_options');
  }
  return offset + size;
}

export async function commitCsv(
  db: D1Database,
  actorId: string | null,
  file: CsvFile,
  options: CsvOptions,
  offset: number,
) {
  const end = endOfBatch(file, offset, csvBatchSize);
  const domains = await importDomains(db);
  const rows: CsvRow[] = [];
  for (const [index, values] of file.rows.slice(offset, end).entries()) {
    const { row, input } = prepareRow(
      file.headers,
      values,
      offset + index + 2,
      domains,
      options,
      false,
    );
    if (!input) {
      rows.push(row);
      continue;
    }
    try {
      const result = await createLink(db, actorId, input);
      if (result.ok) rows.push({ ...row, status: 'created', id: result.id });
      else if (result.code === 'slug_conflict')
        rows.push(duplicateRow(row, options.duplicate));
      else rows.push({ ...row, status: 'error', code: result.code });
    } catch {
      rows.push({ ...row, status: 'error', code: 'write_failed' });
    }
  }
  return {
    rows,
    nextOffset: end < file.rows.length ? end : null,
    timeZone: options.timeZone,
  };
}
