import { readFile, readdir } from 'node:fs/promises';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { getDb } from '../../src/lib/server/db/client';
import { getEffectiveTimeZone } from '../../src/lib/server/db/preferences';
import * as schema from '../../src/lib/server/db/schema';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });

  const migrations = new URL('../../migrations/', import.meta.url);
  for (const migration of (await readdir(migrations))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(new URL(migration, migrations), 'utf8');
    const statements = unstable_splitSqlQuery(sql);
    await platform.env.DB.batch(
      statements.map((statement) => platform.env.DB.prepare(statement)),
    );
  }
}, 15_000);

afterAll(async () => {
  await platform?.dispose();
});

describe('D1 migrations', () => {
  it('provides all Drizzle tables and columns', async () => {
    const db = getDb(platform.env.DB);
    const tables = Object.values(schema).filter(
      (table) => table instanceof SQLiteTable,
    );
    for (const table of tables) {
      const config = getTableConfig(table);
      const result = await platform.env.DB.prepare(
        'SELECT name FROM pragma_table_info(?)',
      )
        .bind(config.name)
        .all<{ name: string }>();
      expect(result.results.map(({ name }) => name).sort()).toEqual(
        config.columns.map(({ name }) => name).sort(),
      );
    }
    expect(await db.select().from(schema.setupState)).toEqual([
      {
        singleton: 1,
        completedAt: null,
        ownerUserId: null,
        tokenConsumedAt: null,
        deploymentHostname: null,
        managementHostname: null,
        managementOperationId: null,
        managementOperationExpiresAt: null,
      },
    ]);
  });

  it('enforces domain-scoped slug uniqueness and link protection checks', async () => {
    const db = getDb(platform.env.DB);
    await db.insert(schema.domains).values([
      { id: 'first', hostname: 'go.example.com', isPrimary: 1 },
      { id: 'second', hostname: 'go.example.org' },
    ]);
    const link = { slug: 'guide', destinationUrl: 'https://example.com' };
    await db
      .insert(schema.links)
      .values({ id: 'a', domainId: 'first', ...link });
    await db
      .insert(schema.links)
      .values({ id: 'b', domainId: 'second', ...link });
    await expect(
      db.insert(schema.links).values({ id: 'c', domainId: 'first', ...link }),
    ).rejects.toThrow();
    await expect(
      db.insert(schema.links).values({
        id: 'd',
        domainId: 'first',
        slug: 'protected',
        destinationUrl: link.destinationUrl,
        protectionMode: 'password',
      }),
    ).rejects.toThrow();
  });

  it('reads stored instance timezone preferences with a user override and a UTC fallback', async () => {
    const db = getDb(platform.env.DB);
    expect(await getEffectiveTimeZone(db)).toBe('UTC');
    await db
      .insert(schema.appSettings)
      .values({ key: 'default_timezone', jsonValue: '"Asia/Tokyo"' });
    expect(await getEffectiveTimeZone(db)).toBe('Asia/Tokyo');
    expect(await getEffectiveTimeZone(db, 'Europe/Rome')).toBe('Europe/Rome');
  });
});
