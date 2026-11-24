# Operations

This guide describes the current self-hosted Worker. Linkrovia is in development. See [Deploying Linkrovia](deployment.md) for deployment steps and verification coverage.

## Check the installation

- As the owner, open **Settings → Operations health** for D1 connectivity and size when available, Analytics SQL connectivity, the last saved click day and recent gaps, pending conversion archive work, and the deployed Worker version. Follow the recovery link for missing click days or open the Worker's **Observability** view for scheduled failures. Click-reporting diagnostics use one bounded Analytics SQL read when you open the page. A new dataset may be unavailable until a first click is recorded.
- Open `/health` on the same hostname as the deployed Worker. `{"status":"ok"}` confirms the application can reach its D1 database. A separate redirect check confirms that links work on each connected hostname.
- Sign in to the admin console and open **Analytics**. Successful short-link redirects can continue when analytics writes fail, so verify that reports are available before relying on them. If a report is unavailable, check the query and bindings. A report can be empty when no clicks were recorded.
- Check the Worker's **Observability** view in Cloudflare for scheduled invocation failures. The configured Cron Trigger is `15,45 * * * *`. Daily aggregation runs at 03:15 UTC. The minute-45 invocations reconcile recent days and process recovery requests.
- Open a short link on its configured hostname to check its redirect separately. Linkrovia does not currently provide automated destination health checks.

The production Worker writes click events to the configured `CLICKS` Analytics Engine dataset and reads live reports through `ANALYTICS_SQL`. Confirm both bindings if analytics is unavailable. Cloudflare can report sampled aggregates. Linkrovia marks nonempty production reports as estimates. See [Analytics and conversions](analytics.md) for data windows, fields, and archive behavior.

## Invite another administrator

Sign in as the owner and go to **Settings → Administrators**. Enter the administrator's email address and copy the invitation link when it appears. Share it privately with that person. It works once and expires after 24 hours. The recipient opens it on the management hostname and registers a passkey using the invited address.

You can revoke a pending invitation or disable an administrator from the same page. Disabling an administrator also revokes their active sessions and API keys.

## Enable Turnstile

1. Sign in as the owner and open **Settings → Security**. Choose **Open Turnstile in Cloudflare** and create a **Managed** widget with pre-clearance off. Add the hostname shown on the page and any other hostname where you sign in, including the original sign-in hostname if you use a custom dashboard with existing passkeys. [Cloudflare Turnstile setup](https://developers.cloudflare.com/turnstile/get-started/) · [Hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
2. Add the widget's secret key as `TURNSTILE_SECRET_KEY` under the Worker's **Settings → Variables and Secrets**, then deploy the change. Enter the widget's public site key in Linkrovia and select **Continue to verification**. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
3. Complete the browser challenge and select **Verify and enable**. Linkrovia enables protection after Cloudflare Siteverify accepts the challenge. If verification fails, check that both keys come from the same widget and that the widget allows the hostname on the settings page, then retry. [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Keep your owner session open while testing sign-in in a separate browser session. If you change hostnames, add the new hostname to the widget before switching. To rotate the widget secret, rotate it in Cloudflare, update the Worker secret, and run **Verify and save** again. To turn off protection, choose **Disable Turnstile** from the owner session. [Rotate a Turnstile secret key](https://developers.cloudflare.com/turnstile/troubleshooting/rotate-secret-key/)

## Recover missing click history

The owner can request a completed UTC day from **Analytics → Restore missing click history**. The panel lists known gaps in the still-retained live data window and shows the latest request state. A saved day with zero clicks is complete and does not need repair.

Only one missing day may be requested per 24 hours. The scheduled Worker processes at most one click repair per hourly run, prioritizes repairs over automatic reconciliation, and retries an unsuccessful request up to three total attempts while the source events remain available. Refresh Analytics to see updated state. A gap that is older than Analytics Engine's retention cannot be reconstructed by this feature and remains visible in archived reports.

## Protect and restore data

Use **Backup** to export a portable configuration before a risky change or migration. Store the file privately because destination URLs may contain sensitive query values. Follow [Backup and restore](backup.md) for preview, merge, replace, and restore details.

For full database recovery, use Cloudflare D1 Time Travel or a private SQL export. Those methods include authentication records, so restrict access to the export and verify the recovered database before switching traffic. Use D1 recovery to restore database state, including accounts and analytics history.

Before deploying an update, review the [upgrade guide](upgrading.md) and retain a recovery point. After deploying, check `/health`, owner sign-in, an existing short link, and its analytics report.

## MCP access

MCP uses stateless Streamable HTTP. Every request carries a bearer API key. Grant only the `mcp:connect` and tool scopes the client needs. Revoke the client's key under **API keys** to disconnect it, or disable MCP to disconnect all clients. See [Connect an MCP client](mcp.md) for supported tools and configuration.
