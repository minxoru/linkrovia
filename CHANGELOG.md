# Changelog

This changelog tracks changes during active development. See the [deployment guide](docs/deployment.md) for verified deployment paths.

## Unreleased

- Complete setup on Cloudflare accounts that have not enabled Analytics Engine yet, then enable click analytics on the same Worker.
- Verify the published HTTPS route after a deployment and direct first-time Cloudflare accounts through `workers.dev` onboarding when needed.
- Configure `workers.dev` with the available Workers Builds credentials, open setup from the published address, and explain missing database or setup token configuration on the setup page.
- Integrated saved-link navigation into the page header and matched its active state to analytics navigation.

## v0.1.0 - 2026-11-24

First public release.

- Reworked the public and owner setup screens and redesigned the admin workspace, including link configuration, reports, provisioning, and instance settings.
- Consolidated administration into a single sidebar. Saved links use navigation inside the link header, with a disclosure when space is limited.
- Added breadcrumbs and an account menu to the administration toolbar, and aligned headers, forms, and panels to shared content edges.
- Stacked instance settings in one column and standardized panel, heading, and form-action styles across administration screens.
- Put routine search, link creation, and saved-link actions first and made detailed filters and scheduling options available on demand.
- Added an owner-only operations health screen for D1, Analytics SQL, click archive gaps, conversion backlog, and the deployed Worker version.
- Extended long-range click reports with retained Analytics Engine data after the last saved UTC day.
- Fixed Cloudflare Analytics SQL errors when loading click breakdowns.
- Made redirect rules scannable with a summary and an editor for each rule.
- Generate six-character alphanumeric short paths when the slug is left blank.
- Unified administration headings, forms, actions, and tabs and aligned link search controls in a single responsive toolbar.
- Show schedule choices only when a local time occurs twice, with the UTC time for each occurrence.
- Fixed Turnstile validation on Cloudflare Workers.
- Improved custom-domain setup by giving Cloudflare assignment its own deadline and checking the live mapping when the response is inconclusive.
- Fixed domain verification on Cloudflare Workers and added separate messages for DNS, HTTPS, and server errors.
- Added owner-controlled administration on verified custom domains, with sign-in using existing passkeys.
- Fixed Cloudflare Custom Domain assignment for hostnames with existing MX or TXT records.
- Added link-list sorting by creation date in either direction and by most recently updated, with stable pagination that preserves filters.
- Added a per-link redirect-rule simulator for sample visitor context. Simulation does not redirect a visitor or record a click.
- Added per-link redirect-rule editing and reordering by drag or keyboard, with stable rule IDs for saved campaign parameters.
- Added per-destination UTM settings, template snapshots, and safe URL previews in the link detail view.
- Added permanent-redirect cache guidance and live UTC previews for link schedules.
- Added a comparison with the preceding 14 days and breakdowns by country or region, referrer, operating system, and applied rule to the dashboard.
- Added per-link reporting for shared conversion goals and localized admin CSV column headers.
- Added owner-managed administrator invitations with one-time passkey registration, invitation revocation, and administrator deactivation.
- Added owner-requested recovery for missing daily click history while source events remain available, alongside scheduled rollups and reconciliation.
- Added operational and translation-maintenance guides.
- Documented the Deploy to Cloudflare and Workers Builds installation paths.
- Documented the scoped, stateless Streamable HTTP MCP endpoint and its bearer-key requirements.
