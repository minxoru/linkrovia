import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import {
  getTurnstileConfig,
  saveTurnstileConfig,
} from '../../src/lib/server/security/turnstile';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  await platform.env.DB.prepare(
    'CREATE TABLE app_settings (key TEXT PRIMARY KEY, json_value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
  ).run();
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

it('starts disabled, stores only public settings, and fails closed on damaged settings', async () => {
  const db = platform.env.DB;
  expect(await getTurnstileConfig(db)).toEqual({ enabled: false, siteKey: '' });
  const values = {
    enabled: true,
    siteKey: '0x4AAF00AAAABn0R22HWm-YUc',
    secretKey: 'ignored',
  };
  await saveTurnstileConfig(db, values);
  expect(await getTurnstileConfig(db)).toEqual({
    enabled: true,
    siteKey: values.siteKey,
  });
  expect(
    await db
      .prepare('SELECT json_value FROM app_settings')
      .first<string>('json_value'),
  ).toBe('{"enabled":true,"siteKey":"0x4AAF00AAAABn0R22HWm-YUc"}');
  await saveTurnstileConfig(db, { ...values, enabled: false });
  expect(await getTurnstileConfig(db)).toEqual({
    enabled: false,
    siteKey: values.siteKey,
  });
  await db.prepare("UPDATE app_settings SET json_value = 'invalid'").run();
  expect(await getTurnstileConfig(db)).toEqual({ enabled: true, siteKey: '' });
});
