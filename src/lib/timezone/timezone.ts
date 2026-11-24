import { Temporal } from '@js-temporal/polyfill';
import bundled from './timezones.json';

export const timeZones = [
  ...new Set([
    'UTC',
    ...(Intl.supportedValuesOf?.('timeZone') ?? []),
    ...bundled.zones,
  ]),
].sort((a, b) =>
  a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b, 'en'),
);

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !timeZones.includes(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(user: unknown, app: unknown): string {
  if (isTimeZone(user)) return user;
  return isTimeZone(app) ? app : 'UTC';
}

type LocalDateTime =
  | { kind: 'exact'; epochSeconds: number }
  | { kind: 'overlap'; earlier: number; later: number }
  | { kind: 'gap' }
  | { kind: 'invalid' };

export function interpretLocalDateTime(
  value: string,
  timeZone: string,
): LocalDateTime {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ||
    !isTimeZone(timeZone)
  ) {
    return { kind: 'invalid' };
  }

  try {
    const local = Temporal.PlainDateTime.from(value);
    const earlier = local.toZonedDateTime(timeZone, {
      disambiguation: 'earlier',
    });
    const later = local.toZonedDateTime(timeZone, { disambiguation: 'later' });
    if (earlier.equals(later))
      return { kind: 'exact', epochSeconds: earlier.epochMilliseconds / 1000 };
    if (
      !earlier.toPlainDateTime().equals(local) ||
      !later.toPlainDateTime().equals(local)
    ) {
      return { kind: 'gap' };
    }
    return {
      kind: 'overlap',
      earlier: earlier.epochMilliseconds / 1000,
      later: later.epochMilliseconds / 1000,
    };
  } catch {
    return { kind: 'invalid' };
  }
}
