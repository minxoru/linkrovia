import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fixtureSetupToken } from '../tests/fixtures/setup.mjs';

const require = createRequire(import.meta.url);
const port = process.env.LINKROVIA_E2E_PORT ?? '4173';
const host = process.env.LINKROVIA_E2E_HOST ?? '127.0.0.1';
if (!/^\d{1,5}$/.test(port)) throw new Error('Invalid test server port.');
const wrangler = join(
  dirname(require.resolve('wrangler/package.json')),
  'bin/wrangler.js',
);
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
mkdirSync('.wrangler', { recursive: true });
const directory = mkdtempSync(resolve('.wrangler/e2e-'));
const generated = mkdtempSync(resolve('.svelte-kit-e2e-'));
const state = join(directory, 'state');
const config = join(directory, 'wrangler.jsonc');

try {
  const local = readFileSync('wrangler.local.jsonc', 'utf8');
  const migrations = relative(directory, resolve('migrations'));
  writeFileSync(
    config,
    local.replace(
      '"migrations_dir": "migrations"',
      '"migrations_dir": ' + JSON.stringify(migrations),
    ),
  );
  writeFileSync(
    join(directory, '.dev.vars'),
    'SETUP_TOKEN=' + fixtureSetupToken + '\n',
  );

  const migration = spawnSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      config,
      '--persist-to',
      state,
    ],
    { stdio: 'inherit' },
  );
  if (migration.error) throw migration.error;
  if (migration.status !== 0)
    throw new Error('Could not initialize the isolated test database.');

  if (host === 'localhost') {
    const domain = spawnSync(
      process.execPath,
      [
        wrangler,
        'd1',
        'execute',
        'DB',
        '--local',
        '--config',
        config,
        '--persist-to',
        state,
        '--command',
        `INSERT INTO domains (id, hostname, provider_mode, connection_status, verified_at)
         VALUES ('passkey-custom-host', '127.0.0.1', 'cloudflare_custom_domain', 'active', unixepoch())`,
      ],
      { stdio: 'inherit' },
    );
    if (domain.error) throw domain.error;
    if (domain.status !== 0)
      throw new Error('Could not seed the isolated custom domain.');
  }

  const server = spawn(
    process.execPath,
    [vite, 'dev', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        LINKROVIA_E2E_OUT_DIR: join(generated, 'kit'),
        LINKROVIA_E2E_VITE_CACHE: join(generated, 'vite'),
        LINKROVIA_E2E_WRANGLER_CONFIG: config,
        LINKROVIA_E2E_WORKER_STATE: join(state, 'v3'),
      },
    },
  );
  process.once('SIGINT', () => server.kill('SIGINT'));
  process.once('SIGTERM', () => server.kill('SIGTERM'));
  process.exitCode = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => resolve(code ?? 0));
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
  rmSync(generated, { recursive: true, force: true });
}
