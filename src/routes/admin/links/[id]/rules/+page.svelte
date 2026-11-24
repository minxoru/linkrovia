<script lang="ts">
  import { brand } from '$lib/brand';
  import RuleEditor from './RuleEditor.svelte';
  import { ruleMessages } from './messages';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(ruleMessages(data.locale));
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>

<div class="admin-section-stack">
  <div class="space-y-2 text-sm text-muted">
    <p>{m.help}</p>
    <p>{m.visitorHelp}</p>
  </div>
  {#if form?.saved}
    <p role="status" class="text-sm text-positive">{m.saved}</p>
  {/if}

  {#key `${data.linkId}:${data.updatedAt}`}
    <RuleEditor {data} {form} />
  {/key}
</div>
