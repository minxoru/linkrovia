<script lang="ts">
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';
  import Target from '@lucide/svelte/icons/target';
  import type { Locale } from '$lib/i18n/locale';
  import { analyticsMessages } from './messages';

  let {
    locale,
    current,
  }: { locale: Locale; current: 'clicks' | 'conversions' } = $props();
  let m = $derived(analyticsMessages(locale));
</script>

<header class="workspace-intro"><h1>{m.title}</h1></header>
<nav class="context-nav" aria-label={m.title}>
  <a
    href="/admin/analytics"
    aria-current={current === 'clicks' ? 'page' : undefined}
  >
    <ChartNoAxesCombined size={16} aria-hidden="true" />{m.clicks}
  </a>
  <a
    href="/admin/analytics/conversions"
    aria-current={current === 'conversions' ? 'page' : undefined}
  >
    <Target size={16} aria-hidden="true" />{m.conversions}
  </a>
</nav>
