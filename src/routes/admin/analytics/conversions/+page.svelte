<script lang="ts">
  import { brand } from '$lib/brand';
  import ReportNavigation from '$lib/components/analytics/ReportNavigation.svelte';
  import Conversions from '$lib/components/conversions/Conversions.svelte';
  import { conversionMessages } from '$lib/components/conversions/messages';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(conversionMessages(data.locale));
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<ReportNavigation locale={data.locale} current="conversions" />
<p class="mb-4 max-w-prose text-sm text-muted">{m.intro}</p>
<Conversions {data} {form} />
