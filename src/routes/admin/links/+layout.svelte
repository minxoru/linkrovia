<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Copy from '@lucide/svelte/icons/copy';
  import Plus from '@lucide/svelte/icons/plus';
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import { linkMessages } from '$lib/i18n/links';
  import { linkSectionLabels } from '../breadcrumbs';
  import { detailNavigation, listMessages } from './messages';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  let m = $derived(linkMessages(data.locale));
  let labels = $derived(detailNavigation[data.locale]);
  let clipboard = $derived(listMessages[data.locale]);
  let analytics = $derived(analyticsMessages(data.locale));
  let detailId = $derived(page.params.id);
  let isNew = $derived(page.url.pathname === '/admin/links/new');
  let linkPath = $derived(
    detailId ? `/admin/links/${encodeURIComponent(detailId)}` : '',
  );

  let sectionsList = $derived(Object.entries(linkSectionLabels(data.locale)));
  let active = $derived(sectionsList.find(([suffix]) => isCurrent(suffix)));
  let sectionTitle = $derived(
    active?.[0] === '/analytics'
      ? analytics.linkTitle
      : (active?.[1] ?? m.edit),
  );
  let sections = $state<HTMLDetailsElement>();
  let copied = $state<{ url: string; ok: boolean } | null>(null);

  afterNavigate(({ from, to }) => {
    if (
      !from ||
      !to ||
      from.url.pathname === to.url.pathname ||
      !sections?.open
    )
      return;
    const focusWithin = sections.contains(document.activeElement);
    sections.open = false;
    if (focusWithin) sections.querySelector('summary')?.focus();
  });

  function isCurrent(suffix: string) {
    return page.url.pathname === linkPath + suffix;
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copied = { url, ok: true };
    } catch {
      copied = { url, ok: false };
    }
  }
</script>

{#snippet navigation(mobile = false)}
  <nav class:context-nav={!mobile} aria-label={m.links}>
    {#each sectionsList as [suffix, label] (suffix)}
      <a
        href={linkPath + suffix}
        aria-current={isCurrent(suffix) ? 'page' : undefined}
      >
        {label}
      </a>
    {/each}
  </nav>
{/snippet}

{#if detailId}
  <div class="link-workspace admin-page">
    <header class="context-header link-header">
      <div class="link-heading">
        <div class="heading-copy">
          <h1>{sectionTitle}</h1>
          {#if data.linkContext}
            {@const shortUrl = data.linkContext.shortUrl}
            <div class="record-identity">
              {#if data.linkContext.title}
                <span class="record-name">{data.linkContext.title}</span>
              {/if}
              <a class="record-url" href={shortUrl}>{shortUrl}</a>
            </div>
          {/if}
        </div>
        {#if data.linkContext}
          {@const shortUrl = data.linkContext.shortUrl}
          <button
            class="admin-button copy-button"
            type="button"
            onclick={() => copyUrl(shortUrl)}
          >
            <Copy size={16} aria-hidden="true" />
            {clipboard.copy}
          </button>
        {/if}
      </div>
      {#if copied && copied.url === data.linkContext?.shortUrl}
        <p class="copy-status" role="status">
          {copied.ok ? clipboard.copied : clipboard.copyError}
        </p>
      {/if}
      <div class="link-sections">
        {@render navigation()}
      </div>
      <details class="mobile-sections" bind:this={sections}>
        <summary>
          <span class="section-summary">
            <span>{labels.sections}</span>
            {#if active}<span class="section-current">{active[1]}</span>{/if}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {@render navigation(true)}
      </details>
    </header>
    <div class="link-task">
      {@render children()}
    </div>
  </div>
{:else}
  <div class="link-workspace admin-page">
    <header class="workspace-intro">
      <h1>{isNew ? m.create : m.links}</h1>
      {#if !isNew}
        <a href="/admin/links/new" class="admin-button admin-button-primary">
          <Plus size={17} aria-hidden="true" />{m.create}
        </a>
      {/if}
    </header>
    {@render children()}
  </div>
{/if}

<style>
  .link-workspace {
    min-width: 0;
    container-type: inline-size;
  }
  .link-header {
    padding-block-end: 0;
  }
  .link-heading {
    display: flex;
    align-items: end;
    gap: 0.75rem 1.5rem;
    justify-content: space-between;
    flex-wrap: wrap;
    padding-block-end: 0.75rem;
  }
  .heading-copy {
    display: grid;
    gap: 0.4rem;
    flex: 1 1 18rem;
    min-width: 0;
  }
  .copy-button {
    flex: none;
  }
  .record-identity {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.8rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .record-name {
    font-size: 0.875rem;
    font-weight: 650;
  }
  .record-url {
    color: var(--ui-link);
    font-family: var(--ui-mono);
    font-size: 0.79rem;
    text-underline-offset: 0.2em;
  }
  .record-url:hover {
    text-decoration: underline;
  }
  .link-header .copy-status {
    margin-block: 0 0.65rem;
    font-size: 0.83rem;
  }
  .link-sections :global(.context-nav) {
    margin-block-end: 0;
    border-block-end: 0;
  }
  .link-task {
    display: grid;
    gap: 1.05rem;
    min-width: 0;
  }
  .mobile-sections {
    display: none;
  }
  @container (max-width: 50rem) {
    .link-sections {
      display: none;
    }
    .mobile-sections {
      display: block;
      border-block-start: 1px solid var(--ui-border);
    }
    .mobile-sections summary {
      display: flex;
      min-height: 2.75rem;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      color: var(--ui-link);
      font-weight: 650;
      cursor: pointer;
      list-style: none;
    }
    .mobile-sections summary::-webkit-details-marker {
      display: none;
    }
    .mobile-sections summary :global(svg) {
      flex: none;
    }
    .mobile-sections[open] summary :global(svg) {
      transform: rotate(180deg);
    }
    .section-summary {
      display: flex;
      flex-wrap: wrap;
      column-gap: 0.55rem;
      align-items: baseline;
      font-size: 0.875rem;
    }
    .section-current {
      color: var(--ui-text-muted);
      font-weight: 500;
    }
    .mobile-sections nav {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.2rem 0.5rem;
      padding-block: 0.25rem 0.5rem;
    }
    .mobile-sections a {
      display: flex;
      min-height: 2.75rem;
      align-items: center;
      padding-inline: 0.45rem;
      border-radius: var(--ui-radius-sm);
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .mobile-sections a:hover,
    .mobile-sections a[aria-current='page'] {
      color: var(--ui-link);
    }
    .mobile-sections a[aria-current='page'] {
      background: var(--ui-accent-surface);
    }
  }
  @container (max-width: 26rem) {
    .mobile-sections nav {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
