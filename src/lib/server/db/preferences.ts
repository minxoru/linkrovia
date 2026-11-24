import { eq } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n/locale';
import { resolveTimeZone } from '../../timezone/timezone';
import { getDb } from './client';
import { appSettings } from './schema';

export async function getEffectiveTimeZone(
  db: ReturnType<typeof getDb>,
  userTimeZone?: string | null,
) {
  const row = await db
    .select({ value: appSettings.jsonValue })
    .from(appSettings)
    .where(eq(appSettings.key, 'default_timezone'))
    .get();

  let defaultTimeZone: unknown;
  if (row) {
    try {
      defaultTimeZone = JSON.parse(row.value);
    } catch {
      defaultTimeZone = null;
    }
  }
  return resolveTimeZone(userTimeZone, defaultTimeZone);
}

export function parseDefaultLocale(value: string | undefined): Locale {
  try {
    const locale: unknown = JSON.parse(value ?? 'null');
    if (isLocale(locale)) return locale;
  } catch {
    // A malformed stored preference falls back to English.
  }
  return 'en';
}

export async function getDefaultLocale(db: D1Database): Promise<Locale> {
  const value = await db
    .prepare("SELECT json_value FROM app_settings WHERE key = 'default_locale'")
    .first<string>('json_value');
  return parseDefaultLocale(value ?? undefined);
}
