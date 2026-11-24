import { expect, test, type Page } from '@playwright/test';
import { fixtureSetupToken } from '../fixtures/setup.mjs';

async function signOut(page: Page) {
  await page.getByLabel('Account menu', { exact: true }).click();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/logout' &&
        response.request().method() === 'POST',
    ),
    page.locator('form[action="/logout"] button').click(),
  ]);
  expect(
    response.status(),
    'logout must complete before opening an invitation',
  ).toBe(303);
  await expect(page).toHaveURL('/login');
}

test('registers and signs in with a discoverable passkey', async ({
  page,
  context,
  baseURL,
}) => {
  const customOrigin = 'http://127.0.0.1:4174';
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  try {
    await page.goto('/setup');
    await page.locator('[name="setupToken"]').fill(fixtureSetupToken);
    await page.locator('form[action="?/verify"] button[type="submit"]').click();
    await expect(page.locator('#passkey-email')).toHaveCount(0);
    await page.getByRole('button', { name: 'Use this hostname' }).click();
    await expect(page.locator('#passkey-email')).toBeVisible();
    await page.locator('#passkey-email').fill('passkey-owner@example.com');
    await page
      .locator('form[action="/setup/passkey"] button[type="submit"]')
      .click();
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
    const { credentials } = await cdp.send('WebAuthn.getCredentials', {
      authenticatorId,
    });
    expect(credentials).toHaveLength(1);
    expect(credentials[0].isResidentCredential).toBe(true);
    await signOut(page);
    await expect(
      page.locator('form[action="/login/passkey"] button'),
    ).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await page
      .locator('form[action="/login/passkey"] button[type="submit"]')
      .click();
    await expect(page).toHaveURL('/admin');
    await expect(
      page.getByLabel('Account menu', { exact: true }),
    ).toBeVisible();

    await test.step('opens private operations diagnostics from settings', async () => {
      await page.goto('/admin/settings');
      await page.getByRole('link', { name: 'Operations health' }).click();
      await expect(page).toHaveURL('/admin/settings/health');
      await expect(
        page.getByRole('heading', { name: 'Operations health', level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByText('Local sample data', { exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 360, height: 800 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(360);
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    await test.step('continues with the existing passkey onto a custom admin host', async () => {
      const before = await page.goto(`${customOrigin}/login`);
      expect(before?.status()).toBe(404);
      await page.goto('/admin/domains/passkey-custom-host/connect');
      await page
        .getByRole('button', { name: 'Enable management access' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Disable management access' }),
      ).toBeVisible();
      await signOut(page);
      await page.goto(`${customOrigin}/`);
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await page.getByRole('link', { name: 'Continue securely' }).click();
      await expect(page).toHaveURL(`${baseURL}/login`);
      await page
        .locator('form[action="/login/passkey"] button[type="submit"]')
        .click();
      await expect(page).toHaveURL(`${customOrigin}/admin`);
      await expect(page.locator('.account-email')).toHaveText(
        'passkey-owner@example.com',
      );
    });

    await page.goto(`${customOrigin}/admin/settings/admins`);
    await page.locator('input[name="email"]').fill('second-admin@example.com');
    await page.locator('form[action="?/invite"] button').click();
    const inviteUrl = page.locator('#invite-url');
    await expect(inviteUrl).toHaveValue(/\/invite\/admin#[0-9a-f]{64}$/);
    const invite = await inviteUrl.inputValue();
    expect(new URL(invite).origin).toBe(baseURL);

    await page.goto('/admin');
    await signOut(page);
    await page.goto(invite);
    await expect(page).toHaveURL('/invite/admin');
    const acceptInvite = page.locator(
      'form[action="/invite/admin/passkey"] button',
    );
    await expect(acceptInvite).toBeEnabled();
    await acceptInvite.click();
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('.account-email')).toHaveText(
      'second-admin@example.com',
    );

    const denied = await page.goto('/admin/settings/admins');
    expect(denied?.status()).toBe(403);
    const healthDenied = await page.goto('/admin/settings/health');
    expect(healthDenied?.status()).toBe(403);
    await page.goto('/admin');
    await signOut(page);
    await page.goto(invite);
    await expect(page).toHaveURL('/invite/admin');
    await expect(acceptInvite).toBeEnabled();
    await acceptInvite.click();
    await expect(page.getByRole('alert')).toBeVisible();
    const registered = await cdp.send('WebAuthn.getCredentials', {
      authenticatorId,
    });
    expect(registered.credentials).toHaveLength(2);
  } finally {
    if (!page.isClosed()) {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId,
      });
      await cdp.send('WebAuthn.disable');
    }
  }
});
