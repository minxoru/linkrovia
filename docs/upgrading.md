# Upgrading Linkrovia

Your GitHub deployment copy has its own history. Follow the [upstream repository](https://github.com/enjoydarts/linkrovia) for changes and release instructions. To bring in an update, use GitHub's **Sync fork** if your copy is a fork and can be updated directly, or merge the upstream changes in a pull request. If your copy is an independent repository, track the upstream repository as a separate Git remote and bring the changes in through a pull request. Review changes before merging to the branch connected to your Worker.

1. Read the release notes and review the changes under `migrations/`. Preserve the Worker name, `DB` database ID, and any installation-specific settings in your configuration.
2. Download a Linkrovia configuration backup and record a D1 recovery point before updating. The configuration backup covers selected settings and records. D1 recovery can restore database state across a failed upgrade. [Backup and restore](backup.md)
3. Merge the update into the deployment branch. Cloudflare Workers Builds runs the configured build and deploy commands for that branch. The deploy script applies pending D1 migrations before uploading the application and halts if a migration fails.
4. After a successful build, check `/health`, sign in with an existing owner passkey, and follow an existing short link. If the dashboard uses a custom hostname, verify sign-in from that address. For a custom dashboard enabled after setup on `workers.dev`, verify the return to the custom dashboard after using the passkey on the original sign-in host. Check Analytics if you use it. [Management hostnames](domains.md#enable-admin-access-on-an-existing-custom-hostname)

## Move scheduled jobs to the application Worker

If you deployed a separate `<worker-name>-rollup` Worker, disconnect its Workers Builds repository and remove its Cron Triggers before updating the application Worker. The new deployment registers a single Cron Trigger, `15,45 * * * *`, on the application Worker and uses the same D1 database. Confirm the trigger on the updated Worker before removing the old Worker.

To continue reading an existing Analytics Engine dataset, set `analytics_engine_datasets[0].dataset` in `wrangler.jsonc` to its exact name before building. Older unmodified configurations used `linkrovia_clicks`. New installation templates use `linkrovia_clicks_auto` to select a separate dataset based on the D1 database ID.

## Database compatibility and recovery

Published migrations are append-only. Preserve previously applied migration files and their names. Plan schema changes so the previous Worker can keep serving requests while the migration runs. Breaking changes require an explicit upgrade procedure, with a backup and recovery instructions in the release notes.

If a migration fails, correct the cause before retrying. D1 rolls back the failing migration and retains earlier successful migrations. If the deployment fails after migrations finish, the previous Worker can still be active against the updated database. Review migration compatibility before rolling back the Worker. A Worker rollback changes the application version and leaves D1 at its current state. Restore D1 separately only when necessary, after accounting for writes made since the recovery point. [D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply) · [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
