<script lang="ts">
  import Analytics from '$lib/components/analytics/Analytics.svelte';
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import { brand } from '$lib/brand';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{analyticsMessages(data.locale).linkTitle} · {brand.name}</title>
</svelte:head>
<div class="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
  <Analytics
    locale={data.locale}
    report={data.report}
    failed={data.failed}
    filters={data.filters}
    analyticsDeferred={data.analyticsDeferred}
    canConfigureAnalytics={data.user.role === 'owner'}
    base={`/admin/links/${data.linkId}/analytics`}
    linkScoped
  />
</div>
