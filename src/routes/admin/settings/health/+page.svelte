<script lang="ts">
  import { brand } from '$lib/brand';
  import {
    analyticsActivationMessages,
    analyticsEngineDashboard,
  } from '$lib/i18n/analytics-activation';
  import '../../admin-context.css';
  import type { PageProps } from './$types';
  import { healthMessages } from './messages';

  let { data }: PageProps = $props();
  let activation = $derived(analyticsActivationMessages[data.locale]);
  let m = $derived(healthMessages(data.locale));
  let format = $derived(
    new Intl.DateTimeFormat(data.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
      hourCycle: 'h23',
    }),
  );
  let size = $derived(
    new Intl.NumberFormat(data.locale, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 2,
    }),
  );
  function date(seconds: number | null) {
    return seconds === null
      ? m.unknown
      : `${format.format(new Date(seconds * 1000))} UTC`;
  }
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<div class="admin-page">
  <header class="context-header">
    <h1>{m.title}</h1>
    <p>{m.intro}</p>
  </header>
  <div class="admin-section-stack">
    <section class="context-panel space-y-4" aria-labelledby="storage-heading">
      <div class="admin-section-header">
        <h2 id="storage-heading">{m.database}</h2>
      </div>
      <p
        class="inline-block rounded-md border border-line bg-canvas px-2.5 py-1 text-sm font-medium"
      >
        {data.health.database.status === 'available'
          ? m.connected
          : m.unavailable}
      </p>
      {#if data.health.database.sizeBytes !== null}
        <p>
          {m.size}: {size.format(data.health.database.sizeBytes / 1_000_000)}
        </p>
      {/if}
      <a
        class="admin-button block w-fit"
        href="https://dash.cloudflare.com/?to=/:account/workers-and-pages"
      >
        {m.checkCloudflare}
      </a>
    </section>
    <section
      class="context-panel space-y-3"
      aria-labelledby="analytics-heading"
    >
      <div class="admin-section-header">
        <h2 id="analytics-heading">
          {m.analytics}
        </h2>
      </div>
      <p
        class="inline-block rounded-md border border-line bg-canvas px-2.5 py-1 text-sm font-medium"
      >
        {data.analyticsDeferred
          ? m.unconfigured
          : data.health.analytics === 'available'
            ? m.connected
            : m[data.health.analytics]}
      </p>
      {#if data.analyticsDeferred}
        <p class="text-sm text-muted">{activation.steps}</p>
        <a
          class="admin-button"
          href={analyticsEngineDashboard}
          target="_blank"
          rel="noopener noreferrer"
        >
          {activation.dashboard} <span aria-hidden="true">↗</span>
        </a>
      {/if}
    </section>
    <section class="context-panel space-y-3" aria-labelledby="clicks-heading">
      <div class="admin-section-header">
        <h2 id="clicks-heading">{m.clicks}</h2>
      </div>
      <p
        class="inline-block rounded-md border border-line bg-canvas px-2.5 py-1 text-sm font-medium"
      >
        {data.analyticsDeferred ? m.unconfigured : m[data.health.clicks.status]}
      </p>
      <dl class="space-y-2 text-sm">
        <div>
          <dt class="font-medium">{m.latest}</dt>
          <dd>{data.health.clicks.latestDay ?? m.unknown}</dd>
        </div>
        <div>
          <dt class="font-medium">{m.completed}</dt>
          <dd>{date(data.health.clicks.completedAt)}</dd>
        </div>
        {#if !data.analyticsDeferred && data.health.clicks.missingDays.length}
          <div>
            <dt class="font-medium">{m.missing}</dt>
            <dd class="break-words">
              {data.health.clicks.missingDays.join(', ')}
            </dd>
          </div>
        {/if}
      </dl>
      {#if !data.analyticsDeferred}
        <a
          class="admin-button block w-fit"
          href="/admin/analytics#click-history-recovery"
        >
          {m.recovery}
        </a>
      {/if}
    </section>
    <section
      class="context-panel space-y-3"
      aria-labelledby="conversions-heading"
    >
      <div class="admin-section-header">
        <h2 id="conversions-heading">
          {m.conversions}
        </h2>
      </div>
      <p
        class="inline-block rounded-md border border-line bg-canvas px-2.5 py-1 text-sm font-medium"
      >
        {m[data.health.conversions.status]}
      </p>
      {#if data.health.conversions.oldestDueAt !== null}
        <dl class="text-sm">
          <dt class="font-medium">{m.oldest}</dt>
          <dd>{date(data.health.conversions.oldestDueAt)}</dd>
        </dl>
      {/if}
    </section>
    {#if data.health.version}
      <details class="context-panel space-y-3">
        <summary class="cursor-pointer text-lg font-semibold">
          {m.version}
        </summary>
        <dl class="space-y-2 text-sm">
          <div>
            <dt class="font-medium">{m.deployment}</dt>
            <dd class="break-all">{data.health.version.id}</dd>
          </div>
          <div>
            <dt class="font-medium">{m.deployedAt}</dt>
            <dd>
              {format.format(new Date(data.health.version.timestamp))} UTC
            </dd>
          </div>
        </dl>
      </details>
    {/if}
  </div>
</div>
