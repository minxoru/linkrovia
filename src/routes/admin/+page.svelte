<script lang="ts">
  import { brand } from '$lib/brand';
  import AnalyticsActivationNotice from '$lib/components/analytics/AnalyticsActivationNotice.svelte';
  import ReportChart from '$lib/components/analytics/ReportChart.svelte';
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import Plus from '@lucide/svelte/icons/plus';
  import { messagesFor } from '$lib/i18n/locale';
  import { linkMessages } from '$lib/i18n/links';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  let messages = $derived(messagesFor(data.locale));
  let links = $derived(linkMessages(data.locale));
  let analytics = $derived(analyticsMessages(data.locale));
  const dashboardLabels = {
    en: [
      'Last 14 days',
      'Popular links',
      'Analytics unavailable',
      'Analytics data may be delayed',
      'View analytics',
    ],
    ja: [
      '過去14日間',
      '人気のリンク',
      '解析データを取得できません',
      '解析データの反映には時間がかかる場合があります',
      'アクセス解析を見る',
    ],
    'zh-CN': [
      '过去 14 天',
      '热门链接',
      '无法获取分析数据',
      '分析数据可能延迟',
      '查看数据分析',
    ],
    'zh-TW': [
      '過去 14 天',
      '熱門連結',
      '無法取得分析資料',
      '分析資料可能延遲',
      '查看數據分析',
    ],
    es: [
      'Últimos 14 días',
      'Enlaces populares',
      'Analítica no disponible',
      'Los datos pueden tardar en aparecer',
      'Ver analítica',
    ],
    it: [
      'Ultimi 14 giorni',
      'Link più popolari',
      'Analisi non disponibili',
      'I dati potrebbero essere aggiornati in ritardo',
      'Visualizza analisi',
    ],
    fr: [
      '14 derniers jours',
      'Liens populaires',
      'Analyses indisponibles',
      'Les données peuvent apparaître avec un délai',
      'Voir les analyses',
    ],
  } as const;
  let labels = $derived(dashboardLabels[data.locale]);
  const comparisonLabels = {
    en: ['Previous 14 days', 'Comparison unavailable'],
    ja: ['前の14日間', '比較データを取得できません'],
    'zh-CN': ['前 14 天', '无法获取比较数据'],
    'zh-TW': ['前 14 天', '無法取得比較資料'],
    es: ['14 días anteriores', 'Comparación no disponible'],
    it: ['14 giorni precedenti', 'Confronto non disponibile'],
    fr: ['14 jours précédents', 'Comparaison indisponible'],
  } as const;
  let comparison = $derived(comparisonLabels[data.locale]);
</script>

<svelte:head>
  <title>{messages['admin.overview']} · {brand.name}</title>
</svelte:head>
<div class="admin-page">
  <header class="workspace-intro">
    <h1>{messages['admin.overview']}</h1>
    <a href="/admin/links/new" class="admin-button admin-button-primary">
      <Plus size={17} aria-hidden="true" />{links.create}
    </a>
  </header>
  {#if data.report}
    <section
      class="context-panel overview-metric"
      aria-labelledby="overview-clicks"
    >
      <div class="metric-value">
        <div class="admin-section-header">
          <h2 id="overview-clicks">{analytics.clicks} · {labels[0]}</h2>
        </div>
        <strong>
          {data.report.totalClicks?.toLocaleString(data.locale) ?? '—'}
        </strong>
      </div>
      <div class="metric-period">
        <span>{data.report.meta.from} – {data.report.meta.to}</span>
        <span>
          {comparison[0]}: {#if data.previous}{data.previous.total.toLocaleString(
              data.locale,
            )}{#if data.previous.estimated}
              · {analytics.estimated}{/if}{:else}{comparison[1]}{/if}
        </span>
      </div>
    </section>
  {/if}
  <div class="dashboard-content">
    {#if data.analyticsDeferred}
      <AnalyticsActivationNotice
        locale={data.locale}
        canConfigure={data.user.role === 'owner'}
      />
    {:else}
      <section class="context-panel" aria-labelledby="analytics-heading">
        <div class="admin-section-header section-heading">
          <h2 id="analytics-heading">{analytics.title}</h2>
          <a href="/admin/analytics">
            {labels[4]} <span aria-hidden="true">→</span>
          </a>
        </div>
        {#if data.report}
          <div class="chart-heading">
            <h3>{analytics.daily}</h3>
            <span>
              {analytics.timezone}: {data.report.meta
                .timezone}{#if data.report.meta.dateBasis === 'UTC' && data.report.meta.timezone !== 'UTC'}
                · UTC{/if}
            </span>
          </div>
          <ReportChart
            kind="line"
            labels={data.report.series.map((row) => row.date)}
            values={data.report.series.map((row) => row.clicks)}
            label={analytics.clicks}
          />
          <div class="chart-footer">
            <p>
              {data.report.meta.source === 'analytics-engine'
                ? labels[3]
                : analytics.sample}{#if data.report.meta.estimated}
                · {analytics.estimated}{/if}
            </p>
            <details>
              <summary>{analytics.daily}</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{analytics.date}</th><th scope="col">
                      {analytics.clicks}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.report.series as row (row.date)}
                    <tr>
                      <th scope="row">{row.date}</th><td>
                        {row.clicks?.toLocaleString(data.locale) ?? '—'}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </details>
          </div>
        {:else}
          <p class="empty" role="status">
            {labels[2]} · <a href="/admin/analytics">{labels[4]}</a>
          </p>
        {/if}
      </section>
    {/if}
    <div class="link-cards">
      <section
        class="context-panel link-card recent"
        aria-labelledby="recent-links"
      >
        <div class="admin-section-header section-heading">
          <h2 id="recent-links">{messages['admin.recent']}</h2>
          <a href="/admin/links">
            {links.links} <span aria-hidden="true">→</span>
          </a>
        </div>
        {#if data.recentLinks.length}
          <ul>
            {#each data.recentLinks as link (link.id)}
              <li>
                <a class="recent-item" href={`/admin/links/${link.id}`}>
                  {#if link.title}<strong>{link.title}</strong>{/if}
                  <span>{link.shortUrl.replace(/^https?:\/\//, '')}</span>
                </a>
                <span class:enabled={link.isActive} class="state-indicator">
                  {link.isActive ? links.active : links.inactive}
                </span>
              </li>
            {/each}
          </ul>
        {:else}<p class="empty">{links.empty}</p>{/if}
      </section>
      {#if data.report}
        <section
          class="context-panel link-card"
          aria-labelledby="popular-heading"
        >
          <div class="admin-section-header section-heading">
            <h2 id="popular-heading">{labels[1]}</h2>
            <a href="/admin/analytics">
              {labels[4]} <span aria-hidden="true">→</span>
            </a>
          </div>
          {#if data.popularLinks.length}
            <ul class="popular">
              {#each data.popularLinks as link (link.key)}
                <li>
                  <span>
                    {#if link.id}<a href={`/admin/links/${link.id}/analytics`}>
                        {link.title || link.url}
                      </a>{:else}{link.key || '—'}{/if}
                  </span><strong>
                    {link.clicks.toLocaleString(data.locale)}
                  </strong>
                </li>
              {/each}
            </ul>
          {:else}<p class="empty">{analytics.empty}</p>{/if}
        </section>
      {/if}
    </div>
  </div>
  {#if data.report}
    <section
      class="context-panel link-card"
      aria-labelledby="breakdown-heading"
    >
      <div class="admin-section-header section-heading">
        <h2 id="breakdown-heading">{analytics.breakdown}</h2>
        <a href="/admin/analytics">
          {labels[4]} <span aria-hidden="true">→</span>
        </a>
      </div>
      <div class="breakdowns">
        {#each data.breakdowns as item (item.dimension)}
          <section class="breakdown" aria-label={analytics[item.dimension]}>
            <h3>{analytics[item.dimension]}</h3>
            {#if item.result}
              {#if item.result.breakdown.length}
                <ul class="popular">
                  {#each item.result.breakdown.slice(0, 3) as row (row.key)}
                    <li>
                      <span>{row.key || '—'}</span><strong>
                        {row.clicks.toLocaleString(data.locale)}
                      </strong>
                    </li>
                  {/each}
                </ul>
                {#if item.result.estimated}<p class="breakdown-note">
                    {analytics.estimated}
                  </p>{/if}
              {:else}<p class="breakdown-note">{analytics.empty}</p>{/if}
            {:else}<p class="breakdown-note" role="status">
                {labels[2]}
              </p>{/if}
          </section>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .overview-metric {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.85rem 2rem;
  }
  .metric-value,
  .metric-period {
    display: grid;
    gap: 0.35rem;
  }
  .metric-value strong {
    font-size: clamp(2.5rem, 4vw, 3.5rem);
    line-height: 1;
    letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
  }
  .metric-period {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  .dashboard-content {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
    align-items: start;
    gap: var(--admin-section-gap);
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .section-heading > a {
    color: var(--ui-text-muted);
    font-size: 0.82rem;
    font-weight: 610;
    text-align: right;
  }
  .section-heading > a:hover {
    color: var(--ui-primary);
  }
  .chart-heading span,
  .chart-footer,
  .empty {
    color: var(--ui-text-muted);
    font-size: 0.83rem;
  }
  .breakdown-note {
    margin-top: 0.45rem;
    color: var(--ui-text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .breakdowns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    gap: 1.25rem;
    margin-top: 1rem;
  }
  .breakdown h3 {
    font-size: 0.85rem;
    font-weight: 650;
  }
  .breakdown ul {
    margin-top: 0.4rem;
  }
  .breakdown li {
    min-height: 0;
    padding: 0.4rem 0;
    font-size: 0.83rem;
  }
  .chart-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1.15rem;
    border-top: 1px solid var(--ui-border);
  }
  .chart-heading h3 {
    font-size: 0.9rem;
    font-weight: 650;
  }
  .chart-footer {
    border-top: 1px solid var(--ui-border);
    padding-top: 0.85rem;
    line-height: 1.5;
  }
  details {
    margin-top: 0.6rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  table {
    width: 100%;
    margin-top: 0.6rem;
    text-align: left;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.4rem;
    border-bottom: 1px solid var(--ui-border);
  }
  .link-cards {
    display: grid;
    gap: var(--admin-section-gap);
  }
  .link-card ul {
    margin-top: 1rem;
  }
  .link-card li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.25rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--ui-border);
  }
  .popular li span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .popular li a:hover,
  .recent-item:hover {
    text-decoration: underline;
  }
  .popular li strong {
    flex: none;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .recent-item {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .recent-item span {
    overflow-wrap: anywhere;
    color: var(--ui-text-muted);
    font-size: 0.83rem;
  }
  .state-indicator {
    flex: none;
    border-radius: 999px;
    padding: 0.3rem 0.58rem;
    color: var(--ui-text-muted);
    background: var(--ui-background);
    font-size: 0.76rem;
  }
  .state-indicator.enabled {
    color: var(--ui-positive);
    background: var(--ui-accent-surface);
  }
  .empty {
    margin-top: 1rem;
  }
  @media (max-width: 1000px) {
    .dashboard-content {
      grid-template-columns: 1fr;
    }
    .link-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 650px) {
    .link-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
