# Analytics and conversions

Click collection starts on the first redirect served by a Worker with Analytics Engine enabled. If deployment deferred analytics, short links work while you [enable click analytics](deployment.md#enable-click-analytics). Collection begins after the same Worker is redeployed. Open **Analytics** in the admin console to see daily charts and traffic breakdowns. Open a link and choose **Link analytics** for charts and CSV downloads for that link. The charts, tables, and CSV use the selected filters. Choose dates in the effective account time zone. The default report covers the last 14 calendar days, and live click reports are limited to the most recent three months and at most 90 days per request.

The local development server uses labeled sample analytics. The production build derives the Analytics Engine dataset name from the installation's D1 database ID. The deployed Worker writes through `CLICKS` and queries through `ANALYTICS_SQL`. After deploying, follow a new short link and check its report to confirm that the write and query bindings work. The dashboard shows when the analytics provider is unavailable. [Cloudflare Analytics SQL binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/analytics-sql/)

Linkrovia records successful redirect requests. It excludes HEAD requests, explicit prefetches, and the password screen. The deployed dataset records categorical device, browser, country and region information and the referrer hostname. It omits IP addresses, full user-agent strings, URL paths and queries, and conversion references. Known bot and preview clients are excluded from ordinary totals and can be inspected under **Traffic type**. Cloudflare applies sampling weights to aggregates. Nonempty production reports are marked as estimates because the binding does not return a sampling indicator. [Cloudflare datasets and sampling](https://developers.cloudflare.com/analytics/sql-api/datasets/#workers-analytics-engine-datasets)

The [scheduled Worker](deployment.md#keep-analytics-history) saves daily UTC click totals. A report that extends beyond the live data window uses saved totals through the latest saved day in the range, then reads the remaining retained days from Analytics Engine. Each UTC day comes from one source. The current day can contain partial results. Reports mark days with missing data as gaps and show zero for a successful day with no clicks. If Analytics Engine is unavailable or the breakdown exceeds the merge limit of 1,000 categories per source, the report shows saved totals with gaps for unsaved days.

Custom dates support up to 366 days. Choose **All saved history** for monthly UTC totals from the first saved day through yesterday. The archive supports a single breakdown filter on its matching dimension. Domain reports group saved link totals using each link's current domain. Charts and tables identify the UTC date basis, CSV shows gaps as empty click counts, and combined reports use `archive-and-live` as their data source.

## Recover missing click history

An owner can open **Restore missing click history** on the **Analytics** page and request a completed UTC day within the live retention window. The recovery panel shows eligible gaps from the known daily history and the status of the latest request. You can request one missing day per 24 hours. A saved day with zero clicks requires no recovery.

The scheduled Worker checks the queue hourly and handles at most one click rollup per hourly run. Hourly runs prioritize pending recovery requests over automatic seven-day reconciliation. An unsuccessful request is retried up to two more times while the full day is available. Refresh Analytics to see the current status. When Analytics Engine no longer retains all events for that day, the gap stays visible in archive reports.

## Click reports API

Use an API key with `analytics:read`. Use `from` and `to` as inclusive `YYYY-MM-DD` dates or choose a `range` preset (`24h`, `7d`, `30d`, `90d`, `1y`, or `all`). Set `granularity` to `day`, `week`, or `month` for date ranges. Weeks begin on Monday. The year preset ends yesterday and uses monthly UTC archive buckets by default. The rolling `24h` preset uses `hour` granularity and returns UTC timestamps. The `all` preset uses monthly UTC archive buckets. Pass an IANA `tz` to query recent calendar dates or display hourly charts in that time zone. API requests default to UTC. Set `dimension` to `country`, `region`, `referrer`, `device`, `os`, `browser`, `rule`, `source`, `traffic`, or `link`. Optional `domainId`, `ruleId`, and `source=link|qr` narrow a query. To select a category, send its `filter` dimension and `key` value together. For CSV, use `bom=1` to add a UTF-8 BOM.

| Method | Endpoint                          |
| ------ | --------------------------------- |
| GET    | `/api/v1/analytics/overview`      |
| GET    | `/api/v1/links/:id/analytics`     |
| GET    | `/api/v1/links/:id/analytics.csv` |

The CSV identifies each row as `hourly`, `daily`, `weekly`, `monthly`, or `breakdown` and includes the granularity, time zone, date basis, estimate flag, and data source. Downloads from the admin console use your interface language for column headers. The REST API uses stable field names and values for scripts.

## Conversion setup

Open **Analytics → Conversions** for the account-wide report and shared goals. A link's **Conversions** tab shows goals assigned to that link, the link's attributed results for shared goals, and its tracking setting. Manage shared goals in the account-wide report.

1. Create a goal, such as `purchase`. In the account-wide view, pick a link or apply the goal to all tracked links. The event identifier and link define that goal's historical identity. Create a new goal when either changes.
2. For attribution, enable tracking in the link's **Conversions** tab. This applies to temporary redirects. Linkrovia adds a short-lived `cl_ref` query value to the destination. Treat it as sensitive and retain it on your server. Changes to a link destination or redirect rules, and restores that overwrite a link, clear the tracking opt-in.
3. Have your server submit the event with a `conversions:write` API key. Store the key on your server. Choose a stable `Idempotency-Key` for the event and reuse it on retry. Send only the defined fields and pass `clickRef` if it is available.

```http
POST /api/v1/conversions/events
Authorization: Bearer <server-api-key>
Content-Type: application/json
Idempotency-Key: <stable-event-identifier>
```

```json
{
  "goalId": "<goal-id>",
  "occurredAt": "<UTC timestamp>",
  "clickRef": "<optional-cl_ref>"
}
```

An event without a click reference is counted as unattributed. A valid reference can be counted once for each eligible goal, and duplicate submissions with the same key return their existing receipt. An invalid, expired, or already attributed reference is rejected. The report shows received events by event date and conversion rate by recorded click cohort. The rate appears after that cohort's attribution windows close. Goal listing and conversion reports use `analytics:read`. Goal creation, update, and archive use `conversions:manage`.

| Method        | Endpoint                        |
| ------------- | ------------------------------- |
| GET, POST     | `/api/v1/conversion-goals`      |
| PATCH, DELETE | `/api/v1/conversion-goals/:id`  |
| GET           | `/api/v1/conversions/analytics` |

The conversion report accepts `from`, `to`, and `tz` for a range of up to 30 calendar days. The scheduled Worker retains receipts for at least 30 days to deduplicate retries, then stores daily event and click-cohort totals in UTC in D1. Older reports use UTC dates. Where the selected local dates clip an already archived UTC day, the report excludes that day and marks `partialUtcDays` for the affected goals. The response includes its `dateBasis`. When older shared-goal totals lack per-link click cohorts, the per-link report shows recorded attributed events and leaves eligible clicks and the rate unavailable for the affected period.
