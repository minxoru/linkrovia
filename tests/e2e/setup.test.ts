import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixtureSetupToken } from '../fixtures/setup.mjs';

test('sets up an owner, manages a short link, scopes API access, and signs out', async ({
  page,
  context,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(12_000);
  const email = 'owner@example.com';
  const password = 'a long development passphrase';
  const csvExpiry = '2099-12-31T00:15:00Z';

  const initialHealth = await request.get('/health');
  expect(initialHealth.headers()['x-linkrovia-setup']).toBe('pending');

  const crossOrigin = await request.post('/setup?/verify', {
    headers: { origin: 'https://other.example.com' },
    form: { setupToken: fixtureSetupToken },
  });
  expect(crossOrigin.status()).toBe(403);

  await page.goto('/setup');
  await page
    .locator('[name=setupToken]')
    .fill('wrong-test-setup-token-that-is-long-enough');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('[name=setupToken]')).toBeVisible();

  await page.locator('[name=setupToken]').fill(fixtureSetupToken);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('[name=email]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use this hostname' }).click();
  await expect(page.locator('[name=email]')).toBeVisible();
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await page.locator('[name=confirmPassword]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL('/login');

  const wrongHost = await request.get('/login', {
    headers: { Host: 'localhost:4173' },
    maxRedirects: 0,
  });
  expect(wrongHost.status()).toBe(404);

  const repeatedSetup = await request.get('/setup');
  expect(repeatedSetup.status()).toBe(410);
  const installedHealth = await request.get('/health');
  expect(installedHealth.headers()['x-linkrovia-setup']).toBe('complete');

  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill('a different test passphrase');
  await page.locator('form button[type=submit]').click();
  await expect(page.getByRole('alert')).toHaveText(/email|password/i);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL('/admin');

  const cookie = (await context.cookies()).find(
    ({ name }) => name === '__Host-linkrovia_session',
  );
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });

  await test.step('create a short link on the deployment hostname', async () => {
    await page.goto('/admin/links/new', { waitUntil: 'networkidle' });
    await page.locator('.link-options > summary').click();
    const redirectStatus = page.locator('select[name=status]');
    const cacheWarning = page.getByText(/may cache this redirect/);
    await expect(cacheWarning).toBeHidden();
    await redirectStatus.selectOption('301');
    await expect(cacheWarning).toBeVisible();
    await redirectStatus.selectOption('302');
    const startsAt = page.locator('input[name=startsAt]');
    await startsAt.fill('2026-01-01T10:15:00');
    await expect(page.locator('#startsAt-utc time')).toHaveAttribute(
      'datetime',
      '2026-01-01T10:15:00.000Z',
    );
    await expect(page.locator('#startFold')).toBeHidden();
    await expect(page.locator('#expiryFold')).toBeHidden();
    await startsAt.fill('');
    await page.locator('[name=slug]').fill('ci-link');
    await page
      .locator('[name=destinationUrl]')
      .fill('https://example.org/path?fixed=1#target');
    await page.locator('[name=title]').fill('A fixture link');
    await page.locator('[name=tags]').fill('fixture');
    const linkForm = page
      .locator('form')
      .filter({ has: page.locator('[name=slug]') });
    await linkForm.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/admin\/links\/[a-f0-9-]{36}$/);
    const shortUrl = new URL('/ci-link', page.url()).href;
    await expect(page.locator(`a[href="${shortUrl}"]`)).toBeVisible();

    const visit = await request.get('/ci-link?private=ignore', {
      maxRedirects: 0,
    });
    expect(visit.status()).toBe(302);
    expect(visit.headers()['location']).toBe(
      'https://example.org/path?fixed=1#target',
    );
    expect(visit.headers()['cache-control']).toBe('no-store');
    const head = await request.head('/ci-link', { maxRedirects: 0 });
    expect(head.status()).toBe(302);
    expect(await head.body()).toHaveLength(0);
    const wrongMethod = await request.post('/ci-link', {
      headers: {
        Origin: new URL(page.url()).origin,
        'content-type': 'application/json',
      },
      data: {},
      maxRedirects: 0,
    });
    expect(wrongMethod.status()).toBe(405);

    await page.goto('/admin');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText(/Previous 14 days/)).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Country', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Popular links' }),
    ).toBeVisible();
    const recentLink = page
      .getByRole('region', { name: 'Recent links' })
      .getByRole('listitem')
      .filter({ hasText: 'A fixture link' });
    await expect(recentLink.getByText('Active', { exact: true })).toBeVisible();
    await recentLink.getByRole('link', { name: /A fixture link/ }).click();
    await expect(page).toHaveURL(/\/admin\/links\/[a-f0-9-]{36}$/);
    await page.waitForLoadState('networkidle');

    await test.step('view analytics and create a conversion goal', async () => {
      const linkPage = page.url();
      const linkId = new URL(linkPage).pathname.split('/').at(-1)!;
      const detailsTabs = page.getByRole('navigation', {
        name: 'Links',
        exact: true,
      });
      await detailsTabs.getByRole('link', { name: 'Rule simulator' }).click();
      await expect(page).toHaveURL(`${linkPage}/simulate`);
      await page.getByLabel('Country code').fill('JP');
      await page.getByLabel('Region code').fill('JP-13');
      await page.getByRole('button', { name: 'Run simulation' }).click();
      const simulation = page.getByRole('region', {
        name: 'Simulation result',
      });
      await expect(simulation).toContainText(
        'The default destination applies.',
      );
      await expect(simulation.locator('code')).toHaveText(
        'https://example.org/path?fixed=1#target',
      );
      await expect(simulation.locator('a')).toHaveCount(0);
      const analyticsScripts = Promise.withResolvers<void>();
      const holdScripts: Parameters<typeof page.route>[1] = async (route) => {
        if (route.request().resourceType() === 'script') {
          await analyticsScripts.promise;
        }
        await route.continue();
      };
      const seriesSummary = page.getByText('Clicks by date table', {
        exact: true,
      });
      const seriesTable = page
        .locator('details')
        .filter({ has: seriesSummary })
        .getByRole('table');
      await page.route('**/*', holdScripts);
      try {
        await page.goto('/admin/analytics', { waitUntil: 'commit' });
        await seriesSummary.click();
        await expect(seriesTable).toBeVisible();
      } finally {
        analyticsScripts.resolve();
      }
      await page.waitForLoadState('networkidle');
      await page.unroute('**/*', holdScripts);
      await expect(seriesTable).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Analytics', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Sample data')).toBeVisible();
      await page.locator('label[for="report-filters-toggle"]').click();
      await expect(
        page
          .getByRole('combobox', { name: 'Domain', exact: true })
          .locator('option')
          .last(),
      ).toHaveText(new URL(linkPage).hostname);
      await expect(
        page.getByRole('heading', { name: 'Daily clicks' }),
      ).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(2);
      const clicks = await page.locator('.count').innerText();
      expect(Number(clicks.replaceAll(',', ''))).toBeGreaterThan(0);

      await page.getByRole('link', { name: 'Last 24 hours' }).click();
      await expect(
        page.getByRole('heading', { name: 'Hourly clicks' }),
      ).toBeVisible();
      const hourExport = await page
        .getByRole('link', { name: 'Export CSV' })
        .getAttribute('href');
      expect(hourExport).toContain('range=24h');
      const hourlyCsv = await context.request.get(hourExport!);
      expect(hourlyCsv.status()).toBe(200);
      expect(await hourlyCsv.text()).toMatch(
        /"hourly","\d{4}-\d{2}-\d{2}T\d{2}:00:00Z"/,
      );

      await page.getByRole('link', { name: 'Last 7 days' }).click();
      if (!(await page.locator('#report-filters-toggle').isChecked())) {
        await page.locator('label[for="report-filters-toggle"]').click();
      }
      await page.getByLabel('Group by').selectOption('week');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Weekly clicks' }),
      ).toBeVisible();

      await page.goto(`${linkPage}/analytics`);
      await expect(
        page.getByRole('heading', { name: 'Link analytics' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const linkTabs = page.getByRole('navigation', {
        name: 'Links',
        exact: true,
      });
      await expect(
        linkTabs.getByRole('link', { name: 'Analytics' }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(
        page.getByRole('main').getByText('A fixture link', { exact: true }),
      ).toBeVisible();
      const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
      await expect(
        breadcrumbs.getByRole('link', { name: 'Links', exact: true }),
      ).toHaveAttribute('href', '/admin/links');
      await expect(
        breadcrumbs.getByRole('link', { name: 'A fixture link' }),
      ).toHaveAttribute('href', new URL(linkPage).pathname);
      await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
        'Analytics',
      );
      await linkTabs.locator('a[href$="/qr"]').click();
      await expect(page).toHaveURL(`${linkPage}/qr`);
      await linkTabs.getByRole('link', { name: 'Analytics' }).click();
      await expect(page).toHaveURL(`${linkPage}/analytics`);
      const desktop = page.viewportSize()!;
      await page.setViewportSize({ width: 320, height: 844 });
      const linkSections = page.locator('details.mobile-sections');
      const linkMenu = linkSections.locator('summary');
      const scripts = Promise.withResolvers<void>();
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'script') await scripts.promise;
        await route.continue();
      });
      try {
        await page.goto(`${linkPage}/analytics`, { waitUntil: 'commit' });
        await expect(linkMenu).toHaveText(/Link sections\s*Analytics/);
        await linkMenu.press('Enter');
        await expect(linkSections).toHaveAttribute('open', '');
      } finally {
        scripts.resolve();
        await page.unrouteAll({ behavior: 'wait' });
      }
      await page.waitForLoadState('networkidle');
      await expect(linkSections).toHaveAttribute('open', '');
      await expect(linkTabs.locator('a[aria-current]')).toHaveCount(1);
      await linkTabs
        .getByRole('link', { name: 'Conversions', exact: true })
        .click();
      await expect(page).toHaveURL(`${linkPage}/conversions`);
      await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
        'Conversions',
      );
      await expect(linkSections).not.toHaveAttribute('open');
      await expect(linkMenu).toHaveText(/Link sections\s*Conversions/);
      await linkMenu.press('Enter');
      await expect(
        linkTabs.getByRole('link', { name: 'Conversions' }),
      ).toHaveAttribute('aria-current', 'page');
      await linkTabs
        .getByRole('link', { name: 'Analytics', exact: true })
        .click();
      await expect(page).toHaveURL(`${linkPage}/analytics`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(320);
      await expect(page.getByLabel('Group by')).toBeHidden();
      await page.locator('label[for="report-filters-toggle"]').click();
      await expect(
        page.getByRole('checkbox', { name: 'Filter', exact: true }),
      ).toBeChecked();
      await expect(page.getByLabel('Group by')).toBeVisible();
      await page.setViewportSize(desktop);
      await expect(page.getByText('No clicks for this period.')).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      const exportHref = await page
        .getByRole('link', { name: 'Export CSV' })
        .getAttribute('href');
      expect(exportHref).toContain(`/admin/links/${linkId}/analytics/export?`);
      const csv = await context.request.get(exportHref!);
      expect(csv.status()).toBe(200);
      expect(csv.headers()['content-type']).toContain('text/csv');
      const rows = (await csv.text()).trim().split('\r\n');
      expect(rows[0]).toContain('date_basis');
      expect(rows.slice(1).every((row) => row.split(',')[4] === '"0"')).toBe(
        true,
      );

      const archived = '/admin/analytics?from=2025-01-01&to=2025-01-01';
      await page.goto(`${archived}&dimension=country&source=qr`);
      await expect(page.getByRole('alert')).toContainText(
        'This date range supports one breakdown filter at a time.',
      );
      await page.getByRole('link', { name: 'Clear breakdown filters' }).click();
      await expect(
        page.getByText('Saved daily totals · UTC dates'),
      ).toBeVisible();
      await expect(page.getByRole('cell', { name: 'No data' })).toBeVisible();
      await expect(page.getByText('Sample data')).toHaveCount(0);

      await page.getByRole('link', { name: 'All saved history' }).click();
      await expect(
        page.getByRole('heading', { name: 'Monthly clicks' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Export CSV' }),
      ).toHaveAttribute('href', /range=all/);

      const reportTabs = page.getByRole('navigation', {
        name: 'Analytics',
        exact: true,
      });
      await reportTabs
        .getByRole('link', { name: 'Conversions', exact: true })
        .click();
      await expect(page).toHaveURL('/admin/analytics/conversions');
      await expect(
        page.locator('.sidebar a[href="/admin/analytics"]'),
      ).toHaveAttribute('aria-current', 'location');
      await expect(
        reportTabs.getByRole('link', { name: 'Conversions', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await reportTabs
        .getByRole('link', { name: 'Clicks', exact: true })
        .click();
      await expect(page).toHaveURL('/admin/analytics');

      await page.goto(`${linkPage}/analytics`, { waitUntil: 'networkidle' });
      await linkTabs
        .getByRole('link', { name: 'Conversions', exact: true })
        .click();
      await expect(page).toHaveURL(`${linkPage}/conversions`);
      await expect(
        page.getByRole('heading', { name: 'Conversions' }),
      ).toBeVisible();
      await expect(
        page.getByRole('main').getByText('A fixture link', { exact: true }),
      ).toBeVisible();
      await expect(
        linkTabs.getByRole('link', { name: 'Conversions', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      const legacy = await context.request.get(
        `/admin/conversions?linkId=${encodeURIComponent(linkId)}`,
        { maxRedirects: 0 },
      );
      expect(legacy.status()).toBe(303);
      expect(legacy.headers().location).toBe(
        `/admin/links/${linkId}/conversions`,
      );
      const legacyOverview = await context.request.get('/admin/conversions', {
        maxRedirects: 0,
      });
      expect(legacyOverview.status()).toBe(303);
      expect(legacyOverview.headers().location).toBe(
        '/admin/analytics/conversions',
      );
      const goal = page.locator('form[action="?/create"]');
      await goal.locator('[name=name]').fill('Purchase');
      await goal.locator('[name=eventName]').fill('purchase');
      await expect(goal.locator('[name=linkId]')).toHaveCount(0);
      await goal.getByRole('button', { name: 'Create goal' }).click();
      await expect(page).toHaveURL(`${linkPage}/conversions?saved=created`);
      await expect(page.getByRole('status')).toContainText('Changes saved.');
      await expect(
        page.getByRole('heading', { name: 'Purchase' }),
      ).toBeVisible();
      await page.goto('/admin/analytics/conversions');
      const shared = page.locator('form[action="?/create"]');
      await expect(shared.locator('[name=linkId]')).toHaveValue('');
      await shared.locator('[name=name]').fill('Shared purchase');
      await shared.locator('[name=eventName]').fill('shared_purchase');
      await shared.getByRole('button', { name: 'Create goal' }).click();
      await expect(page).toHaveURL(
        '/admin/analytics/conversions?saved=created',
      );
      await page.goto(`${linkPage}/conversions`);
      const sharedCard = page.locator('.goal-list .card').filter({
        has: page.getByRole('heading', {
          name: 'Shared purchase',
          exact: true,
        }),
      });
      await expect(
        sharedCard.getByRole('link', { name: 'All links' }),
      ).toHaveAttribute('href', '/admin/analytics/conversions');
      await expect(sharedCard.locator('form')).toHaveCount(0);
      await page.goto(linkPage, { waitUntil: 'networkidle' });
    });

    await page.locator('[name=active]').uncheck();
    const editUrl = page.url();
    const [saved] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith('?/save') &&
          response.status() === 303,
      ),
      page.waitForResponse(
        (response) =>
          response.url() === editUrl &&
          response.request().isNavigationRequest() &&
          response.request().method() === 'GET' &&
          response.ok(),
      ),
      linkForm.locator('button[type=submit]').click(),
    ]);
    expect(
      new URLSearchParams(saved.request().postData() ?? '').has('active'),
    ).toBe(false);
    await page.waitForLoadState('networkidle');
    expect((await request.get('/ci-link', { maxRedirects: 0 })).status()).toBe(
      404,
    );
    await expect(page.locator('[name=active]')).not.toBeChecked();
    await page.goto('/admin');
    await expect(
      recentLink.getByText('Inactive', { exact: true }),
    ).toBeVisible();
  });

  await test.step('searches the link list and uses its row actions', async () => {
    await page.goto('/admin/links', { waitUntil: 'networkidle' });
    const toolbar = page.getByRole('search', { name: 'Search links' });
    const expectSingleRow = async () => {
      const centers = await toolbar
        .locator('#link-search, .apply, .filter-toggle')
        .evaluateAll((controls) =>
          controls.map((control) => {
            const rect = control.getBoundingClientRect();
            return rect.top + rect.height / 2;
          }),
        );
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(4);
    };
    await expectSingleRow();
    await toolbar.getByRole('searchbox').fill('fixture link');
    await expect(toolbar.getByLabel('Sort by')).toBeHidden();
    await toolbar.locator('label[for="list-filters-toggle"]').click();
    await toolbar.getByLabel('Sort by').selectOption('created_asc');
    await toolbar.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/links\?q=fixture\+link/);
    expect(new URL(page.url()).searchParams.get('sort')).toBe('created_asc');
    await expect(toolbar.getByLabel('Sort by')).toHaveValue('created_asc');
    await expectSingleRow();
    await page.screenshot({ path: testInfo.outputPath('links-desktop.png') });
    const row = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: 'A fixture link', exact: true }),
    });
    await expect(row).toHaveCount(1);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: /Copy short URL/ }).click();
    await expect(page.getByRole('status')).toHaveText('Short URL copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL('/ci-link', page.url()).href,
    );
    await row.getByRole('link', { name: /Link analytics/ }).click();
    await expect(page).toHaveURL(/\/admin\/links\/[^/]+\/analytics$/);
  });

  await test.step('queue a missing click day as the owner', async () => {
    const analytics = '/admin/analytics?range=7d';
    await page.goto(analytics, { waitUntil: 'networkidle' });
    const panel = page.getByRole('region', {
      name: 'Restore missing click history',
    });
    await panel.locator('summary').click({ timeout: 5000 });
    const field = panel.getByLabel('UTC date');
    await expect(field).toBeVisible();
    const latestDate = await field.getAttribute('max');
    expect(latestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const date = new Date(Date.parse(latestDate!) - 13 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await field.fill(date);

    const rejected = await context.request.post(analytics, {
      form: { date },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(rejected.status()).toBe(403);

    await expect(field).toHaveValue(date);
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/admin/analytics',
      { timeout: 10_000 },
    );
    await panel
      .getByRole('button', { name: 'Request recovery' })
      .click({ timeout: 5000 });
    expect((await submitted).status()).toBe(303);
    await expect(page).toHaveURL(/\/admin\/analytics\?range=7d$/);
    await expect(panel.getByRole('status')).toContainText(`${date} · Queued`);
    await page.reload();
    await expect(panel.getByRole('status')).toContainText('Queued');
  });

  await test.step('preview and import CSV rows with partial success', async () => {
    const batchHeaders = {
      origin: new URL(page.url()).origin,
      'content-type': 'text/csv',
      'x-import-mode': 'preview',
    };
    expect(
      (
        await request.post('/admin/import/batch', {
          headers: batchHeaders,
          data: 'destination_url\nhttps://example.org',
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post('/admin/import/batch', {
          headers: batchHeaders,
          data: 'destination_url\nhttps://example.org',
        })
      ).status(),
    ).toBe(403);
    const withoutJs = await browser.newContext({
      baseURL,
      storageState: await context.storageState(),
      javaScriptEnabled: false,
    });
    try {
      const serverPage = await withoutJs.newPage();
      await serverPage.goto('/admin/import');
      await expect(serverPage.getByLabel('CSV file')).toBeDisabled();
      await expect(
        serverPage.getByRole('button', { name: 'Preview links' }),
      ).toBeDisabled();
    } finally {
      await withoutJs.close();
    }
    await page
      .locator('.sidebar')
      .getByRole('link', { name: 'CSV import', exact: true })
      .click();
    await expect(page).toHaveURL('/admin/import');
    const csvFile = page.getByLabel('CSV file');
    await expect(csvFile).toBeEnabled();
    await csvFile.setInputFiles({
      name: 'links.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `destination_url,slug,expires_at\r\nhttps://example.org/import,csv-e2e,${csvExpiry}\r\nhttp://localhost,bad-destination,\r\nhttps://example.org/duplicate,csv-e2e,`,
      ),
    });
    await page.getByLabel('Duplicate slugs').selectOption('skip');
    await page.getByRole('button', { name: 'Preview links' }).click();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    await expect(page.getByText('Skipped', { exact: true })).toBeVisible();
    await expect(page.getByText('Check the listed columns.')).toBeVisible();
    expect((await request.get('/csv-e2e', { maxRedirects: 0 })).status()).toBe(
      404,
    );

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download error CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('import-errors.csv');
    await page.getByRole('button', { name: 'Import ready rows' }).click();
    await expect(page.getByText('Imported', { exact: true })).toBeVisible();
    const visit = await request.get('/csv-e2e', { maxRedirects: 0 });
    expect(visit.status()).toBe(302);
    expect(visit.headers()['location']).toBe('https://example.org/import');
  });

  await test.step('create a QR code and redeem a password-protected one-time link', async () => {
    const destination = 'https://example.org/private-target';
    const password = 'a shared fixture password';
    await page.goto('/admin/links/new', { waitUntil: 'networkidle' });
    await page.locator('[name=slug]').fill('shared-once');
    await page.locator('[name=destinationUrl]').fill(destination);
    await page
      .locator('form')
      .filter({ has: page.locator('[name=slug]') })
      .locator('button[type=submit]')
      .click();
    await expect(page).toHaveURL(/\/admin\/links\/[a-f0-9-]{36}$/);
    const editUrl = page.url();
    const tabs = page.getByRole('navigation', { name: 'Links', exact: true });
    await expect(
      tabs.getByRole('link', { name: 'Link protection' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Link protection' }).click();
    const mode = page.locator('[name=mode]');
    await mode.selectOption('password_one_time');
    await page.locator('[name=password]').fill(password);
    await expect(mode).toHaveValue('password_one_time');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('The protection settings were saved.'),
    ).toBeVisible();

    await page.goto(editUrl);
    await expect(tabs.getByRole('link', { name: 'QR code' })).toBeVisible();
    await page.getByRole('link', { name: 'QR code' }).click();
    await page.getByRole('button', { name: 'Create QR code' }).click();
    const qrUrl = await page.getByText(/\/q\/[a-f0-9]{64}$/).textContent();
    if (!qrUrl) throw new Error('Missing QR URL');
    const qr = qrUrl.trim();
    const svgPath = await page
      .getByRole('link', { name: 'Download SVG' })
      .getAttribute('href');
    const pngPath = await page
      .getByRole('link', { name: 'Download PNG' })
      .getAttribute('href');
    if (!svgPath || !pngPath) throw new Error('Missing image download');
    const svg = await context.request.get(svgPath);
    expect(svg.headers()['content-type']).toContain('image/svg+xml');
    expect(await svg.text()).toMatch(/^<svg\b/);
    const png = await context.request.get(pngPath);
    expect(png.headers()['content-type']).toContain('image/png');
    expect((await png.body()).subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a',
    );

    const locked = await request.get(qr, { maxRedirects: 0 });
    expect(locked.status()).toBe(302);
    const gateUrl = locked.headers()['location'];
    expect(gateUrl).toMatch(/\/gate\/q-[a-f0-9]{64}$/);
    expect(locked.headers()['cache-control']).toBe('no-store');
    const visitor = await browser.newContext({ javaScriptEnabled: false });
    try {
      const gatePage = await visitor.newPage();
      await gatePage.goto(gateUrl);
      await expect(
        gatePage.getByRole('heading', { name: 'Open protected link' }),
      ).toBeVisible();
      const csrf = await gatePage.locator('[name=csrfToken]').inputValue();
      const headers = { origin: new URL(gateUrl).origin, accept: 'text/html' };
      const wrongOrigin = await visitor.request.post(gateUrl, {
        headers: { origin: 'https://other.example.com' },
        form: { csrfToken: csrf, password },
        maxRedirects: 0,
      });
      expect(wrongOrigin.status()).toBe(403);
      const wrongPassword = await visitor.request.post(gateUrl, {
        headers,
        form: { csrfToken: csrf, password: 'the wrong fixture password' },
        maxRedirects: 0,
      });
      expect(wrongPassword.status()).toBe(403);
      const accepted = await visitor.request.post(gateUrl, {
        headers,
        form: { csrfToken: csrf, password },
        maxRedirects: 0,
      });
      expect(accepted.status()).toBe(303);
      expect(accepted.headers()['location']).toBe(
        new URL(gateUrl).pathname + '?continue=1',
      );
      const unlock = (await visitor.cookies()).find(
        (cookie) => cookie.name === '__Host-linkrovia_unlock',
      );
      expect(unlock).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      });
      expect(
        (await visitor.request.head(qr, { maxRedirects: 0 })).headers()[
          'location'
        ],
      ).toBe(gateUrl);
      await gatePage.route(destination, (route) =>
        route.fulfill({ body: 'Fixture destination' }),
      );
      await gatePage.locator('[name=password]').fill(password);
      const browserPost = gatePage.waitForRequest(
        (outgoing) =>
          outgoing.method() === 'POST' && outgoing.url() === gateUrl,
      );
      await gatePage
        .getByRole('button', { name: 'Continue', exact: true })
        .click();
      expect(await (await browserPost).headerValue('origin')).toBe(
        new URL(gateUrl).origin,
      );
      await expect(gatePage).toHaveURL(destination);
    } finally {
      await visitor.close();
    }
    expect(
      (await request.get('/shared-once', { maxRedirects: 0 })).status(),
    ).toBe(410);
    expect((await request.get(qr, { maxRedirects: 0 })).status()).toBe(410);
  });

  await test.step('issue and revoke a read-only API key', async () => {
    expect((await request.get('/api/v1/links')).status()).toBe(401);
    await page.goto('/admin/api-keys', { waitUntil: 'networkidle' });
    await page.locator('[name=name]').fill('End-to-end read key');
    await page.locator('[name=scope][value="links:read"]').check();
    await page.locator('form[action="?/create"] button[type=submit]').click();

    const displayedKey = page.locator(
      'input[readonly][aria-labelledby="new-api-key"]',
    );
    await expect(displayedKey).toBeVisible();
    const token = await displayedKey.inputValue();
    const headers = { Authorization: `Bearer ${token}` };
    expect((await request.get('/api/v1/links', { headers })).status()).toBe(
      200,
    );
    expect(
      (await request.post('/api/v1/links', { headers, data: {} })).status(),
    ).toBe(403);
    await page.reload();
    await expect(displayedKey).toHaveCount(0);

    await page.locator('form[action="?/revoke"] button[type=submit]').click();
    await expect(page.locator('form[action="?/revoke"]')).toHaveCount(0);
    expect((await request.get('/api/v1/links', { headers })).status()).toBe(
      401,
    );
  });

  await test.step('serves MCP on the primary host with independent tool scopes', async () => {
    const headers = { Accept: 'application/json, text/event-stream' };
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'Linkrovia E2E', version: '1.0.0' },
      },
    };
    expect(
      (await request.post('/mcp', { headers, data: initialize })).status(),
    ).toBe(404);
    await page.goto('/admin/integrations/mcp');
    await page.getByRole('button', { name: 'Enable MCP' }).click();
    await expect(
      page.getByRole('button', { name: 'Disable MCP' }),
    ).toBeVisible();
    const cursor = page
      .locator('details')
      .filter({ has: page.getByText('Cursor', { exact: true }) });
    await cursor.getByText('Cursor', { exact: true }).click();
    await expect(cursor.locator('pre')).toContainText(
      'Bearer ${env:LINKROVIA_MCP_TOKEN}',
    );
    const gemini = page
      .locator('details')
      .filter({ has: page.getByText('Gemini CLI', { exact: true }) });
    await gemini.getByText('Gemini CLI', { exact: true }).click();
    await expect(gemini.locator('pre')).toContainText('httpUrl');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gemini.getByRole('button', { name: 'Copy configuration' }).click();
    await expect(gemini.getByRole('status')).toHaveText(
      'Configuration copied.',
    );
    expect(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
    ).toMatchObject({
      mcpServers: { linkrovia: { httpUrl: new URL('/mcp', page.url()).href } },
    });
    expect(
      (
        await context.request.post('/mcp', { headers, data: initialize })
      ).status(),
    ).toBe(401);
    await page.goto('/admin/api-keys');
    await page.locator('[name=name]').fill('MCP read key');
    await page.locator('[name=scope][value="mcp:connect"]').check();
    await page.locator('[name=scope][value="links:read"]').check();
    await page.locator('form[action="?/create"] button[type=submit]').click();
    const token = await page
      .locator('input[readonly][aria-labelledby="new-api-key"]')
      .inputValue();
    const authorizedHeaders = { ...headers, Authorization: `Bearer ${token}` };
    const rpc = (method: string, params?: unknown) =>
      request.post('/mcp', {
        headers: { ...authorizedHeaders, 'MCP-Protocol-Version': '2025-11-25' },
        data: { jsonrpc: '2.0', id: 2, method, params },
      });
    const readMessage = async (response: Awaited<ReturnType<typeof rpc>>) => {
      const body = await response.text();
      expect(response.status(), body).toBe(200);
      if (response.headers()['content-type'].includes('application/json'))
        return JSON.parse(body);
      const lines = body.split('\n');
      return JSON.parse(
        lines.find((line) => line.startsWith('data: '))!.slice(6),
      );
    };
    expect(
      (
        await request.post('/mcp', {
          headers: {
            ...authorizedHeaders,
            Origin: 'https://elsewhere.example',
          },
          data: initialize,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post('/mcp', {
          headers: { ...authorizedHeaders, Host: 'localhost:4173' },
          data: initialize,
        })
      ).status(),
    ).toBe(404);
    const initialized = await request.post('/mcp', {
      headers: authorizedHeaders,
      data: initialize,
    });
    expect(initialized.headers()['mcp-session-id']).toBeUndefined();
    expect(await readMessage(initialized)).toMatchObject({
      result: { protocolVersion: '2025-11-25' },
    });
    const tools = (await readMessage(await rpc('tools/list'))).result.tools;
    expect(tools.map(({ name }: { name: string }) => name)).toContain(
      'list_links',
    );
    expect(tools.map(({ name }: { name: string }) => name)).not.toContain(
      'create_link',
    );
    const list = await readMessage(
      await rpc('tools/call', { name: 'list_links', arguments: { limit: 1 } }),
    );
    expect(list.result.structuredContent.data).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|proofToken|keyHash/);
    const discovery = await request.post('/mcp', {
      headers: {
        ...authorizedHeaders,
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    expect((await readMessage(discovery)).result.supportedVersions).toContain(
      '2026-07-28',
    );
    const write = await readMessage(
      await rpc('tools/call', { name: 'create_link', arguments: {} }),
    );
    expect(write.error).toMatchObject({ code: -32602 });
    expect(
      (
        await request.post('/mcp', {
          headers: { ...authorizedHeaders, 'content-type': 'application/json' },
          data: '{',
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post('/mcp', {
          headers: authorizedHeaders,
          data: { padding: 'x'.repeat(263_000) },
        })
      ).status(),
    ).toBe(413);
    await page.locator('form[action="?/revoke"] button[type=submit]').click();
    await expect(page.locator('form[action="?/revoke"]')).toHaveCount(0);
    expect((await rpc('tools/list')).status()).toBe(401);

    await page.locator('[name=name]').fill('MCP write key');
    await page.locator('[name=scope][value="mcp:connect"]').check();
    await page.locator('[name=scope][value="links:write"]').check();
    await page.locator('form[action="?/create"] button[type=submit]').click();
    authorizedHeaders.Authorization =
      'Bearer ' +
      (await page
        .locator('input[readonly][aria-labelledby="new-api-key"]')
        .inputValue());
    const created = await readMessage(
      await rpc('tools/call', {
        name: 'create_link',
        arguments: {
          domainId: list.result.structuredContent.data[0].domainId,
          slug: 'mcp-fixture',
          destinationUrl: 'https://example.org/mcp',
        },
      }),
    );
    const { id, updatedAt } = created.result.structuredContent;
    expect(
      (await request.get('/mcp-fixture', { maxRedirects: 0 })).status(),
    ).toBe(302);
    const disabled = await readMessage(
      await rpc('tools/call', {
        name: 'disable_link',
        arguments: { id, updatedAt },
      }),
    );
    expect(disabled.result.structuredContent).toMatchObject({
      id,
      isActive: false,
    });
    expect(
      (await request.get('/mcp-fixture', { maxRedirects: 0 })).status(),
    ).toBe(404);
    await page.locator('form[action="?/revoke"] button[type=submit]').click();
    await expect(page.locator('form[action="?/revoke"]')).toHaveCount(0);
    await page.goto('/admin/integrations/mcp');
    await page.getByRole('button', { name: 'Disable MCP' }).click();
    await expect(
      page.getByRole('button', { name: 'Enable MCP' }),
    ).toBeVisible();
    expect((await rpc('tools/list')).status()).toBe(404);
  });

  await test.step('receives a conversion only with the scoped API key', async () => {
    const endpoint = '/api/v1/conversions/events';
    expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
    await page.goto('/admin/api-keys', { waitUntil: 'networkidle' });
    await page.locator('[name=name]').fill('Conversion sender');
    await page.locator('[name=scope][value="conversions:write"]').check();
    await page.locator('[name=scope][value="analytics:read"]').check();
    await page.locator('form[action="?/create"] button[type=submit]').click();
    const displayed = page.locator(
      'input[readonly][aria-labelledby="new-api-key"]',
    );
    await expect(displayed).toBeVisible();
    const headers = { Authorization: `Bearer ${await displayed.inputValue()}` };
    const response = await request.get('/api/v1/conversion-goals', { headers });
    expect(response.ok()).toBe(true);
    const {
      data: [goal],
    } = await response.json();
    const event = {
      goalId: goal.id,
      occurredAt: Math.floor(Date.now() / 1000),
    };
    const accepted = await request.post(endpoint, {
      headers: { ...headers, 'Idempotency-Key': 'fixture-purchase-1' },
      data: event,
    });
    expect(accepted.status()).toBe(201);
    const { receipt } = await accepted.json();
    expect(receipt.status).toBe('unattributed');
    const retry = await request.post(endpoint, {
      headers: { ...headers, 'Idempotency-Key': 'fixture-purchase-1' },
      data: event,
    });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toEqual({ receipt, duplicate: true });
    const analytics = await request.get('/api/v1/analytics/overview', {
      headers,
    });
    expect(await analytics.json()).toMatchObject({ meta: { source: 'mock' } });
  });

  await test.step('guides the owner through custom domain setup and requires a secure check', async () => {
    await page.goto('/admin/domains', { waitUntil: 'networkidle' });
    await page.locator('[name=hostname]').fill('go.example.com');
    await page.getByRole('button', { name: 'Add a domain' }).click();
    await expect(page).toHaveURL(/\/admin\/domains\/[^/]+\/connect$/);
    await expect(
      page.getByRole('heading', { name: 'Connect domain' }),
    ).toBeVisible();

    const domainId = new URL(page.url()).pathname.split('/').at(-2)!;
    const apiPath = `/api/v1/domains/${domainId}`;
    expect((await request.get(`${apiPath}/connection`)).status()).toBe(401);
    const connection = await context.request.get(`${apiPath}/connection`);
    expect(connection.status()).toBe(200);
    expect(await connection.json()).toMatchObject({
      hostname: 'go.example.com',
      status: 'draft',
    });
    expect(
      (
        await context.request.post(`${apiPath}/connect`, {
          data: { confirmed: true },
          headers: { origin: new URL(page.url()).origin },
        })
      ).status(),
    ).toBe(403);

    await page.waitForLoadState('networkidle');
    const check = page.waitForResponse(
      (response) =>
        response.url().endsWith(`${apiPath}/connect`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Check connection' }).click();
    const response = await check;
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'https_required' });
    await expect(page.getByRole('alert')).toBeVisible();

    await page.route(`${apiPath}/connect`, (route) =>
      route.fulfill({ status: 409, json: { code: 'dns_pending' } }),
    );
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Public DNS has no address for this hostname yet. Wait for DNS to update and retry.',
    );
    await page.unroute(`${apiPath}/connect`);

    const probeUrl = 'https://go.example.com/domain-verification/fixture';
    await page.route(`${apiPath}/connect`, (route) =>
      route.fulfill({ json: { url: probeUrl, ticket: 'fixture' } }),
    );
    await page.route(probeUrl, (route) => route.abort());
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'The browser could not read the verification response over HTTPS. Check that this hostname reaches your Worker and retry.',
    );
    await page.unroute(probeUrl);
    await page.unroute(`${apiPath}/connect`);

    const assignment = page.locator('form[action="?/attach"]');
    const fixtureToken = 'fixture-cloudflare-token-not-a-real-credential';
    await assignment.locator('[name=token]').fill(fixtureToken);
    await assignment.locator('[name=confirmed]').check();
    const attaching = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).search === '?/attach',
    );
    await assignment.locator('button[type=submit]').click();
    const attachment = await attaching;
    expect(attachment.status()).toBe(422);
    expect(await attachment.text()).not.toContain(fixtureToken);
    await expect(assignment.locator('[name=token]')).toHaveValue('');
    expect(
      await (await context.request.get(`${apiPath}/connection`)).json(),
    ).toMatchObject({ managed: false, status: 'failed' });
  });

  await test.step('persists the chosen theme and provides keyboard navigation at 360 px', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/admin/settings');
    const personalRegion = await page
      .locator('#personal-preferences')
      .boundingBox();
    const defaultRegion = await page
      .locator('form[action="?/defaultZone"]')
      .boundingBox();
    if (!personalRegion || !defaultRegion)
      throw new Error('Missing settings forms');
    expect(defaultRegion.x).toBe(personalRegion.x);
    expect(defaultRegion.width).toBe(personalRegion.width);
    expect(defaultRegion.y).toBeGreaterThan(
      personalRegion.y + personalRegion.height,
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
    await expect(page.getByLabel('Appearance')).toHaveValue('system');
    await page.getByLabel('Appearance').selectOption('dark');
    await page
      .locator('form[action="?/personal"]')
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(page.getByRole('status')).toHaveText('Settings saved.');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(11, 18, 32)',
    );

    if (!cookie) throw new Error('Missing authenticated session');
    const markup = await request.get('/admin/settings', {
      headers: {
        cookie:
          cookie.name + '=' + cookie.value + '; __Host-linkrovia_theme=light',
      },
    });
    expect((await markup.text()).match(/data-theme="([a-z]+)"/)?.[1]).toBe(
      'dark',
    );
    await page.reload();
    await expect(page.getByLabel('Appearance')).toHaveValue('dark');
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 360, height: 800 });
    try {
      const menu = page.getByRole('button', { name: 'Open navigation' });
      await menu.focus();
      await page.keyboard.press('Enter');
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer).not.toBeVisible();
      await expect(menu).toBeFocused();
      await menu.click();
      await drawer.getByRole('link', { name: 'Links', exact: true }).click();
      await expect(page).toHaveURL('/admin/links');
      await expect(drawer).not.toBeVisible();
      await page.waitForLoadState('networkidle');
      await menu.click();
      await expect(drawer.locator('a[aria-current]')).toHaveCount(1);
      await expect(
        drawer.getByRole('link', { name: 'Links', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Escape');
      const compactSearch = page.getByRole('search', { name: 'Search links' });
      const filterToggle = compactSearch.locator(
        'label[for="list-filters-toggle"]',
      );
      await expect(compactSearch.locator('select[name=status]')).toBeHidden();
      const compactInputs = await compactSearch
        .locator('#link-search, .apply, .filter-toggle')
        .evaluateAll((controls) =>
          controls.map((control) => control.getBoundingClientRect().top),
        );
      expect(
        Math.max(...compactInputs) - Math.min(...compactInputs),
      ).toBeLessThan(4);
      await page.screenshot({ path: testInfo.outputPath('links-mobile.png') });
      await filterToggle.click();
      await expect(
        page.getByRole('combobox', { name: 'Status', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(360);
    } finally {
      if (originalViewport) await page.setViewportSize(originalViewport);
    }
  });

  await test.step('persists the French language preference', async () => {
    await page.goto('/admin/settings', { waitUntil: 'networkidle' });
    const personal = page.locator('form[action="?/personal"]');
    await expect(personal.locator('[name=locale] option[value=fr]')).toHaveText(
      'Français',
    );
    await personal.locator('[name=locale]').selectOption('fr');
    await personal.locator('[name=timezone]').fill('Europe/Paris');
    await expect(page.locator('#user-zone-example')).toContainText(
      /(?:GMT|UTC)\+1.*(?:GMT|UTC)\+2/,
    );
    await personal.locator('button[type=submit]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(
      page
        .locator('.sidebar')
        .getByRole('link', { name: 'Paramètres', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(personal.locator('[name=locale]')).toHaveValue('fr');
    await expect(personal.locator('[name=timezone]')).toHaveValue(
      'Europe/Paris',
    );
    await expect(personal.locator('[name=theme]')).toHaveValue('dark');

    const frenchCsv = await context.request.get(
      '/admin/analytics/export?range=7d',
    );
    expect(frenchCsv.status()).toBe(200);
    expect((await frenchCsv.text()).split('\r\n')[0]).toContain('"Clics"');

    const mobile = await browser.newContext({
      baseURL,
      storageState: await context.storageState(),
      viewport: { width: 360, height: 800 },
      javaScriptEnabled: false,
    });
    try {
      const mobilePage = await mobile.newPage();
      await mobilePage.goto('/admin/settings');
      await mobilePage
        .getByRole('button', { name: 'Ouvrir la navigation' })
        .click();
      const drawer = mobilePage.getByRole('dialog');
      await expect(
        drawer.getByRole('link', { name: 'Linkrovia' }),
      ).toBeVisible();
      await expect(
        drawer.getByRole('link', { name: 'Liens', exact: true }),
      ).toBeVisible();
      await drawer
        .getByRole('button', { name: 'Fermer la navigation' })
        .click();
      await expect(drawer).not.toBeVisible();
      expect(
        await mobilePage.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(360);
    } finally {
      await mobile.close();
    }

    await page.goto('/admin/links?q=csv-e2e');
    const expiry = page.locator(
      `time[datetime="${new Date(csvExpiry).toISOString()}"]`,
    );
    await expect(expiry.locator('..')).toContainText('(Europe/Paris)');
    await expect(expiry).toContainText('déc.');
    await expect(expiry).toContainText('01:15');

    await page.goto('/admin/links/new');
    await page.locator('.link-options > summary').click();
    const start = page.locator('#startsAt');
    const startChoice = page.locator('#startFold');
    await start.fill('2026-10-25T02:30:00');
    await expect(startChoice).toBeVisible();
    await expect(startChoice.locator('option[value=earlier]')).toContainText(
      '00:30:00 UTC',
    );
    await expect(startChoice.locator('option[value=later]')).toContainText(
      '01:30:00 UTC',
    );
    await expect(page.locator('#expiryFold')).toBeHidden();
    await startChoice.selectOption('later');
    await expect(page.locator('#startsAt-utc time')).toHaveAttribute(
      'datetime',
      '2026-10-25T01:30:00.000Z',
    );
    await start.fill('2026-10-25T03:30:00');
    await expect(startChoice).toBeHidden();
    await start.fill('2026-10-25T02:30:00');
    await expect(startChoice).toHaveValue('');

    await page.goto('/admin/settings', { waitUntil: 'networkidle' });
    await personal.locator('[name=locale]').selectOption('en');
    await personal.locator('[name=timezone]').fill('');
    await personal.locator('button[type=submit]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const defaults = page.locator('form[action="?/defaultZone"]');
    async function saveDefaultLocale(locale: string) {
      await defaults.locator('[name=defaultLocale]').selectOption(locale);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith('?/defaultZone') &&
            response.status() === 303,
        ),
        defaults.locator('button[type=submit]').click(),
      ]);
      await expect(page).toHaveURL('/admin/settings?saved=global');
      await expect(defaults.locator('[name=defaultLocale]')).toHaveValue(
        locale,
      );
    }
    await saveDefaultLocale('fr');
    const guest = await request.get('/login', {
      headers: { 'accept-language': 'nl' },
    });
    expect(await guest.text()).toMatch(/<html[^>]*\blang="fr"/);
    await saveDefaultLocale('en');
  });

  await test.step('download, review, and safely replace from an owner backup', async () => {
    await page.goto('/admin/backup', { waitUntil: 'networkidle' });
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: 'Download backup', exact: true })
        .click(),
    ]);
    expect(backup.suggestedFilename()).toBe('linkrovia-backup.json');
    const path = await backup.path();
    expect(path).toBeTruthy();
    if (!path) throw new Error('Missing backup file');
    await page.getByLabel('Backup JSON file').setInputFiles(path);
    await page.getByLabel('Replace existing data').check();
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(
      page.getByRole('heading', { name: 'Restore preview' }),
    ).toBeVisible();
    const settingsExport = await context.request.get('/api/v1/settings/export');
    expect(settingsExport.ok()).toBe(true);
    expect(settingsExport.headers()['cache-control']).toContain('no-store');
    const data = await readFile(path);
    const headers = {
      origin: new URL(page.url()).origin,
      'content-type': 'application/json',
      'x-csrf-token': await page
        .locator('form[action="/logout"] input[name="csrfToken"]')
        .inputValue(),
    };
    const validation = await context.request.post(
      '/api/v1/backup/validate?mode=replace',
      { headers, data },
    );
    expect(validation.ok()).toBe(true);
    const signedPreview = await validation.json();
    const premature = await context.request.post('/api/v1/backup/restore', {
      headers: {
        ...headers,
        'x-backup-manifest': signedPreview.manifest,
      },
      data,
    });
    expect(premature.status()).toBe(409);
    expect(await premature.json()).toMatchObject({
      code: 'confirmation_required',
    });
    const restore = page.getByRole('button', { name: 'Restore data' });
    const confirmation = page.getByLabel(
      'I understand that existing data will be replaced.',
    );
    await expect(restore).toBeDisabled();
    await expect(confirmation).toBeDisabled();
    const [current] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download current backup' }).click(),
    ]);
    expect(current.suggestedFilename()).toBe('linkrovia-backup.json');
    await expect(confirmation).toBeEnabled();
    await expect(restore).toBeDisabled();
    await confirmation.check();
    await expect(restore).toBeEnabled();
    await restore.click();
    await expect(page.getByRole('status')).toHaveText('Restore completed.');
    expect((await request.get('/csv-e2e', { maxRedirects: 0 })).status()).toBe(
      302,
    );
  });

  await test.step('configures redirect rules and destination-specific campaign parameters', async () => {
    await page.goto('/admin/links/new', { waitUntil: 'networkidle' });
    const edit = page
      .locator('form')
      .filter({ has: page.locator('[name=slug]') });
    await edit.locator('[name=slug]').fill('rule-utm-check');
    await edit
      .locator('[name=destinationUrl]')
      .fill('https://example.org/default?fixed=1#section');
    await edit.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/admin\/links\/[a-f0-9-]{36}$/);
    const linkPage = page.url();
    const tabs = page.getByRole('navigation', { name: 'Links', exact: true });
    await tabs.getByRole('link', { name: 'Redirect rules' }).click();
    await expect(page).toHaveURL(`${linkPage}/rules`);
    await page.waitForLoadState('networkidle');

    const first = page.getByRole('group', { name: 'Rule 1', exact: true });
    const second = page.getByRole('group', { name: 'Rule 2', exact: true });
    for (const [group, destination] of [
      [first, 'https://example.net/japan'],
      [second, 'https://example.net/featured?fixed=1#section'],
    ] as const) {
      await page.getByRole('button', { name: 'Add rule' }).click();
      await group.getByLabel('Destination URL').fill(destination);
      await group.getByLabel('Condition type').first().selectOption('country');
      await group.getByLabel('Condition value').first().fill('JP');
      await group.getByRole('button', { name: 'Add condition' }).click();
      await group.getByLabel('Condition type').nth(1).selectOption('language');
      await group.getByLabel('Condition value').nth(1).fill('ja');
    }
    await second
      .getByRole('button', { name: 'Move up', exact: true })
      .press('Enter');
    await expect(first.getByLabel('Destination URL')).toHaveValue(
      'https://example.net/featured?fixed=1#section',
    );
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(
      page.getByText('Redirect rules saved.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(first.getByLabel('Destination URL')).toBeHidden();
    await first.getByRole('button', { name: 'Edit Rule 1' }).click();
    await expect(first.getByLabel('Destination URL')).toHaveValue(
      'https://example.net/featured?fixed=1#section',
    );
    await second.getByRole('button', { name: 'Edit Rule 2' }).click();
    await expect(first.getByLabel('Destination URL')).toBeHidden();
    await expect(second.getByLabel('Destination URL')).toHaveValue(
      'https://example.net/japan',
    );

    await tabs.getByRole('link', { name: 'Campaign parameters' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Campaign parameters' }),
    ).toBeVisible();
    const featuredTarget = page
      .locator('details[name=utm-target] > summary')
      .filter({ hasText: 'Targeting rule 1' });
    await expect(featuredTarget).toContainText(
      'https://example.net/featured?fixed=1#section',
    );
    await featuredTarget.click();
    const featured = page.getByRole('form', {
      name: 'Targeting rule 1',
      exact: true,
    });
    await featured.getByLabel('utm_source', { exact: true }).fill('newsletter');
    await featured.getByRole('button', { name: 'Preview URL' }).click();
    await expect(
      featured.getByText(
        'https://example.net/featured?fixed=1&utm_source=newsletter#section',
        { exact: true },
      ),
    ).toBeVisible();
    await featured.getByRole('button', { name: 'Save settings' }).click();
    await expect(featured.getByRole('status')).toHaveText('Settings saved.');

    await page
      .locator('details[name=utm-target] > summary')
      .filter({ hasText: 'Default destination' })
      .click();
    const fallback = page.getByRole('form', { name: 'Default destination' });
    const fallbackSource = fallback.getByLabel('utm_source', { exact: true });
    await fallbackSource.fill('general');
    const [saveDefault] = await Promise.all([
      page.waitForRequest(
        (save) => save.method() === 'POST' && save.url().endsWith('?/save'),
      ),
      fallback.getByRole('button', { name: 'Save settings' }).click(),
    ]);
    expect(
      new URLSearchParams(saveDefault.postData() ?? '').get('utm_source'),
    ).toBe('general');
    await expect(fallback.getByRole('status')).toHaveText('Settings saved.');
    await expect(fallbackSource).toHaveValue('general');
    const visit = await request.get('/rule-utm-check', {
      headers: { 'accept-language': 'fr' },
      maxRedirects: 0,
    });
    expect(visit.status()).toBe(302);
    expect(visit.headers()['location']).toBe(
      'https://example.org/default?fixed=1&utm_source=general#section',
    );

    await tabs.getByRole('link', { name: 'Rule simulator' }).click();
    await page.getByLabel('Country code').fill('JP');
    await page.getByLabel('Language tag').fill('ja');
    const [simulationRequest] = await Promise.all([
      page.waitForRequest(
        (submission) =>
          submission.method() === 'POST' &&
          submission.url().endsWith('/simulate'),
      ),
      page.getByRole('button', { name: 'Run simulation' }).click(),
    ]);
    const visitor = new URLSearchParams(simulationRequest.postData() ?? '');
    expect(visitor.get('country')).toBe('JP');
    expect(visitor.get('language')).toBe('ja');
    await expect(
      page
        .getByRole('region', { name: 'Simulation result' })
        .getByText(
          'https://example.net/featured?fixed=1&utm_source=newsletter#section',
          { exact: true },
        ),
    ).toBeVisible();
  });

  const invalidLogout = await context.request.post('/logout', {
    headers: { origin: new URL(page.url()).origin },
    form: { csrfToken: 'wrong' },
  });
  expect(invalidLogout.status()).toBe(403);

  const account = page.getByLabel('Account menu', { exact: true });
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  await account.press('Enter');
  await expect(signOut).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(signOut).toBeHidden();
  await expect(account).toBeFocused();
  await account.click();
  await signOut.click();
  await expect(page).toHaveURL('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/admin');
  await expect(page).toHaveURL('/login');
});
