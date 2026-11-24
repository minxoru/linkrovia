import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureDeploymentOutput,
  reportBootstrapUrl,
} from './deploy-readiness.mjs';
import { workersBuildRouting } from './deploy-workers-dev.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const redirectPath = resolve(root, '.wrangler/deploy/config.json');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const analyticsDisabledCode = '[code: 10089]';

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function upload(configPath, env) {
  return new Promise((resolveUpload, reject) => {
    const child = spawn(
      process.execPath,
      [wrangler, 'deploy', '--config', relative(root, configPath)],
      { cwd: root, env, stdio: ['inherit', 'inherit', 'pipe'] },
    );
    child.stderr.pipe(process.stderr, { end: false });

    let tail = '';
    let analyticsDisabled = false;
    child.stderr.on('data', (chunk) => {
      // Wrangler prints API error codes on stderr. Keep only enough to match a split code.
      if (analyticsDisabled) return;
      const output = tail + chunk.toString();
      analyticsDisabled = output.includes(analyticsDisabledCode);
      tail = output.slice(1 - analyticsDisabledCode.length);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      resolveUpload({
        status: code ?? 1,
        analyticsDisabled: code !== null && code !== 0 && analyticsDisabled,
      }),
    );
  });
}

async function uploadWithoutAnalytics(generatedPath, config, env) {
  config.analytics_engine_datasets = config.analytics_engine_datasets.filter(
    (entry) => entry.binding !== 'CLICKS',
  );
  if (config.analytics?.binding === 'ANALYTICS_SQL') delete config.analytics;
  delete config.vars.LINKROVIA_CLICKS_DATASET;

  // A sibling config keeps Wrangler's paths to the Worker, assets, and migrations valid.
  const fallbackPath = resolve(
    dirname(generatedPath),
    `.wrangler-no-analytics-${randomUUID()}.json`,
  );
  const file = openSync(fallbackPath, 'wx', 0o600);
  try {
    try {
      writeFileSync(file, JSON.stringify(config));
    } finally {
      closeSync(file);
    }
    return await upload(fallbackPath, env);
  } finally {
    rmSync(fallbackPath, { force: true });
  }
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--rollup'))
    throw new Error(
      'The application Worker now runs the scheduled jobs. Remove the legacy rollup Worker’s Cron Triggers and disconnect its build before upgrading.',
    );
  if (args.length > 1 || args.some((arg) => arg !== '--dry-run'))
    throw new Error('Usage: npm run deploy [-- --dry-run]');
  // npm consumes --dry-run if it was passed before the argument separator.
  const dryRun =
    args.includes('--dry-run') || process.env.npm_config_dry_run === 'true';

  const { configPath } = JSON.parse(readFileSync(redirectPath, 'utf8'));
  const generatedPath = resolve(dirname(redirectPath), configPath);
  if (
    generatedPath !==
    resolve(root, '.svelte-kit/cloudflare/worker/wrangler.json')
  )
    throw new Error(
      'Run npm run build to generate the production Worker configuration.',
    );
  if (
    statSync(resolve(root, 'wrangler.jsonc')).mtimeMs >
    statSync(generatedPath).mtimeMs
  )
    throw new Error(
      'wrangler.jsonc changed after the build. Run npm run build again.',
    );

  const config = JSON.parse(readFileSync(generatedPath, 'utf8'));
  if (
    !config.name ||
    config.main !== 'linkrovia.js' ||
    config.assets?.binding !== 'ASSETS' ||
    config.triggers?.crons?.length !== 1 ||
    config.triggers.crons[0] !== '15,45 * * * *'
  )
    throw new Error(
      'Run npm run build to generate the Linkrovia Worker, assets, and Cron Trigger.',
    );

  const [database] = config.d1_databases ?? [];
  if (config.d1_databases?.length !== 1 || database?.binding !== 'DB')
    throw new Error(
      'The production Worker must have a single D1 binding named DB.',
    );

  const clicks = config.analytics_engine_datasets?.find(
    (entry) => entry.binding === 'CLICKS',
  );
  if (
    !clicks?.dataset ||
    clicks.dataset === 'linkrovia_clicks_auto' ||
    clicks.dataset !== config.vars?.LINKROVIA_CLICKS_DATASET
  )
    throw new Error(
      'Run npm run build to generate matching Analytics Engine write and query bindings.',
    );

  const migrationsDir = resolve(
    dirname(generatedPath),
    database.migrations_dir ?? '',
  );
  if (
    migrationsDir !== resolve(root, 'migrations') ||
    database.migrations_pattern ||
    !readdirSync(migrationsDir, { withFileTypes: true }).some(
      (entry) => entry.isFile() && entry.name.endsWith('.sql'),
    )
  )
    throw new Error(
      'The DB binding must point to the repository SQL migrations.',
    );

  if (
    !dryRun &&
    (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(
      database.database_id,
    ) ||
      database.database_id === '00000000-0000-0000-0000-000000000000' ||
      database.database_id === '00000000-0000-4000-8000-000000000001')
  )
    throw new Error(
      'Set DB to the Cloudflare D1 database ID and run npm run build again.',
    );

  // D1 commands do not follow the adapter redirect. Pin both commands to the same build.
  const configArgs = ['--config', relative(root, generatedPath)];
  runWrangler(['deploy', ...configArgs, '--dry-run']);
  if (!dryRun) {
    runWrangler(['d1', 'migrations', 'apply', 'DB', '--remote', ...configArgs]);
    const workersDev =
      config.workers_dev ?? !(config.route || config.routes?.length);
    const output = workersDev ? captureDeploymentOutput(root) : undefined;
    const routing = workersBuildRouting(config);
    try {
      await routing?.prepare();
      let result = await upload(generatedPath, output?.env);
      if (result.analyticsDisabled) {
        console.warn(
          'Cloudflare Analytics Engine is disabled. Retrying the Worker upload without it. Enable Analytics Engine in Cloudflare and redeploy to start collecting clicks.',
        );
        result = await uploadWithoutAnalytics(
          generatedPath,
          config,
          output?.env,
        );
      }
      process.exitCode = result.status;
      if (result.status === 0 && output) {
        const worker = process.env.WRANGLER_CI_OVERRIDE_NAME || config.name;
        const published = await routing?.publish(worker);
        process.exitCode = (await reportBootstrapUrl(
          output.read(),
          worker,
          published,
        ))
          ? 0
          : 1;
      }
    } finally {
      output?.dispose?.();
    }
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Build Linkrovia with npm run build before deploying.');
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
