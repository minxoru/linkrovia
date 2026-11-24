# Backup and restore

Open **Backup** in the admin interface as the instance owner. Download a JSON file for configuration recovery or migration. The export includes settings, domains, links, tags, redirect rules, UTM templates, conversion goal definitions, and QR metadata. Destination URLs are included and their query strings may contain secrets. Store the file where only authorized operators can access it.

The JSON excludes users, sessions, passkeys, API keys, link password hashes, gate and QR tokens, provider credentials, audit logs, and analytics. The format records a schema version, export time, source instance ID, per-collection counts, and a checksum. The checksum detects file changes. Review files from other instances before restoring them.

## Restore from the admin interface

1. Select a JSON file and choose **Merge** or **Replace**.
2. Review the preview. Merge defaults to skipping collisions. Overwrite matches links by hostname and slug, tags by name, UTM templates by name, and goals by event and link. The existing app defaults are used for merge.
3. For replace, download the current configuration and confirm that you saved it. Replacement archives links, goals, and non-primary domains that are absent from the file. It applies the backed-up app defaults. The management hostname and its owner account stay available for sign-in.
4. Confirm the restore. If someone edits the configuration or redeems a one-time link after the preview, validate again. The confirmation expires after 10 minutes.

Use **Domains** on the destination instance to connect and verify imported hostnames. An existing hostname can use its current connection in that instance. Review management access separately after a restore. [Connect domains](domains.md)

Password-protected links whose local password cannot be retained are restored disabled. Set a new password before enabling them. Existing protection requirements and consumed one-time links are preserved when a link is overwritten. If the preview shows regenerated QR codes, download and distribute new images after connecting the domain.

Configuration backups support schema version 1, files up to 128 KiB, and up to 250 records across all collections, including tag assignments. Use D1 recovery for larger configurations. Each supported restore commits in a single D1 transaction. A restore failure leaves the previous configuration in place. [Cloudflare D1 batch behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

## Owner API

These endpoints use an owner session on the management host. POST requests include the same-origin `Origin` and `X-CSRF-Token` headers. Responses are marked `no-store`.

| Method | Endpoint                  | Request                                                                                                                                 |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/settings/export` | Download configuration.                                                                                                                 |
| POST   | `/api/v1/backup/export`   | Download configuration. Include `X-Backup-Manifest` to obtain a replacement download receipt in `X-Backup-Download`.                    |
| POST   | `/api/v1/backup/validate` | Send the JSON file as `application/json`. Use `mode=merge` and `conflict=skip` by default, or choose `mode=replace&conflict=overwrite`. |
| POST   | `/api/v1/backup/restore`  | Send the validated file and `X-Backup-Manifest`. For replace, include `X-Backup-Download` and `X-Backup-Confirm: replace`.              |

Validation returns a change summary and a manifest for that file, mode, owner session, and configuration revision. Successful restores return their result with link and QR ID mappings. Retrying a successful request with the same valid manifest returns the recorded result.

## D1 database recovery

For full database recovery, use Cloudflare D1 Time Travel to find a recovery point before the issue. It covers database rows including credentials. For a portable database copy, export SQL with `wrangler d1 export` and import it into an empty D1 database with `wrangler d1 execute --file`. Keep the SQL file private and verify the restored database before switching an installation to it. Cloudflare provides the commands, retention windows, and restore requirements. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) · [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
