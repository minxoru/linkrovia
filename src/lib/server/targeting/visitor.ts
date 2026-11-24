import Bowser from 'bowser';

export const operatingSystems = [
  'ios',
  'ipados',
  'android',
  'windows',
  'macos',
  'linux',
  'other',
] as const;
export const deviceTypes = ['mobile', 'tablet', 'desktop', 'other'] as const;
type OperatingSystem = (typeof operatingSystems)[number];
type Device = (typeof deviceTypes)[number];
type TrafficKind = 'human' | 'preview' | 'bot' | 'unknown';
const browserIds = new Map(
  Object.entries(Bowser.BROWSER_MAP).map(([id, name]) => [
    name.toLowerCase(),
    id,
  ]),
);

export interface VisitorCloudflareMetadata {
  country?: string | null;
  regionCode?: string | null;
}

export interface VisitorContext {
  os: OperatingSystem;
  device: Device;
  country: string;
  region: string;
  language: string;
  trafficKind: TrafficKind;
}

// ISO 3166-1 alpha-2 assignments from the public-domain IANA tzdb iso3166.tab.
const countryCodes = new Set(
  `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN
CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF
GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM
JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK
ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG
PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS
ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
VN VU WF WS YE YT ZA ZM ZW
`
    .trim()
    .split(/\s+/),
);

export function normalizeCountry(value: string): string | null {
  if (!/^[a-z]{2}$/i.test(value)) return null;
  const code = value.toUpperCase();
  return countryCodes.has(code) ? code : null;
}

export function normalizeRegion(value: string): string | null {
  const match = /^([a-z]{2})-([a-z0-9]{1,3})$/i.exec(value);
  if (!match || !normalizeCountry(match[1])) return null;
  return value.toUpperCase();
}

export function normalizeLanguage(value: string): string | null {
  if (value.length > 64 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value))
    return null;
  try {
    const [language] = Intl.getCanonicalLocales(value);
    return language === 'unknown' || language.split('-')[0] === 'und'
      ? null
      : language;
  } catch {
    return null;
  }
}

function readLanguage(header: string | null): string {
  if (!header || header.length > 2048) return 'unknown';
  const weighted = new Map<string, number>();
  for (const item of header.split(',')) {
    const match =
      /^([a-z0-9-]+)(?:\s*;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i.exec(
        item.trim(),
      );
    if (!match) continue;
    const language = normalizeLanguage(match[1]);
    if (!language) continue;
    const weight = match[2] === undefined ? 1 : Number(match[2]);
    const earlier = weighted.get(language);
    // An ambiguous duplicate cannot be a reliable preference.
    weighted.set(
      language,
      earlier === undefined || earlier === weight ? weight : 0,
    );
  }

  let preferred = 'unknown';
  let highest = 0;
  for (const [language, weight] of weighted) {
    if (weight > highest) {
      highest = weight;
      preferred = language;
    }
  }
  return preferred;
}

function readRegion(
  country: string,
  metadata?: VisitorCloudflareMetadata,
): string {
  const regionCode = metadata?.regionCode;
  if (
    country === 'unknown' ||
    typeof regionCode !== 'string' ||
    regionCode.length > 6
  )
    return 'unknown';
  const region = normalizeRegion(
    regionCode.includes('-') ? regionCode : `${country}-${regionCode}`,
  );
  return region?.startsWith(`${country}-`) ? region : 'unknown';
}

function classifyUserAgent(
  userAgent: string | null,
): Pick<VisitorContext, 'os' | 'device' | 'trafficKind'> & { browser: string } {
  const unknown = {
    os: 'other',
    device: 'other',
    browser: 'unknown',
    trafficKind: 'unknown',
  } as const;
  if (!userAgent || userAgent.length > 512 || /[\x00-\x1f\x7f]/.test(userAgent))
    return unknown;

  if (
    /\b(?:discordbot|facebookexternalhit|linkedinbot|slackbot-linkexpanding|telegrambot|twitterbot|whatsapp)\b/i.test(
      userAgent,
    )
  )
    return { ...unknown, trafficKind: 'preview' };

  const parser = Bowser.getParser(userAgent, true);
  const platform = parser.getPlatformType(true);
  if (platform === 'bot' || /\b(?:bot|crawler|spider)\b/i.test(userAgent))
    return { ...unknown, trafficKind: 'bot' };

  const iPad = /\bipad\b/i.test(userAgent);
  const groups = [
    /\b(?:ipad|iphone|ipod)\b/i.test(userAgent),
    /\bandroid\b/i.test(userAgent),
    /\bwindows\b/i.test(userAgent),
    /\bmacintosh\b/i.test(userAgent),
  ];
  if (
    groups.filter(Boolean).length > 1 ||
    (groups[3] && /\bmobile\b/i.test(userAgent))
  )
    return unknown;

  const osName = parser.getOSName(true);
  const matchOs = operatingSystems.find((os) => os === osName) ?? 'other';
  const os = matchOs === 'ios' && iPad ? 'ipados' : matchOs;
  const device = deviceTypes.find((entry) => entry === platform) ?? 'other';
  const trafficKind =
    os !== 'other' && device !== 'other' ? 'human' : 'unknown';
  const name = parser.getBrowserName(true);
  return {
    os,
    device,
    trafficKind,
    browser: browserIds.get(name) ?? 'unknown',
  };
}

export function getVisitorContext(
  request: Request,
  metadata?: VisitorCloudflareMetadata,
) {
  const rawCountry = metadata?.country;
  const country =
    (typeof rawCountry === 'string' ? normalizeCountry(rawCountry) : null) ??
    'unknown';
  return {
    ...classifyUserAgent(request.headers.get('user-agent')),
    country,
    region: readRegion(country, metadata),
    language: readLanguage(request.headers.get('accept-language')),
  };
}
