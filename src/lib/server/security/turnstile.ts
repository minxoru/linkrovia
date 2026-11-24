import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { appSettings } from '../db/schema';

export type TurnstileAction =
  'login' | 'setup' | 'link_gate' | 'security_settings';

type TurnstileConfig = { enabled: boolean; siteKey: string };

const settingKey = 'turnstile';
const endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const testSiteKeys = {
  '1x00000000000000000000AA': ['pass', 'spent'],
  '2x00000000000000000000AB': ['fail'],
  '1x00000000000000000000BB': ['pass', 'spent'],
  '2x00000000000000000000BB': ['fail'],
  '3x00000000000000000000FF': ['pass', 'spent'],
} as const;
const testSecrets = {
  '1x0000000000000000000000000000000AA': 'pass',
  '2x0000000000000000000000000000000AA': 'fail',
  '3x0000000000000000000000000000000AA': 'spent',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSiteKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);
}

export async function getTurnstileConfig(
  db: D1Database,
): Promise<TurnstileConfig> {
  const row = await getDb(db)
    .select({ value: appSettings.jsonValue })
    .from(appSettings)
    .where(eq(appSettings.key, settingKey))
    .get();

  if (!row) return { enabled: false, siteKey: '' };
  try {
    const value: unknown = JSON.parse(row.value);
    if (isRecord(value) && typeof value.enabled === 'boolean') {
      return {
        enabled: value.enabled,
        siteKey: isSiteKey(value.siteKey) ? value.siteKey : '',
      };
    }
  } catch {
    // A corrupted setting still requires verification.
  }
  return { enabled: true, siteKey: '' };
}

export async function saveTurnstileConfig(
  db: D1Database,
  config: TurnstileConfig,
) {
  const jsonValue = JSON.stringify({
    enabled: config.enabled,
    siteKey: config.siteKey,
  });
  await getDb(db)
    .insert(appSettings)
    .values({ key: settingKey, jsonValue })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { jsonValue, updatedAt: sql`unixepoch()` },
    });
}

type TurnstileKeys = {
  siteKey: string;
  secretKey: string | undefined;
  hostname: string;
  development: boolean;
};

type TurnstileConfigurationStatus =
  'missingSiteKey' | 'missingSecret' | 'invalidKeys' | 'ready' | 'test';

export function turnstileConfigurationStatus({
  siteKey,
  secretKey,
  hostname,
  development,
}: TurnstileKeys): TurnstileConfigurationStatus {
  if (!siteKey) return 'missingSiteKey';
  if (!secretKey?.trim()) return 'missingSecret';
  if (!isSiteKey(siteKey) || /\s/.test(secretKey) || siteKey === secretKey)
    return 'invalidKeys';

  const testSiteKey = Object.hasOwn(testSiteKeys, siteKey);
  const testSecret = Object.hasOwn(testSecrets, secretKey);
  if (!testSiteKey && !testSecret) return 'ready';

  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (development && loopback && testSiteKey && testSecret) {
    const acceptedSecrets: readonly string[] =
      testSiteKeys[siteKey as keyof typeof testSiteKeys];
    const testMode = testSecrets[secretKey as keyof typeof testSecrets];
    if (acceptedSecrets.includes(testMode)) return 'test';
  }
  return 'invalidKeys';
}

type VerificationOptions = Omit<TurnstileKeys, 'siteKey'> & {
  config: TurnstileConfig;
  token: unknown;
  action: TurnstileAction;
  fetch?: typeof globalThis.fetch;
};

export async function verifyTurnstile({
  config,
  secretKey,
  token,
  action,
  hostname,
  development,
  fetch = globalThis.fetch,
}: VerificationOptions): Promise<boolean> {
  if (!config.enabled) return true;
  if (
    typeof token !== 'string' ||
    token.length > 2048 ||
    !/^[\x21-\x7e]+$/.test(token)
  ) {
    return false;
  }

  const status = turnstileConfigurationStatus({
    siteKey: config.siteKey,
    secretKey,
    hostname,
    development,
  });
  if (!secretKey || !hostname || (status !== 'ready' && status !== 'test'))
    return false;
  if (status === 'test' && token !== 'XXXX.DUMMY.TOKEN.XXXX') return false;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: new URLSearchParams({ secret: secretKey, response: token }),
      credentials: 'omit',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return false;

    const result: unknown = await response.json();
    if (!isRecord(result) || result.success !== true) return false;
    const errors = result['error-codes'];
    if (errors !== undefined && (!Array.isArray(errors) || errors.length !== 0))
      return false;

    if (status === 'test') {
      // Cloudflare's dummy validation omits the action and uses a fixed hostname.
      return (
        testSecrets[secretKey as keyof typeof testSecrets] === 'pass' &&
        result.hostname === 'example.com' &&
        !Object.hasOwn(result, 'action')
      );
    }
    return result.hostname === hostname && result.action === action;
  } catch {
    return false;
  }
}
