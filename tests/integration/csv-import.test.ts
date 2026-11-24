import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { commitCsv, previewCsv } from '../../src/lib/server/links/csv-import';
import { parseCsv } from '../../src/lib/csv';
import { markPreviewDuplicates } from '../../src/routes/admin/import/preview';

let sqlite: DatabaseSync;
let db: D1Database;

// Run the D1 statements against SQLite with atomic batch semantics.
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  for (const name of [
    '0001_initial.sql',
    '0002_domain_connections.sql',
    '0004_link_protection.sql',
    '0006_backup.sql',
    '0007_conversions.sql',
  ]) {
    sqlite.exec(
      readFileSync(
        new URL('../../migrations/' + name, import.meta.url),
        'utf8',
      ),
    );
  }
  sqlite.exec(
    "INSERT INTO domains(id, hostname, is_primary, connection_status) VALUES ('primary', 'go.example.org', 1, 'active')",
  );
  const prepare = (sql: string, args: (string | number | null)[] = []) => ({
    bind: (...values: (string | number | null)[]) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: () => ({
      meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
    }),
  });
  db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (cause) {
        sqlite.exec('ROLLBACK');
        throw cause;
      }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());

const options = { timeZone: 'America/New_York', duplicate: 'skip' } as const;
const sample = parseCsv(
  'destination_url,slug,expires_at,ios_url,tags\n' +
    'https://example.org,first,2027-01-01T09:30,https://apps.apple.com/app/id123,"demo,ios"\n' +
    'https://example.org,first,,,\n' +
    'http://localhost,unsafe,,,\n' +
    'https://example.org,gap,2027-03-14T02:30,,\n' +
    'https://example.org,overlap,2027-11-07T01:30,,\n' +
    'https://example.org/auto,,,,\n',
);
const count = () =>
  sqlite.prepare('SELECT COUNT(*) AS count FROM links').get()?.count;

it('previews without writes, detects duplicates, validates URLs and interprets timezone', async () => {
  const preview = await previewCsv(db, sample, options);
  expect(preview.rows).toMatchObject([
    { row: 2, status: 'ready', slug: 'first' },
    { row: 3, status: 'skipped', code: 'duplicate' },
    { row: 4, status: 'error', fields: ['destination_url'] },
    { row: 5, status: 'error', code: 'time_gap', fields: ['expires_at'] },
    { row: 6, status: 'error', code: 'time_overlap', fields: ['expires_at'] },
    { row: 7, status: 'ready' },
  ]);
  expect(count()).toBe(0);
});

it('commits batches with partial success and retries unchanged rows safely', async () => {
  expect((await commitCsv(db, null, sample, options, 0)).rows).toMatchObject([
    { row: 2, status: 'created' },
    { row: 3, status: 'skipped' },
    { row: 4, status: 'error' },
    { row: 5, status: 'error' },
  ]);
  const preview = await previewCsv(db, sample, options);
  const generated = preview.rows[5].record!;
  const materialized = {
    headers: preview.headers,
    rows: [
      ...sample.rows.slice(0, 5).map((row) => [...row, 'go.example.org']),
      generated,
    ],
  };
  const next = await commitCsv(db, null, materialized, options, 4);
  expect(next).toMatchObject({
    nextOffset: null,
    rows: [
      { row: 6, status: 'error' },
      { row: 7, status: 'created' },
    ],
  });
  expect(
    (await commitCsv(db, null, materialized, options, 4)).rows[1],
  ).toMatchObject({
    status: 'skipped',
  });
  expect(count()).toBe(2);
  expect(
    sqlite.prepare("SELECT expires_at FROM links WHERE slug = 'first'").get()
      ?.expires_at,
  ).toBe(Date.parse('2027-01-01T14:30:00Z') / 1000);
  expect(
    sqlite.prepare('SELECT COUNT(*) AS count FROM redirect_rules').get()?.count,
  ).toBe(1);
  expect(
    sqlite.prepare('SELECT COUNT(*) AS count FROM link_tags').get()?.count,
  ).toBe(2);
});

it('returns a row error for conflicts under the error policy without replacing links', async () => {
  await commitCsv(db, null, sample, options, 0);
  const rows = await commitCsv(
    db,
    null,
    parseCsv('destination_url,slug\nhttps://example.com/other,first'),
    { ...options, duplicate: 'error' },
    0,
  );
  expect(rows.rows[0]).toMatchObject({ status: 'error', code: 'duplicate' });
  expect(
    sqlite
      .prepare("SELECT destination_url FROM links WHERE slug = 'first'")
      .get()?.destination_url,
  ).toBe('https://example.org/');
});

it('previews bounded batches while detecting duplicates across the full browser import', async () => {
  const file = parseCsv(
    'destination_url,slug\n' +
      Array.from(
        { length: 50 },
        (_, index) => `https://example.org/${index},link-${index}\n`,
      ).join('') +
      'https://example.org/other,link-0\n',
  );
  const first = await previewCsv(db, file, options);
  expect(first.rows).toHaveLength(50);
  expect(first.nextOffset).toBe(50);
  const last = await previewCsv(db, file, options, first.nextOffset!);
  expect(last.nextOffset).toBeNull();
  const results = markPreviewDuplicates([...first.rows, ...last.rows], 'skip');
  expect(results[50]).toMatchObject({
    row: 52,
    status: 'skipped',
    code: 'duplicate',
  });
  expect(count()).toBe(0);
});
