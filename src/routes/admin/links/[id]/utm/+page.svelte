<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { brand } from '$lib/brand';
  import { linkUtmMessages } from './messages';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(linkUtmMessages(data.locale));
  let selectedTarget = $derived(
    form?.draft?.target ?? form?.target ?? 'default',
  );
  let targets = $derived([
    {
      id: 'default',
      destination: data.link.destinationUrl,
      values: data.config.default ?? {},
      position: null,
    },
    ...data.rules.map((rule, index) => ({
      id: rule.id,
      destination: rule.destinationUrl,
      values: data.config.rules?.[rule.id] ?? {},
      position: index + 1,
    })),
  ]);
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<section class="admin-section-stack">
  <p class="text-sm text-muted">{m.help}</p>
  <p class="text-sm text-muted">{m.safe}</p>
  {#snippet destinationEditor(target: (typeof targets)[number])}
    {@const draft = form?.draft?.target === target.id ? form.draft : null}
    <summary>
      <span class="destination-summary">
        <strong id={`utm-destination-${target.id}`}>
          {target.id === 'default' ? m.default : `${m.rule} ${target.position}`}
        </strong>
        <span>{target.destination}</span>
      </span>
      <ChevronDown size={17} aria-hidden="true" />
    </summary>
    <form
      method="POST"
      aria-labelledby={`utm-destination-${target.id}`}
      class="utm-fields space-y-4"
    >
      <input type="hidden" name="csrfToken" value={data.csrfToken} />
      <input
        type="hidden"
        name="updatedAt"
        value={draft?.updatedAt ?? data.link.updatedAt}
      />
      <input type="hidden" name="target" value={target.id} />
      <label class="block space-y-2">
        <span class="block text-sm font-medium">{m.template}</span>
        <select name="templateId" class="admin-control">
          <option value="">{m.none}</option>
          {#each data.templates as template (template.id)}
            <option
              value={template.id}
              selected={draft?.templateId === template.id}
            >
              {template.name}
            </option>
          {/each}
        </select>
      </label>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each data.utmKeys as key (key)}
          <label class="block space-y-2">
            <span class="block text-sm font-medium">{key}</span>
            <input
              name={key}
              defaultValue={draft?.values[key] ?? target.values[key] ?? ''}
              maxlength="256"
              class="admin-control"
            />
          </label>
        {/each}
      </div>
      <p class="text-sm text-muted">{m.remove}</p>
      {#if form?.issue && (!form.draft || form.draft.target === target.id)}
        <p role="alert" class="text-sm text-negative">{m[form.issue]}</p>
      {/if}
      {#if form?.saved && form.target === target.id}<p role="status">
          {m.saved}
        </p>{/if}
      <div class="admin-form-footer">
        <button
          formaction="?/save"
          type="submit"
          class="admin-button admin-button-primary"
        >
          {m.save}
        </button>
        <button formaction="?/preview" type="submit" class="admin-button">
          {m.preview}
        </button>
      </div>
      {#if form?.preview && draft}
        <dl class="space-y-2 text-sm" aria-live="polite">
          <div>
            <dt class="font-medium">{m.before}</dt>
            <dd class="break-all"><code>{form.preview.before}</code></dd>
          </div>
          <div>
            <dt class="font-medium">{m.after}</dt>
            <dd class="break-all"><code>{form.preview.after}</code></dd>
          </div>
        </dl>
      {/if}
    </form>
  {/snippet}

  <div class="context-panel context-list destination-list">
    {#each targets as target (target.id)}
      {#if target.id === selectedTarget}
        <details name="utm-target" open>
          {@render destinationEditor(target)}
        </details>
      {:else}
        <details name="utm-target">
          {@render destinationEditor(target)}
        </details>
      {/if}
    {/each}
  </div>
</section>

<style>
  .destination-list {
    overflow: clip;
  }
  .destination-list details + details {
    border-top: 1px solid var(--ui-border);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 3rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    list-style: none;
    color: var(--ui-link);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary :global(svg) {
    flex: none;
  }
  .destination-summary {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .destination-summary span {
    color: var(--ui-text-muted);
    font-size: 0.8rem;
  }
  .utm-fields {
    padding: 1rem;
    border-top: 1px solid var(--ui-border);
  }
  .utm-fields :global(.admin-control) {
    width: 100%;
  }
</style>
