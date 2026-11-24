import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

function readSince(path, offset = 0) {
  if (!statSync(path, { throwIfNoEntry: false })) return '';
  return readFileSync(path).subarray(offset).toString();
}

function listOutputFiles(directory) {
  if (!statSync(directory, { throwIfNoEntry: false })) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^wrangler-output-.*\.json$/.test(entry.name),
    )
    .map((entry) => entry.name);
}

export function captureDeploymentOutput(root) {
  const file = process.env.WRANGLER_OUTPUT_FILE_PATH;
  if (file) {
    const path = resolve(root, file);
    const offset = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
    return { env: process.env, read: () => readSince(path, offset) };
  }

  const directory = process.env.WRANGLER_OUTPUT_FILE_DIRECTORY;
  if (directory) {
    const path = resolve(root, directory);
    const oldFiles = new Set(listOutputFiles(path));
    return {
      env: process.env,
      read: () =>
        listOutputFiles(path)
          .filter((name) => !oldFiles.has(name))
          .map((name) => readSince(join(path, name)))
          .join('\n'),
    };
  }

  const temporary = mkdtempSync(join(tmpdir(), 'linkrovia-deploy-'));
  const path = join(temporary, 'output.ndjson');
  return {
    env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: path },
    read: () => readSince(path),
    dispose: () => rmSync(temporary, { recursive: true, force: true }),
  };
}

function publishedOrigin(target, workerName) {
  if (typeof target !== 'string') return;
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const match = new RegExp(
    `^https://(${label})\\.${label}(?:\\.fed)?\\.workers\\.dev/?$`,
    'i',
  ).exec(target);
  if (match?.[1].toLowerCase() === workerName.toLowerCase())
    return target.replace(/\/$/, '');
}

function workersDevOrigin(output, workerName) {
  const worker = workerName.toLowerCase();
  for (const line of output.trim().split('\n').reverse()) {
    if (!line.trim()) continue;
    let result;
    try {
      result = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      result?.type !== 'deploy' ||
      typeof result.worker_name !== 'string' ||
      result.worker_name.toLowerCase() !== worker ||
      !result.version_id ||
      !Array.isArray(result.targets)
    )
      continue;

    for (const target of result.targets) {
      const origin = publishedOrigin(target, worker);
      if (origin) return origin;
    }
    return null;
  }
  return null;
}

function fetchRoute(url) {
  return fetch(url, {
    headers: {
      'user-agent':
        'Linkrovia deployment check (+https://github.com/enjoydarts/linkrovia)',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  });
}

function isAccessLogin(response) {
  if (response.status < 300 || response.status >= 400) return false;
  return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//i.test(
    response.headers.get('location') ?? '',
  );
}

async function checkBootstrap(origin) {
  const health = await fetchRoute(`${origin}/health`);
  if (!health.ok) {
    await health.body?.cancel();
    if (isAccessLogin(health)) return 'access';
    throw new Error(`/health returned HTTP ${health.status}`);
  }
  if ((await health.json())?.status !== 'ok') {
    throw new Error('/health did not return Linkrovia readiness');
  }
  const setupState = health.headers.get('x-linkrovia-setup');
  if (setupState === 'complete') return 'installed';

  const setup = await fetchRoute(`${origin}/setup`);
  await setup.body?.cancel();
  if (isAccessLogin(setup)) return 'access';
  if (setup.status === 410) return 'installed';
  if (setup.status === 200)
    return setupState === 'token-required' ? 'token-required' : 'ready';
  throw new Error(`/setup returned HTTP ${setup.status}`);
}

const routeHelp =
  'In Cloudflare, open Workers & Pages and check Your subdomain. Then open this Worker’s Settings → Domains & Routes and enable its workers.dev address.';

export async function reportBootstrapUrl(output, workerName, published) {
  const origin =
    publishedOrigin(published, workerName) ??
    workersDevOrigin(output, workerName);
  if (!origin) {
    console.error(
      `Worker upload finished, but Wrangler did not report a workers.dev URL. ${routeHelp}`,
    );
    return false;
  }

  console.log(`Checking the HTTPS setup route at ${origin}/setup…`);
  let lastError;
  for (const delay of [0, 2, 4, 8, 15, 15, 15, 15]) {
    if (delay) await setTimeout(delay * 1_000);
    let state;
    try {
      state = await checkBootstrap(origin);
    } catch (error) {
      lastError = error.cause?.code ?? error.message;
      continue;
    }
    if (state === 'access') {
      console.log(
        `Cloudflare Access requires sign-in for ${origin}/setup. Open the URL in your browser to continue.`,
      );
    } else if (state === 'installed') {
      console.log(
        `Linkrovia is already set up. Open the management hostname you selected during setup.`,
      );
    } else {
      if (state === 'token-required') {
        console.warn(
          'Initial setup needs a valid SETUP_TOKEN. In the Worker’s Settings → Variables and Secrets, set it as a Secret with 32 to 512 characters and deploy the change.',
        );
      }
      console.log(`Open the Linkrovia setup page: ${origin}/setup`);
    }
    return true;
  }
  console.error(
    `The Worker was uploaded, but ${origin}/setup could not be verified (${lastError}). ${routeHelp} DNS and HTTPS may take a few minutes. Use the same Worker and try the address again before retrying the build.`,
  );
  return false;
}
