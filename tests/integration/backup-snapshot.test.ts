import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readBackupState } from '../../src/lib/server/backup/snapshot';

it('exports portable configuration and looks up incoming tombstones', async () => {
  using sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const migration of readdirSync(migrations).sort()) {
    sqlite.exec(readFileSync(new URL(migration, migrations), 'utf8'));
  }

  sqlite.exec(`
    INSERT INTO domains (id, hostname, is_primary, connection_status)
      VALUES ('live', 'go.example.com', 1, 'active'), ('old', 'old.example.com', 0, 'draft');
    UPDATE domains SET backup_archived_at = 100, is_active = 0 WHERE id = 'old';
    INSERT INTO links (id, domain_id, slug, destination_url, protection_mode, protection_password_hash, gate_token)
      VALUES ('live-link', 'live', 'welcome', 'https://example.com/', 'password', 'scrypt-v1$32768$8$3$' || lower(hex(zeroblob(16))) || '$' || lower(hex(zeroblob(32))), 'private-gate');
    INSERT INTO links (id, domain_id, slug, destination_url, protection_mode, consumed_at, deleted_at)
      VALUES ('old-link', 'old', 'welcome', 'https://example.com/', 'one_time', 90, 100);
    UPDATE links SET protection_mode = 'password_one_time',
      protection_password_hash = 'scrypt-v1$32768$8$3$placeholder' WHERE id = 'old-link';
    UPDATE links SET utm_config_json = '{"default":{"utm_source":"web"},"rules":{"rule":{"utm_source":"us"},"stale":{"utm_source":"old"}}}'
      WHERE id = 'live-link';
    INSERT INTO redirect_rules (id, link_id, rule_type, rule_value, destination_url, priority)
      VALUES ('rule', 'live-link', 'country', 'US', 'https://example.com/us', 0);
    INSERT INTO utm_templates (id, name, values_json)
      VALUES ('template', 'Campaign', '{"description":"Spring campaign","values":{"utm_campaign":"spring"}}');
    INSERT INTO qr_codes (id, link_id, token) VALUES ('qr', 'live-link', 'private-qr');
    INSERT INTO conversion_goals (id, link_id, name, event_name, backup_archived_at)
      VALUES ('linked', 'old-link', 'Linked', 'signup', NULL),
        ('recent-linked', 'old-link', 'Newer', 'signup', 500),
        ('old-global', NULL, 'Old', 'pageview', 100),
        ('new-global', NULL, 'New', 'pageview', 200),
        ('unrelated', NULL, 'Unrelated', 'other', 200);
    INSERT INTO app_settings (key, json_value) VALUES ('turnstile', '"private-key"');
  `);

  const prepare = (sql: string, args: string[] = []) => ({
    bind: (...values: string[]) => prepare(sql, values),
    all: () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) =>
      statements.map((statement) => statement.all()),
  } as unknown as D1Database;

  const snapshot = await readBackupState(db);
  expect(snapshot.domains).toMatchObject([
    { hostname: 'go.example.com', isConnected: true },
  ]);
  expect(snapshot.tombstones).toEqual([]);
  expect(snapshot.data.conversionGoals).toEqual([]);
  expect(snapshot.archivedGoals).toEqual([]);
  expect(snapshot.linkSecurity).toEqual([]);
  expect(snapshot.data).toMatchObject({
    appSettings: { defaultTimeZone: 'UTC', defaultLocale: 'en' },
    domains: [
      {
        id: 'live',
        hostname: 'go.example.com',
        isPrimary: true,
        isActive: true,
      },
    ],
    links: [
      {
        id: 'live-link',
        protectionMode: 'password',
        utmConfig: {
          default: { utm_source: 'web' },
          rules: { rule: { utm_source: 'us' } },
        },
      },
    ],
    redirectRules: [
      { conditions: [{ type: 'country', operator: 'eq', value: 'US' }] },
    ],
    utmTemplates: [
      { description: 'Spring campaign', values: { utm_campaign: 'spring' } },
    ],
    qrMetadata: [{ id: 'qr', linkId: 'live-link', label: null }],
  });
  expect(snapshot.data.links[0].utmConfig?.rules).not.toHaveProperty('stale');
  expect(JSON.stringify(snapshot.data)).not.toMatch(/private-|scrypt-v1/);
  const restore = await readBackupState(db, {
    ...snapshot.data,
    domains: [
      {
        id: 'other',
        hostname: 'old.example.com',
        isPrimary: false,
        isActive: false,
      },
    ],
    links: [{ ...snapshot.data.links[0], id: 'live-link', domainId: 'other' }],
    conversionGoals: [
      {
        id: 'linked',
        linkId: 'live-link',
        name: 'Linked',
        eventName: 'signup',
        attributionWindowHours: 24,
        isActive: true,
      },
      {
        id: 'source-global',
        linkId: null,
        name: 'Global',
        eventName: 'pageview',
        attributionWindowHours: 24,
        isActive: true,
      },
    ],
  });
  expect(restore.domains).toContainEqual({
    id: 'old',
    hostname: 'old.example.com',
    isPrimary: false,
    isActive: false,
    isConnected: false,
    archived: true,
  });
  expect(restore.archivedGoals).toMatchObject([
    { id: 'linked', linkId: 'old-link', eventName: 'signup' },
    { id: 'new-global', linkId: null, eventName: 'pageview' },
  ]);
  expect(restore.linkSecurity).toEqual([
    {
      id: 'live-link',
      domainId: 'live',
      slug: 'welcome',
      protectionMode: 'password',
      consumedAt: null,
      hasPassword: true,
    },
    {
      id: 'old-link',
      domainId: 'old',
      slug: 'welcome',
      protectionMode: 'password_one_time',
      consumedAt: 90,
      hasPassword: false,
    },
  ]);
  expect(restore.tombstones).toEqual([
    {
      id: 'old-link',
      domainId: 'old',
      slug: 'welcome',
      protectionMode: 'password_one_time',
      consumedAt: 90,
    },
  ]);
});
