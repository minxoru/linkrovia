import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { landingCopy } from '../../src/lib/i18n/landing';
import type { Locale } from '../../src/lib/i18n/locale';

const locales = Object.keys(landingCopy) as Locale[];

test.use({ locale: 'ja-JP' });

test('serves all supported locales without a URL prefix', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(await response?.request().headerValue('accept-language')).toMatch(
    /^ja/i,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

  for (const locale of [
    ...locales.filter((locale) => locale !== 'ja'),
    'ja',
  ] as const) {
    await page.waitForLoadState('networkidle');
    await page.locator('select[name=locale]').selectOption(locale);
    const save = page.waitForResponse(
      (response) => response.request().method() === 'POST',
    );
    await page.locator('form.landing-footer button').click();
    expect((await save).status()).toBe(303);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', {
        name: landingCopy[locale].headline.join(' '),
        level: 1,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL('/');
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

test('negotiates French from a regional browser language', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: 'fr-CA', baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      landingCopy.fr.headline.join(' '),
    );
    await page.goto('/login');
    await expect(page).toHaveURL(/\/(?:login|setup)$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  } finally {
    await context.close();
  }
});

test('renders the branded landing in all locales, two themes, and two widths', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  if (!baseURL) throw new Error('Missing test origin');
  for (const locale of locales) {
    await context.addCookies([
      { name: 'linkrovia_locale', value: locale, url: baseURL },
    ]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      landingCopy[locale].headline.join(' '),
    );
    await expect(page.locator('figcaption')).toHaveText(
      landingCopy[locale].example,
    );
    await page.evaluate(() => document.fonts.ready);

    for (const [theme, panel] of [
      ['light', 'rgb(242, 246, 247)'],
      ['dark', 'rgb(11, 18, 32)'],
    ] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await expect(page.locator('.landing-content')).toHaveCSS(
        'background-color',
        panel,
      );
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(
            () => page.evaluate(() => document.documentElement.scrollWidth),
            { message: `${locale} ${theme} at ${width} px` },
          )
          .toBe(width);
        await page.screenshot({
          path: testInfo.outputPath(`${locale}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
      if (locale === 'en' || locale === 'fr') {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(result.violations).toEqual([]);
      }
    }
  }
});

test('serves same-origin brand icons and social metadata', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute('href', /\/brand\/favicon\.svg$/);
  const openGraph = await page
    .locator('meta[property="og:image"]')
    .getAttribute('content');
  expect(openGraph).toBe(new URL('/brand/og.png', page.url()).href);
  const card = await request.get('/brand/og.png');
  const bytes = await card.body();
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toContain(
    'application/manifest+json',
  );
  expect(await manifest.json()).toMatchObject({
    name: 'Linkrovia',
    start_url: '/',
    icons: [
      { src: '/brand/icon-32.png' },
      { src: '/brand/icon-192.png' },
      { src: '/brand/icon-512.png' },
    ],
  });
});

test('the Worker can read the migrated D1 database', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok' });
});
