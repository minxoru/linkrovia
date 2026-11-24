<script lang="ts">
  import { onMount } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Search from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { brand } from '$lib/brand';
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import { linkMessages } from '$lib/i18n/links';
  import { detailNavigation, listMessages } from './messages';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let m = $derived(linkMessages(data.locale));
  let copy = $derived(listMessages[data.locale]);
  let analytics = $derived(analyticsMessages(data.locale));
  let hasFilters = $derived(
    Object.values(data.filters).some(Boolean) || data.sort !== 'created_desc',
  );
  let hasAdvancedFilters = $derived(
    Boolean(data.filters.domain || data.filters.status || data.filters.tag) ||
      data.sort !== 'created_desc',
  );
  let canCopy = $state(false);
  let copyResult = $state<{ id: string; url: string; success: boolean } | null>(
    null,
  );
  let dateTime = $derived(
    new Intl.DateTimeFormat(data.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data.timeZone,
    }),
  );

  onMount(() => {
    canCopy = typeof navigator.clipboard?.writeText === 'function';
  });

  function filterHref(options: { tag?: string; cursor?: string }) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...data.filters, ...options }))
      if (value) params.set(key, value);
    if (data.sort !== 'created_desc') params.set('sort', data.sort);
    return `?${params}`;
  }

  async function copyUrl(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copyResult = { id, url, success: true };
    } catch {
      copyResult = { id, url, success: false };
    }
  }
</script>

<svelte:head><title>{m.links} · {brand.name}</title></svelte:head>

<section class="link-library" aria-label={m.links}>
  <form
    method="GET"
    role="search"
    class="context-panel toolbar"
    aria-label={m.searchLinks}
  >
    <label for="link-search" class="sr-only">{m.searchLinks}</label>
    <div class="search-box">
      <Search size={18} aria-hidden="true" />
      <input
        id="link-search"
        class="admin-control"
        name="q"
        type="search"
        value={data.filters.q}
        placeholder={m.searchLinks}
      />
    </div>
    <button type="submit" class="admin-button admin-button-primary apply">
      {m.search}
    </button>
    <input
      class="filter-control"
      id="list-filters-toggle"
      type="checkbox"
      aria-controls="list-filters"
      checked={hasAdvancedFilters}
    />
    <label for="list-filters-toggle" class="admin-button filter-toggle">
      <SlidersHorizontal size={16} aria-hidden="true" />
      <span>{m.filter}</span>
    </label>
    <div id="list-filters" class="filters">
      <label>
        <span class="sr-only">{m.domain}</span>
        <select class="admin-control" name="domain">
          <option value="">{m.allDomains}</option>
          {#each data.domains as domain (domain.id)}
            <option
              value={domain.id}
              selected={data.filters.domain === domain.id}
            >
              {domain.hostname}
            </option>
          {/each}
        </select>
      </label>
      <label>
        <span class="sr-only">{m.status}</span>
        <select class="admin-control" name="status">
          <option value="">{m.allStatuses}</option>
          <option value="active" selected={data.filters.status === 'active'}>
            {m.active}
          </option>
          <option
            value="inactive"
            selected={data.filters.status === 'inactive'}
          >
            {m.inactive}
          </option>
        </select>
      </label>
      <label>
        <span class="sr-only">{m.tag}</span>
        <input
          class="admin-control"
          name="tag"
          value={data.filters.tag}
          placeholder={m.tag}
        />
      </label>
      <label>
        <span class="sr-only">{copy.sort}</span>
        <select class="admin-control" name="sort" aria-label={copy.sort}>
          <option value="created_desc" selected={data.sort === 'created_desc'}>
            {copy.newest}
          </option>
          <option value="created_asc" selected={data.sort === 'created_asc'}>
            {copy.oldest}
          </option>
          <option value="updated_desc" selected={data.sort === 'updated_desc'}>
            {copy.recentlyUpdated}
          </option>
        </select>
      </label>
      <button
        class="admin-button admin-button-primary apply-compact"
        type="submit"
      >
        {m.filter}
      </button>
    </div>
    {#if hasFilters && data.links.length}<a
        class="clear-filters"
        href="/admin/links"
      >
        {copy.clear}
      </a>{/if}
  </form>

  {#if copyResult}
    <p class="copy-feedback" role="status">
      {copyResult.success ? copy.copied : copy.copyError}
      {#if !copyResult.success}<code>{copyResult.url}</code>{/if}
    </p>
  {/if}

  {#if data.links.length === 0}
    <div class="context-panel empty">
      <Link2 size={24} aria-hidden="true" />
      <p>{hasFilters ? detailNavigation[data.locale].noMatches : m.empty}</p>
      {#if hasFilters}
        <a class="workspace-link" href="/admin/links">{copy.clear}</a>
      {:else}
        <a class="workspace-link" href="/admin/links/new">
          {m.create}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      {/if}
    </div>
  {:else}
    <div class="column-labels" aria-hidden="true">
      <span>{m.shortUrl}</span><span>{m.destination}</span><span>
        {m.status}
      </span><span></span>
    </div>
    <ul class="context-panel context-list link-rows">
      {#each data.links as link (link.id)}
        {@const linkPage = `/admin/links/${encodeURIComponent(link.id)}`}
        {@const linkLabel = link.title || link.shortUrl}
        <li class="link-row">
          <div class="identity">
            <span class="link-icon">
              <Link2 size={17} aria-hidden="true" />
            </span>
            <div class="link-title">
              <a href={linkPage}>{linkLabel}</a>
              {#if link.title}<code title={link.shortUrl}>
                  {link.shortUrl}
                </code>{/if}
            </div>
          </div>
          <div class="destination" title={link.destinationUrl}>
            <ArrowUpRight size={14} aria-hidden="true" /><span>
              {link.destinationUrl}
            </span>
          </div>
          <span class={['status', { enabled: link.isActive }]}>
            {link.isActive ? m.active : m.inactive}
          </span>
          <div class="row-actions">
            {#if canCopy}
              <button
                type="button"
                title={copy.copy}
                aria-label={`${copy.copy} · ${linkLabel}`}
                onclick={() => copyUrl(link.id, link.shortUrl)}
              >
                {#if copyResult?.id === link.id && copyResult.success}<Check
                    size={17}
                    aria-hidden="true"
                  />{:else}<Copy size={17} aria-hidden="true" />{/if}
              </button>
            {/if}
            <a
              href={`${linkPage}/analytics`}
              title={analytics.linkTitle}
              aria-label={`${analytics.linkTitle} · ${linkLabel}`}
            >
              <ChartNoAxesCombined size={18} aria-hidden="true" />
            </a>
          </div>
          {#if link.startsAt !== null || link.expiresAt !== null || link.tags.length}
            <div class="metadata">
              {#if link.startsAt !== null}
                <span>
                  {m.startsAt}
                  <time datetime={new Date(link.startsAt * 1000).toISOString()}>
                    {dateTime.format(link.startsAt * 1000)}
                  </time>
                  ({data.timeZone})
                </span>
              {/if}
              {#if link.expiresAt !== null}
                <span>
                  {m.expiresAt}
                  <time
                    datetime={new Date(link.expiresAt * 1000).toISOString()}
                  >
                    {dateTime.format(link.expiresAt * 1000)}
                  </time>
                  ({data.timeZone})
                </span>
              {/if}
              {#each link.tags as tag (tag)}
                <a
                  class="tag"
                  href={filterHref({ tag })}
                  aria-label={`${m.tag} · ${tag}`}
                >
                  {tag}
                </a>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if data.nextCursor}
    <footer class="results-footer">
      <a href={filterHref({ cursor: data.nextCursor })} class="workspace-link">
        {m.next}
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </footer>
  {/if}
</section>

<style>
  .link-library {
    min-width: 0;
    --row-columns: minmax(0, 1.45fr) minmax(0, 1fr) 6.5rem 6rem;
  }
  .toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.7rem;
    margin-bottom: 0.65rem;
    padding: clamp(0.65rem, 1.8vw, 1rem);
  }
  .search-box {
    display: flex;
    align-items: center;
    position: relative;
    color: var(--ui-text-muted);
  }
  .search-box :global(svg) {
    position: absolute;
    inset-inline-start: 0.7rem;
    pointer-events: none;
  }
  .toolbar input:not([type='checkbox']),
  .toolbar select {
    width: 100%;
    font-size: 0.86rem;
  }
  .toolbar input[type='search'] {
    padding-inline-start: 2.4rem;
  }
  .filters {
    display: grid;
    grid-template-columns:
      minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.85fr)
      minmax(0, 1.2fr);
    gap: 0.67rem;
    grid-column: 1 / -1;
    padding-top: 0.7rem;
    border-top: 1px solid var(--ui-border);
  }
  .filters label {
    min-width: 0;
  }
  .apply {
    grid-column: 2;
    grid-row: 1;
  }
  .filter-control {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
  }
  .filter-toggle {
    grid-column: 3;
    grid-row: 1;
    cursor: pointer;
  }
  .filter-control:focus-visible + .filter-toggle {
    outline: 2px solid var(--ui-focus);
    outline-offset: 2px;
  }
  .filter-control:checked + .filter-toggle {
    border-color: var(--ui-focus);
    background: var(--ui-accent-surface);
    color: var(--ui-link);
  }
  .filter-control:not(:checked) ~ .filters,
  .apply-compact {
    display: none;
  }
  .clear-filters {
    grid-column: 1 / -1;
    justify-self: start;
    color: var(--ui-link);
    font-size: 0.82rem;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    white-space: nowrap;
  }
  .column-labels,
  .link-row {
    display: grid;
    grid-template-columns: var(--row-columns);
    gap: 0.7rem 1rem;
    align-items: center;
    padding: 0.75rem clamp(0.75rem, 2vw, 1.2rem);
  }
  .column-labels {
    color: var(--ui-text-muted);
    font-size: 0.78rem;
    font-weight: 640;
    background: transparent;
  }
  .link-row + .link-row {
    border-top: 1px solid var(--ui-border);
  }
  .link-row:hover {
    background: color-mix(
      in srgb,
      var(--ui-surface) 82%,
      var(--ui-accent-surface)
    );
    border-radius: inherit;
  }
  .identity {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 0.7rem;
  }
  .link-icon {
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    min-height: 36px;
    border-radius: 9px;
    background: var(--ui-accent-surface);
    color: var(--ui-link);
  }
  .link-title {
    display: grid;
    min-width: 0;
    gap: 0.18rem;
  }
  .link-title a {
    min-width: 0;
    font-size: 0.92rem;
    font-weight: 670;
    overflow-wrap: anywhere;
    text-decoration: none;
  }
  .link-title a:hover {
    color: var(--ui-link);
    text-decoration: underline;
  }
  .link-title code {
    font-family: var(--ui-mono);
    font-size: 0.74rem;
    color: var(--ui-text-muted);
    overflow-wrap: anywhere;
  }
  .destination {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 0.4rem;
    color: var(--ui-text-muted);
    font-size: 0.8rem;
  }
  .destination :global(svg) {
    flex: none;
  }
  .destination span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .status {
    display: inline-flex;
    justify-self: start;
    align-items: center;
    gap: 0.42rem;
    border-radius: 20px;
    padding: 0.25rem 0.65rem;
    background: var(--ui-background);
    color: var(--ui-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .status::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .status.enabled {
    color: var(--ui-positive);
    background: var(--ui-accent-surface);
  }
  .row-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.25rem;
  }
  .row-actions a,
  .row-actions button {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text-muted);
  }
  .row-actions a:hover,
  .row-actions button:hover {
    color: var(--ui-link);
    background: var(--ui-accent-surface);
  }
  .metadata {
    grid-column: 1 / -1;
    padding-inline-start: 2.95rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.65rem;
    color: var(--ui-text-muted);
    font-size: 0.76rem;
  }
  .tag {
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: var(--ui-background);
    color: var(--ui-link);
    overflow-wrap: anywhere;
  }
  .tag:hover {
    text-decoration: underline;
  }
  .copy-feedback {
    padding: 0.65rem 1.2rem;
    color: var(--ui-link);
    font-size: 0.84rem;
  }
  .copy-feedback code {
    overflow-wrap: anywhere;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 0.55rem;
    padding: 2.75rem 1rem;
    color: var(--ui-text-muted);
  }
  .empty :global(svg) {
    color: var(--ui-link);
  }
  .results-footer {
    padding: 0.65rem 1.2rem;
    border-top: 1px solid var(--ui-border);
    text-align: end;
  }

  @media (max-width: 900px) {
    .column-labels {
      display: none;
    }
    .link-row {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.55rem;
    }
    .identity {
      grid-column: 1;
      grid-row: 1;
    }
    .status {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
    }
    .destination {
      grid-column: 1;
      grid-row: 2;
    }
    .row-actions {
      grid-column: 2;
      grid-row: 2;
    }
    .metadata {
      padding-inline-start: 0;
    }
    .link-icon {
      flex-basis: 30px;
      min-height: 30px;
    }
    .filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .apply-compact {
      display: block;
    }
  }
  @media (max-width: 440px) {
    .filter-toggle {
      inline-size: 44px;
      padding-inline: 0;
    }
    .filter-toggle span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
