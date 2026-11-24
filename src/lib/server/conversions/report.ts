import { Temporal } from '@js-temporal/polyfill';
import { AnalyticsInputError, parseAnalyticsQuery } from '../analytics/report';

export function parseConversionReport(
  params: URLSearchParams,
  timezone: string,
) {
  if ([...params.keys()].some((key) => !['from', 'to', 'tz'].includes(key)))
    throw new AnalyticsInputError('invalid_filters');
  const period = parseAnalyticsQuery(params, timezone, { allowArchived: true });
  if (Temporal.PlainDate.from(period.from).until(period.to).days >= 30)
    throw new AnalyticsInputError('out_of_range');
  return {
    ...period,
    timezone: period.archived ? 'UTC' : period.query.timezone,
  };
}
