import en from '../../../messages/en.json';
import ja from '../../../messages/ja.json';
import zhCN from '../../../messages/zh-CN.json';
import zhTW from '../../../messages/zh-TW.json';
import es from '../../../messages/es.json';
import it from '../../../messages/it.json';
import fr from '../../../messages/fr.json';
import { brand } from '../brand';

export const locales = [
  'en',
  'ja',
  'zh-CN',
  'zh-TW',
  'es',
  'it',
  'fr',
] as const;
export type Locale = (typeof locales)[number];

const catalogs = {
  en,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  es,
  it,
  fr,
} satisfies Record<Locale, typeof en>;

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(catalogs, value);
}

export function messagesFor(locale: Locale): typeof en {
  const messages = { ...en, ...catalogs[locale] };
  if (brand.name !== 'Linkrovia') {
    for (const key of Object.keys(messages) as (keyof typeof en)[]) {
      messages[key] = messages[key].replaceAll('Linkrovia', () => brand.name);
    }
  }
  return messages;
}

export function preferredLocale(
  user: unknown,
  cookie: unknown,
  acceptLanguage: string | null = null,
): Locale | undefined {
  if (isLocale(user)) return user;
  if (isLocale(cookie)) return cookie;

  const candidates = (acceptLanguage ?? '')
    .split(',')
    .map((entry) => {
      const [tag, parameter] = entry.trim().split(';');
      const weight =
        parameter === undefined
          ? 1
          : /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(parameter.trim())?.[1];
      return { tag: tag.toLowerCase(), weight: Number(weight ?? 0) };
    })
    .sort((a, b) => b.weight - a.weight);

  for (const { tag, weight } of candidates) {
    if (weight === 0) break;
    const [language, ...subtags] = tag.split('-');
    if (language === 'zh') {
      if (subtags.includes('hant')) return 'zh-TW';
      if (subtags.includes('hans')) return 'zh-CN';
      return subtags.some((subtag) => ['tw', 'hk', 'mo'].includes(subtag))
        ? 'zh-TW'
        : 'zh-CN';
    }
    if (isLocale(language)) return language;
  }
}

export function resolveLocale(
  user: unknown,
  cookie: unknown,
  acceptLanguage: string | null = null,
): Locale {
  return preferredLocale(user, cookie, acceptLanguage) ?? 'en';
}
