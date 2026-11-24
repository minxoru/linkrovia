<script lang="ts">
  import { brand } from '$lib/brand';
  import type { PageProps } from './$types';
  import { qrMessages } from './messages';
  let { data }: PageProps = $props();
  let m = $derived(qrMessages(data.locale));
  let base = $derived(`/admin/links/${encodeURIComponent(data.link.id)}/qr`);
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<div class="admin-section-stack">
  <p class="text-sm text-muted">{m.description}</p>
  <section class="context-panel">
    {#if data.url}
      <div class="qr-workspace">
        <div class="qr-preview rounded-lg bg-white p-3 shadow-sm">
          <img
            src={`${base}/image/svg`}
            alt={m.preview}
            width="280"
            height="280"
            class="h-auto w-64 max-w-full"
          />
        </div>
        <div class="qr-actions min-w-0 space-y-5">
          <div>
            <h2 class="text-sm font-medium">{m.url}</h2>
            <p class="mt-1 break-all text-sm text-muted">
              {data.url}
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <a
              href={`${base}/image/svg`}
              download
              class="admin-button admin-button-primary"
            >
              {m.downloadSvg}
            </a>
            <a href={`${base}/image/png`} download class="admin-button">
              {m.downloadPng}
            </a>
          </div>
        </div>
      </div>
    {:else}
      <form method="POST" action="?/create">
        <input type="hidden" name="csrfToken" value={data.csrfToken} />
        <button class="admin-button admin-button-primary">
          {m.create}
        </button>
      </form>
    {/if}
  </section>
</div>

<style>
  .qr-workspace {
    display: grid;
    gap: 2rem;
    align-items: center;
  }
  .qr-preview {
    width: fit-content;
    max-width: 100%;
  }
  .qr-actions {
    padding-block: 0.5rem;
  }
  @media (min-width: 680px) {
    .qr-workspace {
      grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
    }
  }
</style>
