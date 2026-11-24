import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { unstable_dev } from 'wrangler';

const redirectPath = '.wrangler/deploy/config.json';
const redirect = JSON.parse(await readFile(redirectPath, 'utf8'));
const configPath = resolve(dirname(redirectPath), redirect.configPath);
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.deepEqual(config.triggers.crons, ['15,45 * * * *']);
assert.equal(config.version_metadata?.binding, 'CF_VERSION_METADATA');
assert.equal(
  config.analytics_engine_datasets.find(({ binding }) => binding === 'CLICKS')
    ?.dataset,
  config.vars.LINKROVIA_CLICKS_DATASET,
);

const worker = await unstable_dev(join(dirname(configPath), config.main), {
  config: configPath,
  local: true,
  persist: false,
  experimental: { forceLocal: true, testScheduled: true, watch: false },
});

try {
  const manifest = await worker.fetch('/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).name, 'Linkrovia');

  const asset = await worker.fetch('/openapi.yaml');
  assert.equal(asset.status, 200);
  assert.match(await asset.text(), /^openapi:/);

  const event = new URLSearchParams({
    cron: config.triggers.crons[0],
    time: String(Date.UTC(2026, 0, 11, 4, 15)),
  });
  const scheduled = await worker.fetch(`/cdn-cgi/local/scheduled?${event}`);
  assert.equal(scheduled.status, 200);
  assert.equal(await scheduled.text(), 'ok');
} finally {
  await worker.stop();
}
