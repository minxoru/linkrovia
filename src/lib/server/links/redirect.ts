import { clickDataPoint } from '../analytics/click-event';
import { verifyPassword } from '../auth/credential';
import { hex, randomHex, sha256 } from '../auth/crypto';
import { issueClickReference } from '../conversions/attribution';
import { isValidSlug } from '../security/slug';
import {
  getVisitorContext,
  selectDestination,
  type TargetingRule,
  type VisitorCloudflareMetadata,
} from '../targeting';
import { applyUtmConfig } from '../utm';
import {
  gateTokenPattern,
  isOneTime,
  needsPassword,
  linkUnlockSeconds,
  type ProtectionMode,
} from './protection';
import type { RedirectType } from './store';

type RedirectLink = {
  id: string;
  domainId: string;
  slug: string;
  destinationUrl: string;
  redirectType: RedirectType;
  startsAt: number | null;
  expiresAt: number | null;
  updatedAt: number;
  protectionMode: ProtectionMode;
  passwordHash: string | null;
  gateToken: string | null;
  consumedAt: number | null;
  conversionTracking: number;
  qrCodeId: string | null;
  rulesJson: string;
  utmConfigJson: string | null;
};

export type ShortLinkResponse =
  | { status: 404 | 410 }
  | { status: 302; location: string }
  | {
      status: RedirectType;
      location: string;
      linkId: string;
      qrCodeId: string | null;
      matchedRuleId: string | null;
    };

type LinkLookup = 'slug' | 'qr' | 'gate' | 'qrGate';
type Gate = { hostname: string; link: RedirectLink; nextPath: string };

async function findPublicLink(
  db: D1Database,
  hostname: string,
  lookup: LinkLookup,
  value: string,
) {
  const fromQr = lookup === 'qr' || lookup === 'qrGate';
  const isGate = lookup === 'gate' || lookup === 'qrGate';
  const filter = fromQr ? 'q.token' : isGate ? 'l.gate_token' : 'l.slug';
  return db
    .prepare(
      `SELECT l.id, l.domain_id AS domainId, l.slug, l.destination_url AS destinationUrl,
            l.redirect_type AS redirectType,
            l.starts_at AS startsAt, l.expires_at AS expiresAt, l.updated_at AS updatedAt,
            l.protection_mode AS protectionMode, l.gate_token AS gateToken,
            l.consumed_at AS consumedAt, l.conversion_tracking AS conversionTracking,
            l.utm_config_json AS utmConfigJson,
            ${fromQr ? 'q.id' : 'NULL'} AS qrCodeId,
            ${isGate ? 'l.protection_password_hash' : 'NULL'} AS passwordHash,
            (SELECT json_group_array(json_object(
              'id', r.id, 'priority', r.priority, 'isActive', r.is_active,
              'conditionsJson', r.conditions_json, 'ruleType', r.rule_type,
              'operator', r.operator, 'ruleValue', r.rule_value, 'destinationUrl', r.destination_url
            )) FROM redirect_rules r WHERE r.link_id = l.id AND r.is_active = 1) AS rulesJson
     FROM domains d JOIN links l ON l.domain_id = d.id
     ${fromQr ? 'JOIN qr_codes q ON q.link_id = l.id' : ''}
     WHERE d.hostname = ? AND d.is_active = 1 AND d.connection_status = 'active'
       AND ${filter} = ? AND l.is_active = 1 AND l.deleted_at IS NULL`,
    )
    .bind(hostname, value)
    .first<RedirectLink>();
}

function unavailable(link: RedirectLink): 404 | 410 | null {
  const now = Math.floor(Date.now() / 1000);
  if (link.startsAt !== null && now < link.startsAt) return 404;
  if (
    link.consumedAt !== null ||
    (link.expiresAt !== null && now >= link.expiresAt)
  )
    return 410;
  return null;
}

const currentLink = `
  l.id = ? AND l.updated_at = ? AND l.is_active = 1 AND l.deleted_at IS NULL
  AND l.protection_mode <> 'none' AND l.redirect_type IN (302, 307)
  AND (l.starts_at IS NULL OR l.starts_at <= unixepoch())
  AND (l.expires_at IS NULL OR l.expires_at > unixepoch())
  AND EXISTS(SELECT 1 FROM domains d WHERE d.id = l.domain_id AND d.hostname = ?
    AND d.is_active = 1 AND d.connection_status = 'active')`;

export async function loadLinkGate(
  db: D1Database,
  hostname: string,
  token: string,
): Promise<Gate | { status: 404 | 410 }> {
  const fromQr = token.startsWith('q-');
  const value = fromQr ? token.slice(2) : token;
  if (!gateTokenPattern.test(value)) return { status: 404 };
  const link = await findPublicLink(
    db,
    hostname,
    fromQr ? 'qrGate' : 'gate',
    value,
  );
  if (
    !link ||
    link.protectionMode === 'none' ||
    !isValidSlug(link.slug) ||
    (link.redirectType !== 302 && link.redirectType !== 307)
  )
    return { status: 404 };
  const status = unavailable(link);
  if (status) return { status };
  return { hostname, link, nextPath: fromQr ? `/q/${value}` : `/${link.slug}` };
}

export async function unlockLinkGate(
  db: D1Database,
  gate: Gate,
  password: string,
) {
  if (
    needsPassword(gate.link.protectionMode) &&
    !(await verifyPassword(password, gate.link.passwordHash))
  )
    return null;

  const token = randomHex(32);
  const tokenHash = hex(await sha256(token));
  const [issued] = await db.batch([
    db
      .prepare(
        `INSERT INTO link_unlocks (token_hash, link_id, link_version, expires_at)
       SELECT ?, l.id, l.updated_at, unixepoch() + ? FROM links l
       WHERE ${currentLink} AND l.consumed_at IS NULL`,
      )
      .bind(
        tokenHash,
        linkUnlockSeconds,
        gate.link.id,
        gate.link.updatedAt,
        gate.hostname,
      ),
    db.prepare(
      `DELETE FROM link_unlocks WHERE token_hash IN
       (SELECT token_hash FROM link_unlocks WHERE expires_at <= unixepoch() LIMIT 20)`,
    ),
  ]);
  return issued.meta.changes === 1 ? { token } : null;
}

async function hasUnlock(
  db: D1Database,
  link: RedirectLink,
  hostname: string,
  tokenHash: string,
) {
  return (
    (await db
      .prepare(
        `SELECT 1 FROM link_unlocks u JOIN links l ON l.id = u.link_id
     WHERE u.token_hash = ? AND u.link_version = l.updated_at AND u.expires_at > unixepoch()
       AND ${currentLink}`,
      )
      .bind(tokenHash, link.id, link.updatedAt, hostname)
      .first()) !== null
  );
}

export async function unlockedGatePath(
  db: D1Database,
  gate: Gate,
  token: string | undefined,
) {
  if (!token || !gateTokenPattern.test(token)) return null;
  const valid = await hasUnlock(
    db,
    gate.link,
    gate.hostname,
    hex(await sha256(token)),
  );
  return valid ? gate.nextPath : null;
}

async function resolveLink(
  db: D1Database,
  hostname: string,
  lookup: 'slug' | 'qr',
  value: string,
  request: Request,
  cf: VisitorCloudflareMetadata | undefined,
  unlockToken: string | undefined,
  clicks: AnalyticsEngineDataset | undefined,
): Promise<ShortLinkResponse> {
  const link = await findPublicLink(db, hostname, lookup, value);
  if (!link) return { status: 404 };
  const status = unavailable(link);
  if (status) return { status };

  const visitor = getVisitorContext(request, cf);
  const isSpeculative = ['sec-purpose', 'purpose'].some((header) =>
    /\b(?:prefetch|prerender|preview)\b/i.test(
      request.headers.get(header) ?? '',
    ),
  );
  const isClick = request.method === 'GET' && !isSpeculative;
  let unlockHash: string | undefined;
  if (link.protectionMode !== 'none') {
    if (
      !link.gateToken ||
      (link.redirectType !== 302 && link.redirectType !== 307)
    )
      return { status: 404 };
    const gate = {
      status: 302 as const,
      location: `/gate/${lookup === 'qr' ? `q-${value}` : link.gateToken}`,
    };
    if (
      !isClick ||
      visitor.trafficKind === 'preview' ||
      !unlockToken ||
      !gateTokenPattern.test(unlockToken)
    )
      return gate;
    unlockHash = hex(await sha256(unlockToken));
    if (!(await hasUnlock(db, link, hostname, unlockHash))) return gate;
  }

  const rules: TargetingRule[] = JSON.parse(link.rulesJson);
  const destination = selectDestination(link, rules, visitor);
  if (!destination) return { status: 404 };
  const location = applyUtmConfig(
    destination.url,
    link.utmConfigJson,
    destination.matchedRuleId,
  );

  if (unlockHash && isOneTime(link.protectionMode)) {
    const used = await db
      .prepare(
        `UPDATE links AS l SET consumed_at = unixepoch()
       WHERE ${currentLink} AND l.consumed_at IS NULL
         AND l.protection_mode IN ('one_time','password_one_time')
         AND EXISTS (SELECT 1 FROM link_unlocks u WHERE u.token_hash = ?
           AND u.link_id = l.id AND u.link_version = l.updated_at AND u.expires_at > unixepoch())
       RETURNING id`,
      )
      .bind(link.id, link.updatedAt, hostname, unlockHash)
      .first();
    if (!used) return { status: 410 };
  }

  if (
    isClick &&
    link.conversionTracking === 1 &&
    (link.redirectType === 302 || link.redirectType === 307) &&
    visitor.trafficKind !== 'bot' &&
    visitor.trafficKind !== 'preview'
  ) {
    try {
      const reference = await issueClickReference(db, link.id, link.updatedAt);
      if (reference) location.searchParams.set('cl_ref', reference);
    } catch {
      console.error('Click attribution write failed');
    }
  }

  if (clicks && isClick) {
    try {
      const point = clickDataPoint({
        linkId: link.id,
        domainId: link.domainId,
        matchedRuleId: destination.matchedRuleId,
        source: lookup === 'qr' ? 'qr' : 'link',
        referrer: request.headers.get('referer'),
        visitor,
      });
      if (point) clicks.writeDataPoint(point);
    } catch {
      console.error('Click analytics write failed');
    }
  }

  return {
    status: link.redirectType,
    location: location.href,
    linkId: link.id,
    qrCodeId: link.qrCodeId,
    matchedRuleId: destination.matchedRuleId,
  };
}

export async function resolveShortLink(
  db: D1Database,
  hostname: string,
  slug: string,
  request: Request,
  cf?: VisitorCloudflareMetadata,
  unlockToken?: string,
  clicks?: AnalyticsEngineDataset,
): Promise<ShortLinkResponse> {
  return isValidSlug(slug)
    ? resolveLink(db, hostname, 'slug', slug, request, cf, unlockToken, clicks)
    : { status: 404 };
}

export async function resolveQrLink(
  db: D1Database,
  hostname: string,
  token: string,
  request: Request,
  cf?: VisitorCloudflareMetadata,
  unlockToken?: string,
  clicks?: AnalyticsEngineDataset,
): Promise<ShortLinkResponse> {
  return gateTokenPattern.test(token)
    ? resolveLink(db, hostname, 'qr', token, request, cf, unlockToken, clicks)
    : { status: 404 };
}
