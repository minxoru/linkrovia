import type { TrendResult } from './repository';

export const hourSeconds = 3600;

export function utcHourStart(timestamp: number) {
  return Math.floor(timestamp / hourSeconds) * hourSeconds;
}

export function utcHourLabel(timestamp: number) {
  return new Date(utcHourStart(timestamp) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

export function dayBuckets(timezone: string): {
  timezone: string;
  dateBasis: TrendResult['meta']['dateBasis'];
  dateFor(timestamp: number): string;
} {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const canonicalTimezone = formatter.resolvedOptions().timeZone;
  return {
    timezone: canonicalTimezone,
    dateBasis: canonicalTimezone === 'UTC' ? 'UTC' : 'local',
    dateFor(timestamp) {
      const parts = formatter.formatToParts(timestamp * 1000);
      const year = parts.find(({ type }) => type === 'year')?.value;
      const month = parts.find(({ type }) => type === 'month')?.value;
      const day = parts.find(({ type }) => type === 'day')?.value;
      return `${year}-${month}-${day}`;
    },
  };
}
