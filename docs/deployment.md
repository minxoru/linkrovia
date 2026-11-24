# Deploying Linkrovia

Linkrovia runs on one Cloudflare Worker with a D1 database. The Worker serves the app and runs the scheduled analytics jobs. Linkrovia is in development. Workers Builds deployment and custom-domain setup through owner passkey registration have been verified on a deployed Worker. End-to-end installation with the Deploy to Cloudflare button on a fresh account is pending verification.

## Install with Deploy to Cloudflare

1. Open [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fenjoydarts%2Flinkrovia), sign in to Cloudflare, and connect GitHub when prompted.
2. Choose the names for your repository, Worker, and new D1 database. When prompted for `SETUP_TOKEN`, generate and save a private random password of 32–512 characters. Keep `npm run build` and `npm run deploy` as the build and deploy commands.
3. When the deployment finishes, open the published HTTPS address from **Workers & Pages**. Linkrovia takes you directly to `/setup` on the first visit. The build log also shows the setup link. Follow the [browser setup steps](#set-up-the-owner-account).

When Cloudflare rejects the first upload with error `10089`, Linkrovia retries the upload without its click analytics bindings. You can finish setup and use short links, then [enable click analytics](#enable-click-analytics) on the same installation.

[How Cloudflare provisions resources for the deploy button](https://developers.cloudflare.com/workers/platform/deploy-buttons/)

### If the Worker address does not open

Linkrovia uses the Workers Builds credentials, when available, to register a `linkrovia-…` account subdomain if the account has none and to enable the new Worker's `workers.dev` route. If the build could not configure it, open **Workers & Pages** and follow the subdomain prompt. Select the Worker and check its `workers.dev` entry under **Domains**. Allow a few minutes for DNS and HTTPS, then retry the same URL. [Cloudflare workers.dev setup](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

To retry a failed build, open the existing Worker's **Deployments → View Build History** and select **Retry build**. It uses the same Worker and database. [Cloudflare build troubleshooting](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/)

### GitHub authorization errors

Check that the GitHub user you signed in with has authorized the Cloudflare Workers & Pages app and that the app is installed on the account or organization that will own the copy. GitHub lists these under **Authorized GitHub Apps** and **Installed GitHub Apps**, respectively. [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#install-and-authorize-the-app)

If the error returns immediately after authorization and there is no build log, give Cloudflare the attempt time and the destination repository and Worker names so they can investigate. To continue installing with a repository you manage, follow [Install with Workers Builds](#install-with-workers-builds).

## Install with Workers Builds

1. Create a GitHub copy of [Linkrovia](https://github.com/enjoydarts/linkrovia) that you can manage. Your copy will be connected to Cloudflare for deployments and will receive your installation's Worker and database settings.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Storage & databases → D1 SQL Database**, create a database for this installation, and copy its name and database ID. In your GitHub copy, use **Edit** on `wrangler.jsonc`. In the `d1_databases` entry, keep the binding named `DB`, set `database_name` to your database name, and add `"database_id": "YOUR-DATABASE-ID"` using the ID you copied. Keep the `migrations_dir` setting. Save the change to your deployment branch. [D1 setup](https://developers.cloudflare.com/d1/get-started/)
3. In Cloudflare, open **Workers & Pages → Create application → Import a repository** and connect your GitHub copy. Choose the same Worker name as `name` in `wrangler.jsonc` and select the deployment branch. Set **Build command** to `npm run build` and **Deploy command** to `npm run deploy`, with the repository root as the root directory. Configure the account's build API token with access to deploy the Worker and edit its D1 database. Leave automatic builds for non-production branches disabled unless you create a separate Worker and D1 database for testing. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
4. Deploy and wait for a successful build. Workers Builds reads the Node.js version from `.node-version` and the npm version from `package.json`. If the build log shows the wrong version, check that the build is running from the repository root and that its Node.js override, if any, agrees with `.node-version`. If the log says the database ID is missing, check the saved `DB` entry. If it reports a D1 permission error, check the build API token's account and D1 permissions before retrying. The deploy command checks the built package, applies pending migrations to `DB`, then uploads the Worker. [Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
5. In your Worker's **Settings → Variables and Secrets**, add a **Secret** named `SETUP_TOKEN`. Use your password manager to generate and save a private random password of 32–512 characters. Deploy the secret and keep it available for setup. The Worker requires this secret to start owner registration. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
6. Follow the [browser setup steps](#set-up-the-owner-account).

## Set up the owner account

1. Open your Worker's published HTTPS address or the setup link from the build log. Enter the `SETUP_TOKEN` you saved for this installation. If the page says the token is missing or invalid, open the same Worker's **Settings → Variables and Secrets**, add or update the **Secret**, select **Deploy**, then reload `/setup`. If the address is unavailable, follow the [Worker address steps](#if-the-worker-address-does-not-open).
2. Choose where to open your admin dashboard before registering your passkey. Select **Use this hostname** to stay on `workers.dev`. To use a custom hostname, follow the [domain connection guide](domains.md), open setup on the custom hostname, and enter the setup token again there. If the page is still waiting for HTTPS, retry from the same setup screen when Cloudflare is ready.
3. Create the owner account and register a passkey on the chosen hostname. Open a fresh browser session and confirm you can sign in there. Remove `SETUP_TOKEN` from **Variables and Secrets** after setup is complete.

## Enable click analytics

1. Open [Workers Analytics Engine](https://dash.cloudflare.com/?to=/:account/workers/analytics-engine), select the Cloudflare account that hosts Linkrovia, and enable the service.
2. In the same Worker's **Deployments**, select **View Build History**, open the latest build, and select **Retry build**. Workers Builds uses the installation's existing Worker and database. [Build history and retry](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/)
3. Open a short link and check **Link analytics**. Click collection starts with the redeployed Worker. [Cloudflare creates the dataset on its first write](https://developers.cloudflare.com/analytics/analytics-engine/get-started/).

## Keep analytics history

Under **Settings → Triggers** on the application Worker, confirm the single Cron Trigger `15,45 * * * *`. It runs daily aggregation at 03:15 UTC and reconciles recent days one at a time at minute 45 of each hour. The other minute-15 invocations skip processing. The jobs store click and conversion history in the application's D1 database. Check run outcomes in **Observability**. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

If Cloudflare reports `10072`, the account has reached its Cron Trigger limit. Linkrovia needs one slot. Check the trigger list for a retired rollup Worker before retrying. [Workers account limits](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits)

## Use and verify your deployment

- **Short links.** From the admin interface, create a link on a connected hostname and open it in a separate tab. To add another hostname for short links, follow the [domain connection guide](domains.md).
- **Analytics.** The Worker writes click events through `CLICKS` and reads reports through `ANALYTICS_SQL`. After following a test link, check its report in Linkrovia. Review the build logs and Worker bindings if reports are unavailable. Cloudflare publishes separate Free usage allowances for writes and queries. [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) · [Analytics SQL binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/analytics-sql/)
- **Turnstile.** To enable optional sign-in protection after owner setup, follow [Enable Turnstile](operations.md#enable-turnstile). The browser and Cloudflare Siteverify flow has been verified with official test keys on local Workerd. Activation with production keys on a deployed Worker is pending verification. [Cloudflare Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- **Workers Free.** Owner setup uses passkeys. Existing password accounts and password-protected links use scrypt, which can exceed the Free CPU limit. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## Command-line deployment

For an existing Cloudflare Worker and D1 database, set the Worker name and database ID in `wrangler.jsonc` as above. From the repository root, install dependencies with the pinned versions in the [development guide](development.md), authenticate Wrangler to the installation's Cloudflare account, and run the following commands.

```sh
npm run build
npm run deploy -- --dry-run
npm run deploy
```

The dry run packages the Worker and skips D1 migrations. A real deploy requires an explicit database ID, and it stops before uploading the Worker if a migration fails. Use the dashboard for the owner setup secret and follow the browser setup steps above.

The default configuration publishes the Worker on `workers.dev`. For an installation that exclusively uses a custom hostname, set `workers_dev` to `false` in `wrangler.jsonc` and open setup or management on that custom hostname. [Cloudflare route settings](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
