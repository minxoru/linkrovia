import { parseDestinationUrl } from '../security/url-policy';
import {
  deviceTypes,
  normalizeCountry,
  normalizeLanguage,
  normalizeRegion,
  operatingSystems,
  type VisitorContext,
} from './visitor';

export {
  getVisitorContext,
  type VisitorCloudflareMetadata,
  type VisitorContext,
} from './visitor';

type TargetingConditionType =
  'os' | 'device' | 'country' | 'region' | 'language';

export type TargetingCondition =
  | { type: TargetingConditionType; operator: 'eq'; value: string }
  | { type: 'language'; operator: 'base_language'; value: string };

export interface TargetingRule {
  id: string;
  priority: number;
  isActive: number;
  conditionsJson: string | null;
  ruleType: string;
  operator: string;
  ruleValue: string;
  destinationUrl: string;
}

function normalizeConditionValue(type: unknown, value: string): string | null {
  switch (type) {
    case 'os':
      return operatingSystems.find((os) => os === value) ?? null;
    case 'device':
      return deviceTypes.find((device) => device === value) ?? null;
    case 'country':
      return normalizeCountry(value);
    case 'region':
      return normalizeRegion(value);
    case 'language':
      return normalizeLanguage(value);
    default:
      return null;
  }
}

function isConditionType(type: unknown): type is TargetingConditionType {
  return (
    type === 'os' ||
    type === 'device' ||
    type === 'country' ||
    type === 'region' ||
    type === 'language'
  );
}

export function parseConditions(value: unknown): TargetingCondition[] | null {
  if (typeof value === 'string') {
    if (value.length > 4096) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 5)
    return null;

  const conditions: TargetingCondition[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return null;
    const { type, operator, value: rawValue } = item as Record<string, unknown>;
    if (!isConditionType(type) || typeof rawValue !== 'string') return null;
    const normalized = normalizeConditionValue(type, rawValue);
    if (!normalized) return null;

    if (operator === 'eq') {
      conditions.push({ type, operator, value: normalized });
    } else if (
      operator === 'base_language' &&
      type === 'language' &&
      !normalized.includes('-')
    ) {
      conditions.push({ type, operator, value: normalized });
    } else {
      return null;
    }
  }
  return conditions;
}

function matches(condition: TargetingCondition, visitor: VisitorContext) {
  if (condition.operator === 'base_language')
    return visitor.language.split('-')[0] === condition.value;
  return visitor[condition.type] === condition.value;
}

export function selectDestination(
  link: { destinationUrl: string },
  rules: readonly TargetingRule[],
  visitor: VisitorContext,
): { url: URL; matchedRuleId: string | null } | null {
  let best: { url: URL; priority: number; id: string } | undefined;
  for (const rule of rules) {
    if (rule.isActive !== 1 || !Number.isSafeInteger(rule.priority)) continue;
    if (
      best &&
      (rule.priority > best.priority ||
        (rule.priority === best.priority && rule.id >= best.id))
    )
      continue;

    const conditions = parseConditions(
      rule.conditionsJson ?? [
        { type: rule.ruleType, operator: rule.operator, value: rule.ruleValue },
      ],
    );
    if (!conditions?.every((condition) => matches(condition, visitor)))
      continue;

    const url = parseDestinationUrl(rule.destinationUrl);
    if (url) best = { url, priority: rule.priority, id: rule.id };
  }

  if (best) return { url: best.url, matchedRuleId: best.id };
  const url = parseDestinationUrl(link.destinationUrl);
  return url ? { url, matchedRuleId: null } : null;
}
