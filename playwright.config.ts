import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [
    {
      name: 'password',
      testMatch: ['foundation.test.ts', 'setup.test.ts'],
      use: { baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'passkeys',
      testMatch: 'passkeys.test.ts',
      use: { baseURL: 'http://localhost:4174', browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs',
      url: 'http://127.0.0.1:4173/health',
    },
    {
      command: 'node scripts/e2e-server.mjs',
      env: { LINKROVIA_E2E_HOST: 'localhost', LINKROVIA_E2E_PORT: '4174' },
      url: 'http://localhost:4174/health',
    },
  ],
});
