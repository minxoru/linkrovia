import { parseDestinationUrl } from '../security/url-policy';
import {
  selectDestination,
  type TargetingRule,
  type VisitorContext,
} from '../targeting';
import {
  deviceTypes,
  normalizeCountry,
  normalizeLanguage,
  normalizeRegion,
  operatingSystems,
} from '../targeting/visitor';
import { applyUtmConfig } from '../utm';
import { isEpochSecond, isObject, type FieldErrors } from './api-input';
import { listLinkRules } from './store';

type SimulationInput = { visitor: VisitorContext; at: number };
type SimulationLink = {
  destinationUrl: string;
  utmConfigJson?: string | null;
  isActive: number;
  domainActive: number;
  connectionStatus: string;
  startsAt: number | null;
  expiresAt: number | null;
  consumedAt: number | null;
  protectionMode: string;
};

export function parseSimulationInput(
  value: unknown,
): { input: SimulationInput } | { fieldErrors: FieldErrors } {
  if (!isObject(value))
    return { fieldErrors: { body: ['Expected a JSON object.'] } };
  const fieldErrors: FieldErrors = {};
  const fields = new Set([
    'os',
    'device',
    'country',
    'region',
    'language',
    'referrer',
    'at',
  ]);
  if (Object.keys(value).some((key) => !fields.has(key)))
    fieldErrors.body = ['The request includes an unsupported field.'];

  const os = operatingSystems.find((os) => os === value.os);
  const device = deviceTypes.find((device) => device === value.device);
  const country =
    typeof value.country === 'string' ? normalizeCountry(value.country) : null;
  const region =
    typeof value.region === 'string' ? normalizeRegion(value.region) : null;
  const language =
    typeof value.language === 'string'
      ? normalizeLanguage(value.language)
      : null;
  if (value.os !== undefined && !os)
    fieldErrors.os = ['Enter a supported operating system.'];
  if (value.device !== undefined && !device)
    fieldErrors.device = ['Enter a supported device type.'];
  if (value.country !== undefined && !country && value.country !== 'unknown')
    fieldErrors.country = ['Enter an ISO alpha-2 country code.'];
  if (
    value.region !== undefined &&
    value.region !== 'unknown' &&
    (!region || !country || !region.startsWith(`${country}-`))
  )
    fieldErrors.region = [
      'Enter a region code prefixed with its country code.',
    ];
  if (value.language !== undefined && !language && value.language !== 'unknown')
    fieldErrors.language = ['Enter a BCP 47 language tag.'];
  if (
    value.referrer !== undefined &&
    value.referrer !== null &&
    !parseDestinationUrl(value.referrer)
  )
    fieldErrors.referrer = ['Enter an HTTP or HTTPS referrer URL or null.'];
  if (value.at !== undefined && !isEpochSecond(value.at))
    fieldErrors.at = ['Expected integer epoch seconds.'];

  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return {
    input: {
      at: isEpochSecond(value.at) ? value.at : Math.floor(Date.now() / 1000),
      visitor: {
        os: os ?? 'other',
        device: device ?? 'other',
        country: country ?? 'unknown',
        region: region ?? 'unknown',
        language: language ?? 'unknown',
        trafficKind: 'unknown',
      },
    },
  };
}

function blockedReason(link: SimulationLink, at: number) {
  if (link.isActive !== 1) return 'inactive_link';
  if (link.domainActive !== 1 || link.connectionStatus !== 'active')
    return 'inactive_domain';
  if (link.startsAt !== null && at < link.startsAt) return 'not_started';
  if (link.expiresAt !== null && at >= link.expiresAt) return 'expired';
  if (link.consumedAt !== null && link.consumedAt <= at)
    return 'already_consumed';
  if (
    link.protectionMode === 'password' ||
    link.protectionMode === 'password_one_time'
  )
    return 'password_required';
  if (link.protectionMode !== 'none' && link.protectionMode !== 'one_time')
    return 'unknown_protection';
  return null;
}

export function simulateTarget(
  link: SimulationLink,
  rules: readonly TargetingRule[],
  { visitor, at }: SimulationInput,
) {
  const reason = blockedReason(link, at);
  const destination = reason ? null : selectDestination(link, rules, visitor);
  if (!destination) {
    const blocked = reason ?? 'invalid_destination';
    return {
      matchedRuleId: null,
      destinationUrl: null,
      fallbackUsed: false,
      reasonCodes: [blocked],
      blockedReason: blocked,
    };
  }
  return {
    matchedRuleId: destination.matchedRuleId,
    destinationUrl: applyUtmConfig(
      destination.url,
      link.utmConfigJson ?? null,
      destination.matchedRuleId,
    ).href,
    fallbackUsed: destination.matchedRuleId === null,
    reasonCodes: [
      destination.matchedRuleId === null
        ? 'default_destination'
        : 'rule_matched',
    ],
    blockedReason: null,
  };
}

export async function simulateLink(
  db: D1Database,
  id: string,
  input: SimulationInput,
) {
  const link = await db
    .prepare(
      `SELECT l.destination_url AS destinationUrl, l.utm_config_json AS utmConfigJson,
            l.is_active AS isActive,
            d.is_active AS domainActive, d.connection_status AS connectionStatus,
            l.starts_at AS startsAt, l.expires_at AS expiresAt,
            l.consumed_at AS consumedAt, l.protection_mode AS protectionMode
     FROM links l JOIN domains d ON d.id = l.domain_id
     WHERE l.id = ? AND l.deleted_at IS NULL`,
    )
    .bind(id)
    .first<SimulationLink>();
  return link ? simulateTarget(link, await listLinkRules(db, id), input) : null;
}
