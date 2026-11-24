import { normalizeHostname } from '../security/url-policy';
import type { getVisitorContext } from '../targeting';

function referrerHostname(referrer: string | null) {
  if (!referrer) return 'direct';
  if (referrer.length > 8192 || !/^https?:\/\//i.test(referrer))
    return 'unknown';
  try {
    const url = new URL(referrer);
    return normalizeHostname(url.hostname) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

interface ClickEvent {
  linkId: string;
  domainId: string;
  matchedRuleId: string | null;
  source: 'qr' | 'link';
  referrer: string | null;
  visitor: ReturnType<typeof getVisitorContext>;
}

export function clickDataPoint({
  linkId,
  domainId,
  matchedRuleId,
  source,
  referrer,
  visitor,
}: ClickEvent): AnalyticsEngineDataPoint | null {
  const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
  if (!identifier.test(linkId) || !identifier.test(domainId)) return null;
  return {
    indexes: [linkId],
    blobs: [
      domainId,
      visitor.country === 'unknown' ? 'XX' : visitor.country,
      visitor.region,
      referrerHostname(referrer),
      visitor.device,
      visitor.os,
      visitor.browser,
      matchedRuleId && identifier.test(matchedRuleId)
        ? matchedRuleId
        : 'default',
      source,
      visitor.trafficKind,
      'none',
    ],
    doubles: [1],
  };
}
