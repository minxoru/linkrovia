import { parseDestinationUrl } from '../security/url-policy';

const primaryFields = [
  'source',
  'medium',
  'campaign',
  'term',
  'content',
] as const;
export const utmKeys = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
] as const;
type UtmKey = (typeof utmKeys)[number];
export type UtmValues = Partial<Record<UtmKey, string>>;
export type UtmConfig = {
  default?: UtmValues;
  rules?: Readonly<Record<string, UtmValues>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUtmValues(value: unknown): UtmValues | null {
  if (!isRecord(value)) return null;

  const values: UtmValues = {};
  const seen = new Set<string>();
  for (const [name, raw] of Object.entries(value)) {
    const alias = primaryFields.find((field) => field === name);
    const fullName = alias ? `utm_${alias}` : name;
    const key = utmKeys.find((candidate) => candidate === fullName);
    if (
      !key ||
      seen.has(key) ||
      typeof raw !== 'string' ||
      raw.length > 256 ||
      !raw.isWellFormed() ||
      /\p{Cc}/u.test(raw)
    ) {
      return null;
    }
    seen.add(key);
    const normalized = raw.trim();
    if (normalized) values[key] = normalized;
  }
  return values;
}

export function parseUtmConfig(value: unknown): UtmConfig | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'default' && key !== 'rules')
  )
    return null;

  const config: UtmConfig = {};
  if (Object.hasOwn(value, 'default')) {
    const defaults = parseUtmValues(value.default);
    if (!defaults) return null;
    config.default = defaults;
  }
  if (Object.hasOwn(value, 'rules')) {
    if (!isRecord(value.rules)) return null;
    const entries = Object.entries(value.rules);
    if (entries.length > 20) return null;
    const rules: Record<string, UtmValues> = Object.create(null);
    for (const [id, raw] of entries) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) return null;
      const values = parseUtmValues(raw);
      if (!values) return null;
      rules[id] = values;
    }
    config.rules = rules;
  }
  return config;
}

function compose(destination: URL, values: UtmValues): URL {
  const replacements = new Map<string, string>(
    Object.entries(values).map(([key, value]) => [
      key,
      new URLSearchParams([[key, value]]).toString(),
    ]),
  );
  if (!replacements.size) return destination;

  const query: string[] = [];
  const replaced = new Set<string>();
  const original = destination.search
    ? destination.search.slice(1).split('&')
    : [];
  for (const parameter of original) {
    const rawName = parameter.split('=', 1)[0];
    const name = new URLSearchParams(`name=${rawName}`).get('name') ?? '';
    const replacement = replacements.get(name);
    if (replacement === undefined) {
      query.push(parameter);
    } else if (!replaced.has(name)) {
      query.push(replacement);
      replaced.add(name);
    }
  }
  for (const [name, replacement] of replacements) {
    if (!replaced.has(name)) query.push(replacement);
  }

  // Replacing the whole query keeps unrelated parameters byte-for-byte.
  const url = new URL(destination.href);
  url.search = query.join('&');
  return url;
}

export function previewUtm(
  destination: unknown,
  input: unknown,
): { before: string; after: string } | null {
  const url = parseDestinationUrl(destination);
  const values = parseUtmValues(input);
  if (!url || !values) return null;
  return { before: url.href, after: compose(url, values).href };
}

export function applyUtmConfig(
  destination: URL,
  json: string | null,
  ruleId: string | null,
): URL {
  if (!json || json.length > 65_536) return destination;

  try {
    const config = parseUtmConfig(JSON.parse(json));
    const values = ruleId === null ? config?.default : config?.rules?.[ruleId];
    return values ? compose(destination, values) : destination;
  } catch {
    return destination;
  }
}
