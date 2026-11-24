import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import {
  ensureDefaultQr,
  getDefaultQr,
  qrLink,
} from '../../src/lib/server/links/qr-store';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  for (const name of ['0001_initial.sql', '0002_domain_connections.sql']) {
    const sql = await readFile(
      new URL('../../migrations/' + name, import.meta.url),
      'utf8',
    );
    await platform.env.DB.batch(
      sql
        .replace(/--.*$/gm, '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => platform.env.DB.prepare(s)),
    );
  }
  await platform.env.DB.batch([
    platform.env.DB.prepare(
      "INSERT INTO domains(id,hostname,is_active,connection_status) VALUES('d','go.example.com',1,'active')",
    ),
    platform.env.DB.prepare(
      "INSERT INTO links(id,domain_id,slug,destination_url) VALUES('l','d','a','https://example.com')",
    ),
  ]);
}, 15000);
afterAll(async () => platform?.dispose());
it('creates one unpredictable stable default token under concurrency', async () => {
  const db = platform.env.DB;
  expect(await getDefaultQr(db, 'l')).toBeNull();
  const created = await Promise.all(
    Array.from({ length: 10 }, () => ensureDefaultQr(db, 'l')),
  );
  expect(created[0]?.token).toMatch(/^[a-f0-9]{64}$/);
  expect(new Set(created.map((item) => item?.token)).size).toBe(1);
  expect(await qrLink(db, 'l')).not.toBeNull();
  await db
    .prepare("UPDATE domains SET connection_status = 'draft' WHERE id = 'd'")
    .run();
  expect(await qrLink(db, 'l')).toBeNull();
  await db
    .prepare(
      "INSERT INTO links(id,domain_id,slug,destination_url) VALUES('draft','d','draft','https://example.com')",
    )
    .run();
  expect(await ensureDefaultQr(db, 'draft')).toBeNull();
});
