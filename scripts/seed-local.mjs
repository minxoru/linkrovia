import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) {
  console.error(
    'The Linkrovia seed accepts no arguments. Run npm run db:seed:local.',
  );
  process.exit(1);
}

const seed = `
INSERT INTO users (id, email, password_hash, role, locale, timezone, disabled_at)
VALUES ('seed-user-admin', 'admin@example.com', 'disabled-local-seed', 'admin', 'en', 'UTC', unixepoch())
ON CONFLICT DO NOTHING;

INSERT INTO domains (id, hostname)
VALUES
  ('seed-domain-com', 'short.example.com'),
  ('seed-domain-net', 'short.example.net'),
  ('seed-domain-org', 'short.example.org')
ON CONFLICT DO NOTHING;

WITH RECURSIVE link_numbers(n) AS (
  VALUES (1) UNION ALL SELECT n + 1 FROM link_numbers WHERE n < 100
), link_examples AS (
  SELECT n, CASE n % 3 WHEN 1 THEN 'com' WHEN 2 THEN 'net' ELSE 'org' END AS domain_suffix
  FROM link_numbers
)
INSERT INTO links (id, domain_id, slug, destination_url, title, redirect_type, is_active, expires_at, created_by)
SELECT
  printf('seed-link-%03d', n),
  domain.id,
  CASE WHEN n <= 2 THEN 'seed-shared' ELSE printf('seed-link-%03d', n) END,
  printf('https://example.com/links/%03d', n),
  printf('Example link %03d', n),
  CASE n % 4 WHEN 1 THEN 302 WHEN 2 THEN 307 WHEN 3 THEN 308 ELSE 301 END,
  n != 4,
  CASE WHEN n = 3 THEN unixepoch() - 86400 END,
  (SELECT id FROM users WHERE id = 'seed-user-admin' AND email = 'admin@example.com')
FROM link_examples
JOIN domains AS domain ON domain.id = 'seed-domain-' || domain_suffix
  AND domain.hostname = 'short.example.' || domain_suffix
WHERE true
ON CONFLICT DO NOTHING;

INSERT INTO tags (id, name)
VALUES
  ('seed-tag-demo', 'seed-demo'),
  ('seed-tag-campaign', 'seed-campaign'),
  ('seed-tag-archive', 'seed-archive')
ON CONFLICT DO NOTHING;

INSERT INTO link_tags (link_id, tag_id)
SELECT link.id, tag.id
FROM links AS link
JOIN tags AS tag ON tag.id = CASE link.redirect_type
  WHEN 301 THEN 'seed-tag-archive'
  WHEN 302 THEN 'seed-tag-demo'
  ELSE 'seed-tag-campaign'
END
WHERE link.id GLOB 'seed-link-[0-9][0-9][0-9]' AND link.destination_url LIKE 'https://example.com/links/%'
ON CONFLICT DO NOTHING;

WITH platforms(os, priority) AS (
  VALUES ('ios', 1), ('ipados', 2), ('android', 3), ('windows', 4), ('macos', 5), ('linux', 6), ('other', 7)
)
INSERT INTO redirect_rules (id, link_id, rule_type, rule_value, destination_url, priority)
SELECT 'seed-rule-' || os, link.id, 'os', os, 'https://example.com/platforms/' || os, priority
FROM platforms
CROSS JOIN links AS link
WHERE link.id = 'seed-link-001' AND link.destination_url = 'https://example.com/links/001'
ON CONFLICT DO NOTHING;
`;

const require = createRequire(import.meta.url);
const wranglerEntry = join(
  dirname(require.resolve('wrangler/package.json')),
  'bin',
  'wrangler.js',
);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const tempDirectory = mkdtempSync(join(tmpdir(), 'linkrovia-seed-'));

try {
  const seedFile = join(tempDirectory, 'seed.sql');
  writeFileSync(seedFile, seed, 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      wranglerEntry,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'wrangler.local.jsonc',
      '--file',
      seedFile,
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
