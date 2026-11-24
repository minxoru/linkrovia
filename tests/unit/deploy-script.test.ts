import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const generatedPath = '.svelte-kit/cloudflare/worker/wrangler.json';
const config = {
  name: 'test-linkrovia',
  workers_dev: true,
  main: 'linkrovia.js',
  assets: { directory: '../client', binding: 'ASSETS' },
  triggers: { crons: ['15,45 * * * *'] },
  compatibility_flags: ['nodejs_compat'],
  ratelimits: [{ name: 'AUTH_LIMIT', namespace_id: '1' }],
  d1_databases: [
    {
      binding: 'DB',
      database_id: '01234567-89ab-cdef-0123-456789abcdef',
      migrations_dir: '../../../migrations',
    },
  ],
  analytics_engine_datasets: [
    { binding: 'CLICKS', dataset: 'test_clicks' },
    { binding: 'OTHER', dataset: 'test_other' },
  ],
  analytics: { binding: 'ANALYTICS_SQL' },
  vars: { LINKROVIA_CLICKS_DATASET: 'test_clicks', OTHER: 'keep me' },
  secrets: { required: ['SETUP_TOKEN'] },
};

const originalCommands = [
  ['deploy', '--config', generatedPath, '--dry-run'],
  ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', generatedPath],
  ['deploy', '--config', generatedPath],
];

const analyticsDisabled = [
  '\u001b[31mYou need to enable Analytics Engine [code: 100',
  '89]\u001b[0m\n',
];

type Command = { args: string[]; config: typeof config };
const deployedOrigin = 'https://selected-worker.example.workers.dev';
const testApi = `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/workers`;
const deployRecord = {
  type: 'deploy',
  version: 1,
  worker_name: 'selected-worker',
  version_id: 'new-version',
  targets: [deployedOrigin, 'schedule: 15,45 * * * *'],
};

type Outcome = {
  status: number;
  stderr?: string[];
  record?: typeof deployRecord | null;
};

let root: string;

function write(path: string, data: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}

function deploy(
  outcomes: Outcome[] = [],
  args: string[] = [],
  env: Record<string, string> = {},
) {
  write('outcomes.json', JSON.stringify(outcomes));
  const result = spawnSync(
    process.execPath,
    ['--import', './mock-fetch.mjs', 'scripts/deploy.mjs', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_dry_run: 'false',
        WORKERS_CI: '',
        WRANGLER_CI_OVERRIDE_NAME: 'selected-worker',
        WRANGLER_OUTPUT_FILE_PATH: '',
        WRANGLER_OUTPUT_FILE_DIRECTORY: '',
        ...env,
      },
    },
  );
  const commands: Command[] = readFileSync(join(root, 'commands.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { ...result, commands };
}

describe('deployment script', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'linkrovia-deploy-test-'));
    write('wrangler.jsonc', '{}');
    write(
      '.wrangler/deploy/config.json',
      JSON.stringify({
        configPath: `../../${generatedPath}`,
      }),
    );
    write('migrations/0001_initial.sql', 'SELECT 1;');
    write(generatedPath, JSON.stringify(config));
    mkdirSync(join(root, 'scripts'));
    copyFileSync(
      new URL('../../scripts/deploy.mjs', import.meta.url),
      join(root, 'scripts/deploy.mjs'),
    );
    copyFileSync(
      new URL('../../scripts/deploy-readiness.mjs', import.meta.url),
      join(root, 'scripts/deploy-readiness.mjs'),
    );
    copyFileSync(
      new URL('../../scripts/deploy-workers-dev.mjs', import.meta.url),
      join(root, 'scripts/deploy-workers-dev.mjs'),
    );
    write(
      'mock-fetch.mjs',
      `
      import { appendFileSync } from 'node:fs';
      let checks = 0;
      let enabled = false;
      globalThis.fetch = async (url, options) => {
        if (url.startsWith('${testApi}/')) {
          const path = url.slice('${testApi}'.length);
          appendFileSync('api.log', options.method + ' ' + path + '\\n');
          if (path === '/subdomain') {
            return Response.json({ success: true, result: { subdomain: 'example' } });
          }
          if (path === '/scripts/selected-worker/subdomain' && options.method === 'POST') {
            enabled = JSON.parse(options.body).enabled;
            return Response.json({ success: true, result: { enabled } });
          }
          if (path === '/workers/selected-worker') {
            return Response.json({ success: true, result: { subdomain: { enabled, url: '${deployedOrigin}' } } });
          }
          throw new Error('Unexpected API request ' + path);
        }
        appendFileSync('requests.log', url + '\\n');
        if (!url.startsWith('${deployedOrigin}/') || options.redirect !== 'manual') {
          throw new Error('Unexpected request ' + url);
        }
        if (url.endsWith('/health')) {
          if (++checks === 1 && process.env.TEST_DNS_PENDING) {
            throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
          }
          const headers = process.env.TEST_SETUP_STATE
            ? { 'x-linkrovia-setup': process.env.TEST_SETUP_STATE }
            : {};
          return Response.json({ status: 'ok' }, { headers });
        }
        return new Response('Setup page', { status: +(process.env.TEST_SETUP_STATUS || 200) });
      };
    `,
    );
    write(
      'node_modules/wrangler/bin/wrangler.js',
      String.raw`
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv.slice(2);
      const config = JSON.parse(fs.readFileSync(args[args.indexOf('--config') + 1], 'utf8'));
      fs.appendFileSync('commands.jsonl', JSON.stringify({ args, config }) + '\n');
      const commandIndex = fs.readFileSync('commands.jsonl', 'utf8').trim().split('\n').length - 1;
      const outcome = JSON.parse(fs.readFileSync('outcomes.json', 'utf8'))[commandIndex];
      console.log('Wrangler command ' + (commandIndex + 1));
      async function finish() {
        for (const part of outcome?.stderr ?? []) {
          process.stderr.write(part);
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        if (args[0] === 'deploy' && !args.includes('--dry-run') && (outcome?.status ?? 0) === 0) {
          let output = process.env.WRANGLER_OUTPUT_FILE_PATH;
          if (!output && process.env.WRANGLER_OUTPUT_FILE_DIRECTORY) {
            output = path.join(process.env.WRANGLER_OUTPUT_FILE_DIRECTORY, 'wrangler-output-' + commandIndex + '.json');
          }
          const defaultRecord = ${JSON.stringify(deployRecord)};
          const record = outcome?.record === undefined ? defaultRecord : outcome.record;
          if (output && record) {
            fs.mkdirSync(path.dirname(output), { recursive: true });
            fs.appendFileSync(output, JSON.stringify(record) + '\n');
          }
        }
        process.exitCode = outcome?.status ?? 0;
      }
      finish();
    `,
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('preflights, migrates, and uploads the original Worker on success', () => {
    const { status, stdout, commands } = deploy();

    expect(status).toBe(0);
    expect(commands.map(({ args }) => args)).toEqual(originalCommands);
    expect(commands.every((command) => command.config.analytics)).toBe(true);
    expect(stdout).toContain('Wrangler command 3');
    expect(stdout).toContain(
      `Open the Linkrovia setup page: ${deployedOrigin}/setup`,
    );
    expect(
      readFileSync(join(root, 'requests.log'), 'utf8').trim().split('\n'),
    ).toEqual([`${deployedOrigin}/health`, `${deployedOrigin}/setup`]);
  });

  it('only preflights on a standalone dry run', () => {
    const { status, commands } = deploy([], ['--dry-run']);

    expect(status).toBe(0);
    expect(commands.map(({ args }) => args)).toEqual([originalCommands[0]]);
  });

  it('retries the upload with only Linkrovia Analytics Engine bindings removed', () => {
    const { status, stdout, stderr, commands } = deploy([
      { status: 0 },
      { status: 0 },
      { status: 1, stderr: analyticsDisabled },
    ]);

    expect(status).toBe(0);
    expect(stdout).toContain('Wrangler command 4');
    expect(stdout).toContain(
      `Open the Linkrovia setup page: ${deployedOrigin}/setup`,
    );
    expect(stderr).toContain(analyticsDisabled.join(''));
    expect(commands).toHaveLength(4);
    expect(commands.slice(0, 3).map(({ args }) => args)).toEqual(
      originalCommands,
    );
    const retry = commands[3];
    expect(retry.args.slice(0, 2)).toEqual(['deploy', '--config']);
    expect(dirname(retry.args[2])).toBe(dirname(generatedPath));
    expect(retry.args[2]).not.toBe(generatedPath);
    expect(retry.config).toEqual({
      ...config,
      analytics: undefined,
      analytics_engine_datasets: [{ binding: 'OTHER', dataset: 'test_other' }],
      vars: { OTHER: 'keep me' },
    });
    expect(readdirSync(join(root, dirname(generatedPath)))).toEqual([
      'wrangler.json',
    ]);
    expect(readFileSync(join(root, generatedPath), 'utf8')).toBe(
      JSON.stringify(config),
    );
  });

  it('preserves the exact exit code from an unrelated upload failure', () => {
    const { status, stderr, commands } = deploy([
      { status: 0 },
      { status: 0 },
      { status: 5, stderr: ['Different failure [code: 100890]\n'] },
    ]);

    expect(status).toBe(5);
    expect(stderr).toContain('Different failure [code: 100890]');
    expect(commands).toHaveLength(3);
  });

  it('preserves a migration failure even with the Analytics Engine error code', () => {
    const { status, commands } = deploy([
      { status: 0 },
      { status: 3, stderr: analyticsDisabled },
    ]);

    expect(status).toBe(3);
    expect(commands).toHaveLength(2);
  });

  it('returns the fallback upload failure and removes its temporary config', () => {
    const { status, commands } = deploy([
      { status: 0 },
      { status: 0 },
      { status: 1, stderr: analyticsDisabled },
      { status: 9, stderr: analyticsDisabled },
    ]);

    expect(status).toBe(9);
    expect(commands).toHaveLength(4);
    expect(readdirSync(join(root, dirname(generatedPath)))).toEqual([
      'wrangler.json',
    ]);
  });

  it('allows DNS propagation before checking the HTTPS setup route', () => {
    const { status, stdout } = deploy([], [], { TEST_DNS_PENDING: '1' });

    expect(status).toBe(0);
    expect(stdout).toContain(
      `Open the Linkrovia setup page: ${deployedOrigin}/setup`,
    );
    expect(
      readFileSync(join(root, 'requests.log'), 'utf8').trim().split('\n'),
    ).toEqual([
      `${deployedOrigin}/health`,
      `${deployedOrigin}/health`,
      `${deployedOrigin}/setup`,
    ]);
  });

  it('reports a missing route even after Wrangler successfully uploads the Worker', () => {
    write('existing.ndjson', JSON.stringify(deployRecord) + '\n');
    const { status, stderr, stdout } = deploy(
      [{ status: 0 }, { status: 0 }, { status: 0, record: null }],
      [],
      { WRANGLER_OUTPUT_FILE_PATH: 'existing.ndjson' },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('Settings → Domains & Routes');
    expect(stdout).not.toContain('Open the Linkrovia setup page');
  });

  it('uses the Workers Builds output directory without replacing it', () => {
    write('existing/wrangler-output-past.json', '{}\n');
    const { status, stdout } = deploy([], [], {
      WRANGLER_OUTPUT_FILE_DIRECTORY: 'existing',
      TEST_SETUP_STATUS: '410',
    });

    expect(status).toBe(0);
    expect(stdout).toContain('Linkrovia is already set up');
    expect(readdirSync(join(root, 'existing')).sort()).toEqual([
      'wrangler-output-2.json',
      'wrangler-output-past.json',
    ]);
  });

  it('recognizes setups completed on a different management hostname', () => {
    const { status, stdout } = deploy([], [], { TEST_SETUP_STATE: 'complete' });

    expect(status).toBe(0);
    expect(stdout).toContain('Linkrovia is already set up');
    expect(readFileSync(join(root, 'requests.log'), 'utf8').trim()).toBe(
      `${deployedOrigin}/health`,
    );
  });

  it('explains how to finish setup when the deployed secret is missing or invalid', () => {
    const { status, stdout, stderr } = deploy([], [], {
      TEST_SETUP_STATE: 'token-required',
    });

    expect(status).toBe(0);
    expect(stderr).toContain('Variables and Secrets');
    expect(stderr).toContain('SETUP_TOKEN');
    expect(stdout).toContain(
      `Open the Linkrovia setup page: ${deployedOrigin}/setup`,
    );
  });

  it('allows an explicitly configured custom-domain-only deployment', () => {
    write(generatedPath, JSON.stringify({ ...config, workers_dev: false }));
    const { status, stdout } = deploy();

    expect(status).toBe(0);
    expect(stdout).not.toContain('Checking the HTTPS setup route');
  });

  it('enables the deployed Worker route and checks its API-reported setup URL even without a Wrangler target', () => {
    const { status, stdout } = deploy(
      [{ status: 0 }, { status: 0 }, { status: 0, record: null }],
      [],
      {
        WORKERS_CI: '1',
        CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
        CLOUDFLARE_API_TOKEN: 'test-deployment-token',
        CLOUDFLARE_API_BASE_URL: '',
        CF_API_BASE_URL: '',
        CLOUDFLARE_COMPLIANCE_REGION: 'public',
      },
    );

    expect(status).toBe(0);
    expect(stdout).toContain(
      `Open the Linkrovia setup page: ${deployedOrigin}/setup`,
    );
    expect(
      readFileSync(join(root, 'api.log'), 'utf8').trim().split('\n'),
    ).toEqual([
      'GET /subdomain',
      'GET /workers/selected-worker',
      'POST /scripts/selected-worker/subdomain',
      'GET /workers/selected-worker',
    ]);
  });
});
