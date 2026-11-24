import adapter from '@sveltejs/adapter-cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig } from 'vite';

const cloudflare = adapter({
  config: 'wrangler.jsonc',
  platformProxy: {
    configPath:
      process.env.LINKROVIA_E2E_WRANGLER_CONFIG ?? 'wrangler.local.jsonc',
    persist: process.env.LINKROVIA_E2E_WORKER_STATE
      ? { path: process.env.LINKROVIA_E2E_WORKER_STATE }
      : undefined,
    remoteBindings: false,
  },
});

export default defineConfig({
  cacheDir: process.env.LINKROVIA_E2E_VITE_CACHE,
  optimizeDeps: { exclude: ['@lucide/svelte'] },
  environments: { ssr: { optimizeDeps: { exclude: ['@lucide/svelte'] } } },
  server: {
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '.dev.vars',
        '.dev.vars.*',
        'AGENTS.override.md',
        '**/.local/**',
        '**/.wrangler/**',
      ],
    },
    watch: {
      ignored: [
        '**/.local/**',
        '**/.wrangler/**',
        '**/.svelte-kit-e2e-*/**',
        '**/test-results/**',
        '**/tests/**',
      ],
    },
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      outDir: process.env.LINKROVIA_E2E_OUT_DIR ?? '.svelte-kit',
      preprocess: vitePreprocess(),
      alias: { $lib: 'src/lib' },
      adapter: {
        ...cloudflare,
        async adapt(builder) {
          await cloudflare.adapt(builder);

          // Preserve the adapter's fetch handler, exports, and generated asset paths.
          const workerDir = join(
            builder.getBuildDirectory('cloudflare'),
            'worker',
          );
          const configPath = join(workerDir, 'wrangler.json');
          const config = JSON.parse(await readFile(configPath, 'utf8'));
          const web = JSON.stringify(`./${config.main}`);

          // The Deploy Button provisions DB before building. Scope click data to that installation.
          const clicks = config.analytics_engine_datasets?.find(
            (entry: { binding: string }) => entry.binding === 'CLICKS',
          );
          if (
            typeof clicks?.dataset !== 'string' ||
            !clicks.dataset ||
            /[^A-Za-z0-9_-]/.test(clicks.dataset)
          )
            throw new Error('Set a valid dataset name for the CLICKS binding.');
          if (clicks.dataset === 'linkrovia_clicks_auto') {
            const id = config.d1_databases?.find(
              (entry: { binding: string }) => entry.binding === 'DB',
            )?.database_id;
            if (
              typeof id !== 'string' ||
              id.length !== 36 ||
              !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
            )
              throw new Error('Set DB to the Cloudflare D1 database ID.');
            clicks.dataset = `linkrovia_clicks_${id.replaceAll('-', '').toLowerCase()}`;
          }
          config.vars = {
            ...config.vars,
            LINKROVIA_CLICKS_DATASET: clicks.dataset,
          };

          // The Cloudflare adapter disables Wrangler bundling.
          await build({
            configFile: false,
            envFile: false,
            publicDir: false,
            build: {
              outDir: workerDir,
              emptyOutDir: false,
              lib: {
                entry: fileURLToPath(
                  new URL('./workers/rollup.ts', import.meta.url),
                ),
                formats: ['es'],
                fileName: 'rollup',
              },
            },
          });
          await writeFile(
            join(workerDir, 'linkrovia.js'),
            `import web from ${web};\nimport rollup from './rollup.js';\nexport * from ${web};\nexport default { ...web, scheduled: rollup.scheduled };\n`,
          );
          config.main = 'linkrovia.js';
          await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
        },
      },
      csp: {
        mode: 'auto',
        directives: {
          'script-src': ['self', 'https://challenges.cloudflare.com'],
          'frame-src': ['https://challenges.cloudflare.com'],
          'form-action': ['self'],
          'base-uri': ['self'],
          'object-src': ['none'],
          'frame-ancestors': ['none'],
        },
      },
    }),
  ],
});
