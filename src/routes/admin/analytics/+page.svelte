<script lang="ts">
  import Analytics from '$lib/components/analytics/Analytics.svelte';
  import ReportNavigation from '$lib/components/analytics/ReportNavigation.svelte';
  import {
    analyticsMessages,
    analyticsRepairMessages,
  } from '$lib/components/analytics/messages';
  import { brand } from '$lib/brand';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let m = $derived(analyticsRepairMessages(data.locale));
</script>

<svelte:head>
  <title>{analyticsMessages(data.locale).title} · {brand.name}</title>
</svelte:head>
<ReportNavigation locale={data.locale} current="clicks" />
<Analytics
  locale={data.locale}
  report={data.report}
  failed={data.failed}
  filters={data.filters}
  domains={data.domains}
  analyticsDeferred={data.analyticsDeferred}
  canConfigureAnalytics={data.user.role === 'owner'}
  base="/admin/analytics"
>
  {#snippet repair()}
    {#if data.repair && !data.analyticsDeferred}
      <section
        id="click-history-recovery"
        class="workspace-panel repair"
        aria-label={m.title}
      >
        <details>
          <summary>{m.title}</summary>
          <p>{m.help}</p>
          {#if data.repair.missingDates.length}
            <p>{m.missing}</p>
            <ul class="dates">
              {#each data.repair.missingDates as date (date)}
                <li><time datetime={date}>{date}</time></li>
              {/each}
            </ul>
          {/if}
          <form method="POST">
            <input type="hidden" name="csrfToken" value={data.csrfToken} />
            <label>
              {m.day}
              <input
                class="admin-control"
                type="date"
                name="date"
                min={data.repair.earliest}
                max={data.repair.latest}
                value={form?.date ?? data.repair.missingDates[0] ?? ''}
                required
              />
            </label>
            <button type="submit" class="admin-button admin-button-primary">
              {m.submit}
            </button>
          </form>
        </details>
        {#if form}
          <p role="alert">{m.submissions[form.status]}</p>
        {/if}
        {#if data.repair.latestRequest}
          <p role="status">
            <time datetime={data.repair.latestRequest.date}>
              {data.repair.latestRequest.date}
            </time>
            · {m.states[data.repair.latestRequest.status]}
          </p>
        {/if}
      </section>
    {/if}
  {/snippet}
</Analytics>

<style>
  .repair {
    margin-bottom: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  p {
    margin: 0.65rem 0;
  }
  .dates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.9rem;
    padding: 0;
    list-style: none;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
  }
</style>
