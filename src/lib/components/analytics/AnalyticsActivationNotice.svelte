<script lang="ts">
  import {
    analyticsActivationMessages,
    analyticsEngineDashboard,
  } from '$lib/i18n/analytics-activation';
  import type { Locale } from '$lib/i18n/locale';

  let { locale, canConfigure }: { locale: Locale; canConfigure: boolean } =
    $props();
  let m = $derived(analyticsActivationMessages[locale]);
</script>

<aside class="context-panel space-y-3" aria-label={m.heading}>
  <div class="admin-section-header">
    <h2>{m.heading}</h2>
    <p>{canConfigure ? m.steps : m.askOwner}</p>
  </div>
  {#if canConfigure}
    <a
      class="admin-button"
      href={analyticsEngineDashboard}
      target="_blank"
      rel="noopener noreferrer"
    >
      {m.dashboard} <span aria-hidden="true">↗</span>
    </a>
  {/if}
</aside>
