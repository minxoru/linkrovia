<script lang="ts">
  import AnalyticsActivationNotice from './AnalyticsActivationNotice.svelte';
  import type { Snippet } from 'svelte';
  import type { Locale } from '$lib/i18n/locale';
  import { linkMessages } from '$lib/i18n/links';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import {
    analyticsArchiveMessages,
    analyticsMessages,
    analyticsPeriodMessages,
  } from './messages';
  import ReportChart from './ReportChart.svelte';
  import type { loadAnalyticsReport } from '$lib/server/analytics/report';
  let {
    locale,
    report,
    failed,
    base,
    filters,
    domains = [],
    linkScoped = false,
    analyticsDeferred = false,
    canConfigureAnalytics = false,
    repair,
  }: {
    locale: Locale;
    report: Awaited<ReturnType<typeof loadAnalyticsReport>> | null;
    failed: boolean | 'unsupported_archive_filters';
    base: string;
    filters: Record<string, string>;
    domains?: readonly { id: string; hostname: string }[];
    linkScoped?: boolean;
    analyticsDeferred?: boolean;
    canConfigureAnalytics?: boolean;
    repair?: Snippet;
  } = $props();
  let m = $derived(analyticsMessages(locale));
  let archive = $derived(analyticsArchiveMessages(locale));
  let periods = $derived(analyticsPeriodMessages(locale));
  let granularity = $derived(
    report?.meta.granularity ?? filters.granularity ?? 'day',
  );
  let hourly = $derived(granularity === 'hour');
  let fixedRange = $derived(hourly || filters.range === 'all');
  let showSeriesChart = $derived((report?.totalClicks ?? 0) > 0);
  let showBreakdownChart = $derived(
    showSeriesChart && Boolean(report?.breakdown.length),
  );
  let periodTitle = $derived(
    hourly
      ? periods.hourly
      : granularity === 'week'
        ? periods.weekly
        : granularity === 'month'
          ? periods.monthly
          : m.daily,
  );
  const allDimensions = [
    'country',
    'region',
    'referrer',
    'device',
    'os',
    'browser',
    'rule',
    'source',
    'traffic',
    'link',
  ] as const;
  let dimensions = $derived(
    linkScoped ? allDimensions.slice(0, -1) : allDimensions,
  );
  let exportQuery = $derived.by(() => {
    if (fixedRange) return interactiveFilters().toString();
    const params = new URLSearchParams(filters);
    params.delete('range');
    return params.toString();
  });
  let formatDay = $derived(
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
  );
  let formatHour = $derived(
    new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
      timeZone: report?.meta.timezone ?? 'UTC',
    }),
  );

  function formatBucket(date: string) {
    return hourly
      ? formatHour.format(new Date(date))
      : formatDay.format(new Date(`${date}T00:00:00Z`));
  }

  function interactiveFilters() {
    const params = new URLSearchParams(filters);
    if (params.has('range')) {
      params.delete('from');
      params.delete('to');
    }
    return params;
  }
  function presetUrl(range: string) {
    const params = new URLSearchParams(filters);
    for (const field of ['from', 'to', 'granularity']) params.delete(field);
    params.set('range', range);
    return `${base}?${params.toString()}`;
  }
  function customDatesUrl() {
    const params = new URLSearchParams(filters);
    if (params.get('range') === 'all') params.delete('from');
    params.delete('range');
    params.set('granularity', 'day');
    return `${base}?${params.toString()}`;
  }
  function filterUrl(dimension?: string, key?: string) {
    const params = interactiveFilters();
    if (dimension && key) {
      params.set('filter', dimension);
      params.set('key', key);
    } else {
      params.delete('filter');
      params.delete('key');
    }
    return `${base}?${params.toString()}`;
  }
  function clearArchiveFiltersUrl() {
    const params = interactiveFilters();
    for (const key of ['ruleId', 'source', 'filter', 'key']) params.delete(key);
    return `${base}?${params.toString()}`;
  }
  const trafficLabels = {
    en: ['Bots', 'Previews', 'Clear filter', 'All domains'],
    ja: ['ボット', 'プレビュー', '絞り込みを解除', 'すべてのドメイン'],
    'zh-CN': ['机器人', '预览', '清除筛选', '所有域名'],
    'zh-TW': ['機器人', '預覽', '清除篩選', '所有網域'],
    es: ['Robots', 'Vistas previas', 'Quitar filtro', 'Todos los dominios'],
    it: ['Bot', 'Anteprime', 'Rimuovi filtro', 'Tutti i domini'],
    fr: ['Robots', 'Aperçus', 'Effacer le filtre', 'Tous les domaines'],
  } satisfies Record<Locale, string[]>;
  let traffic = $derived(trafficLabels[locale]);
</script>

{#snippet tableDisclosure(label: string, startOpen: boolean, table: Snippet)}
  {#snippet contents()}
    <summary>{label}</summary>
    <div class="table-wrap">{@render table()}</div>
  {/snippet}
  <!-- Static markup preserves any toggle before hydration. -->
  {#if startOpen}
    <details open>{@render contents()}</details>
  {:else}
    <details>{@render contents()}</details>
  {/if}
{/snippet}

<div class="report-controls">
  <nav class="presets" aria-label={periods.range}>
    {#each Object.entries(periods.presets) as [range, label] (range)}
      <a
        href={presetUrl(range)}
        aria-current={filters.range === range ? 'true' : undefined}
      >
        {label}
      </a>
    {/each}
    {#if fixedRange}<a href={customDatesUrl()}>{periods.customDates}</a>{/if}
  </nav>
  <input
    id="report-filters-toggle"
    class="filter-toggle-control"
    type="checkbox"
    aria-controls="report-filters"
  />
  <label for="report-filters-toggle" class="filter-toggle">
    <SlidersHorizontal size={16} aria-hidden="true" />
    {linkMessages(locale).filter}
  </label>
  <form id="report-filters" method="GET" class="filters">
    {#if fixedRange}
      <input type="hidden" name="range" value={filters.range} />
    {:else}
      <label>
        {m.from}<input
          class="admin-control"
          type="date"
          name="from"
          value={filters.from}
          required
        />
      </label>
      <label>
        {m.to}<input
          class="admin-control"
          type="date"
          name="to"
          value={filters.to}
          required
        />
      </label>
      <label>
        {periods.group}<select class="admin-control" name="granularity">
          {#each Object.entries(periods.granularities) as [value, label] (value)}
            <option {value} selected={granularity === value}>{label}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label>
      {m.dimension}<select class="admin-control" name="dimension">
        {#each dimensions as dim (dim)}<option
            value={dim}
            selected={filters.dimension === dim}
          >
            {m[dim]}
          </option>{/each}
      </select>
    </label>
    <label>
      {m.source}<select class="admin-control" name="source">
        <option value="">{m.all}</option><option
          value="link"
          selected={filters.source === 'link'}
        >
          {m.link}
        </option><option value="qr" selected={filters.source === 'qr'}>
          {m.qr}
        </option>
      </select>
    </label>
    {#if !linkScoped && domains.length}
      <label>
        {m.domain}<select class="admin-control" name="domainId">
          <option value="">{traffic[3]}</option>
          {#each domains as domain (domain.id)}
            <option value={domain.id} selected={filters.domainId === domain.id}>
              {domain.hostname}
            </option>
          {/each}
        </select>
      </label>
    {:else if filters.domainId}
      <input type="hidden" name="domainId" value={filters.domainId} />
    {/if}
    {#if filters.ruleId}<input
        type="hidden"
        name="ruleId"
        value={filters.ruleId}
      />{/if}
    <input type="hidden" name="tz" value={filters.tz} />
    {#if filters.filter && filters.key}
      <input type="hidden" name="filter" value={filters.filter} />
      <input type="hidden" name="key" value={filters.key} />
    {/if}
    <button type="submit" class="admin-button admin-button-primary">
      {m.apply}
    </button>
  </form>
</div>
{#if analyticsDeferred}
  <AnalyticsActivationNotice {locale} canConfigure={canConfigureAnalytics} />
{/if}
{#if failed && !(analyticsDeferred && failed === true)}
  <p class="notice" role="alert">
    {failed === 'unsupported_archive_filters'
      ? archive.unsupportedFilters
      : m.error}
  </p>
  {#if failed === 'unsupported_archive_filters'}
    <p class="filter-links">
      <a href={clearArchiveFiltersUrl()}>{archive.clearFilters}</a>
    </p>
  {/if}
{:else if report}
  <div class="context-panel report-summary">
    <div class="report-head">
      <div class="metric">
        <span>{m.clicks}</span>
        <strong class="count">
          {report.totalClicks?.toLocaleString(locale) ?? '—'}
        </strong>
      </div>
      <a class="admin-button export" href={`${base}/export?${exportQuery}`}>
        {m.export}
      </a>
    </div>
    <p class="meta">
      {m.timezone}: {report.meta
        .timezone}{#if !hourly && report.meta.dateBasis === 'UTC' && report.meta.timezone !== 'UTC'}
        · UTC{/if}{#if report.meta.source === 'daily-rollup'}
        · {archive.dailySource}{:else if report.meta.source === 'archive-and-live'}
        · {archive.combinedSource}{:else if report.meta.source !== 'analytics-engine'}
        · {m.sample}{/if}{#if report.meta.estimated}
        · {m.estimated}{/if}{#if report.meta.gaps.length}
        · {m.incomplete}{/if}
    </p>
    {#if hourly}<p class="meta">{periods.hourlyHint}</p>{/if}
    {#if (report.meta.source === 'daily-rollup' || report.meta.source === 'archive-and-live') && filters.domainId}
      <p class="meta">{archive.domainScope}</p>
    {/if}
    {#if filters.filter && filters.key}
      <p class="filter-links">
        <span>{filters.key}</span> <a href={filterUrl()}>{traffic[2]}</a>
      </p>
    {/if}
    {#if report.totalClicks === 0 && report.meta.gaps.length === 0}<p
        class="empty"
      >
        {m.empty}
      </p>{/if}
  </div>
  <div class="report-charts">
    <section class="context-panel">
      <h2>{periodTitle}</h2>
      {#if showSeriesChart}
        <ReportChart
          kind="line"
          labels={report.series.map((row) => formatBucket(row.date))}
          values={report.series.map((row) => row.clicks)}
          label={m.clicks}
        />
      {/if}
      {#snippet seriesTable()}
        <table>
          <thead>
            <tr>
              <th scope="col">
                {granularity === 'day' ? m.date : periods.starts}
              </th><th scope="col">{m.clicks}</th>
            </tr>
          </thead><tbody>
            {#each report.series as row (row.date)}<tr>
                <th scope="row">
                  <time datetime={row.date}>
                    {formatBucket(row.date)}
                  </time>
                </th><td>
                  {row.clicks?.toLocaleString(locale) ?? archive.missing}
                </td>
              </tr>{/each}
          </tbody>
        </table>
      {/snippet}
      {@render tableDisclosure(m.seriesTable, !showSeriesChart, seriesTable)}
    </section>
    <section class="context-panel">
      <h2>{m.breakdown}</h2>
      {#if report.dimension === 'traffic'}
        <p class="filter-links">
          <a href={filterUrl('traffic', 'bot')}>{traffic[0]}</a>
          <a href={filterUrl('traffic', 'preview')}>{traffic[1]}</a>
        </p>
      {/if}
      {#if showBreakdownChart}
        <ReportChart
          kind="bar"
          labels={report.breakdown.map((row) => row.key || '—')}
          values={report.breakdown.map((row) => row.clicks)}
          label={m.clicks}
        />
      {/if}
      {#snippet breakdownTable()}
        <table>
          <thead>
            <tr>
              <th scope="col">{m.category}</th><th scope="col">{m.clicks}</th>
            </tr>
          </thead><tbody>
            {#each report.breakdown as row (row.key)}<tr>
                <th scope="row">
                  {#if row.key}<a href={filterUrl(report.dimension, row.key)}>
                      {row.key}
                    </a>{:else}—{/if}
                </th><td>
                  {row.clicks.toLocaleString(locale)}
                </td>
              </tr>{/each}
          </tbody>
        </table>
      {/snippet}
      {@render tableDisclosure(
        m.breakdownTable,
        !showBreakdownChart,
        breakdownTable,
      )}
    </section>
  </div>
{/if}

{@render repair?.()}

<style>
  h2 {
    font-size: 1.2rem;
    font-weight: 650;
    margin: 0;
  }
  .report-charts {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
    margin-top: 1rem;
  }
  .filter-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0.75rem 0;
  }
  .filter-links a,
  th a {
    color: var(--ui-link);
    text-decoration: underline;
  }
  .report-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.6rem;
    margin-bottom: 0.8rem;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .presets a {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding-inline: 0.625rem;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    color: var(--ui-link);
    font-size: 0.875rem;
  }
  .presets a[aria-current='true'] {
    background: var(--ui-accent-surface);
    font-weight: 650;
  }
  .filters {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.625rem;
    padding: 0.75rem;
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
  }
  .filter-toggle-control {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
  }
  .filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 44px;
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface);
    color: var(--ui-link);
    cursor: pointer;
  }
  .filter-toggle-control:focus-visible + .filter-toggle {
    outline: 2px solid var(--ui-focus);
    outline-offset: 3px;
  }
  .filter-toggle-control:not(:checked) ~ .filters {
    display: none;
  }
  .filters {
    margin-top: 0.625rem;
  }
  label {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--ui-focus);
    outline-offset: 2px;
  }
  .report-summary {
    margin-top: 1rem;
  }
  .report-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .metric {
    display: grid;
    gap: 0.15rem;
  }
  .metric span {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    font-weight: 650;
  }
  .count {
    font-size: clamp(2.5rem, 4vw, 3.5rem);
    letter-spacing: -0.05em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .meta {
    color: var(--ui-text-muted);
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }
  .empty {
    margin-top: 0.75rem;
  }
  .notice {
    margin-top: 1.5rem;
    color: var(--ui-text);
  }
  .table-wrap {
    overflow-x: auto;
  }
  details {
    margin-top: 0.75rem;
    border-top: 1px solid var(--ui-border);
  }
  summary {
    padding: 0.625rem 0.25rem;
    color: var(--ui-link);
    font-size: 0.875rem;
    font-weight: 650;
    cursor: pointer;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--ui-surface);
  }
  th,
  td {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--ui-border);
    text-align: start;
  }
  th {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  th:last-child,
  td {
    width: 1%;
    text-align: end;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 850px) {
    .report-charts {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 600px) {
    .filter-toggle-control {
      display: block;
      position: absolute;
      width: 1px;
      height: 1px;
      clip-path: inset(50%);
    }
    .filter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 40px;
      padding: 0.5rem 0.75rem;
      border-radius: var(--ui-radius-sm);
      background: var(--ui-accent-surface);
      color: var(--ui-link);
      cursor: pointer;
    }
    .filter-toggle-control:focus-visible + .filter-toggle {
      outline: 2px solid var(--ui-focus);
      outline-offset: 3px;
    }
    .filter-toggle-control:not(:checked) ~ .filters {
      display: none;
    }
    .filters {
      margin-top: 0.625rem;
    }
    .filters label {
      flex: 1 1 min(125px, 100%);
    }
    .filters button {
      width: 100%;
    }
  }
</style>
