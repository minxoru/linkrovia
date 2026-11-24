import { shortUrl } from '$lib/server/links/form';
import type { LinkSummary } from '$lib/server/links/store';
import { parseDestinationUrl } from '$lib/server/security/url-policy';
import { parseConditions, type TargetingRule } from '$lib/server/targeting';
import { parseUtmConfig } from '$lib/server/utm';

export function linkRepresentation(
  link: LinkSummary,
  origin: URL,
  rules: readonly TargetingRule[],
) {
  const { utmConfigJson, ...publicFields } = link;
  let utmConfig = null;
  if (utmConfigJson) {
    try {
      utmConfig = parseUtmConfig(JSON.parse(utmConfigJson));
    } catch {
      utmConfig = null;
    }
  }
  return {
    ...publicFields,
    utmConfig,
    shortUrl: shortUrl(link, origin),
    rules: rules.flatMap((rule) => {
      const conditions = parseConditions(
        rule.conditionsJson ?? [
          {
            type: rule.ruleType,
            operator: rule.operator,
            value: rule.ruleValue,
          },
        ],
      );
      const destination = parseDestinationUrl(rule.destinationUrl);
      if (!conditions || !destination) return [];
      return [
        {
          id: rule.id,
          conditions,
          isActive: rule.isActive === 1,
          priority: rule.priority,
          destinationUrl: destination.href,
        },
      ];
    }),
  };
}
