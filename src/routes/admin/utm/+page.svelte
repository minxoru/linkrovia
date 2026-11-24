<script lang="ts">
  import { brand } from '$lib/brand';
  import { resolve } from '$app/paths';
  import type { PageProps } from './$types';
  import { utmMessages } from './messages';

  let { data, form }: PageProps = $props();
  let messages = $derived(utmMessages(data.locale));
  let pageHref = $derived(resolve('/admin/utm'));
  let editQuery = $derived(
    data.editing ? `&edit=${encodeURIComponent(data.editing.id)}` : '',
  );
  let draft = $derived(form?.draft ?? data.editing);
  let previewInput = $derived(form?.previewInput);
  let staleTemplate = $derived(form?.issue === 'stale_template');
  let labels = $derived({
    utm_source: messages.source,
    utm_medium: messages.medium,
    utm_campaign: messages.campaign,
    utm_term: messages.term,
    utm_content: messages.content,
  });

  type Field = PageProps['data']['utmKeys'][number];
</script>

<svelte:head>
  <title>{messages.title} · {brand.name}</title>
</svelte:head>

{#snippet utmFields(
  prefix: string,
  values: Partial<Record<Field, string>> = {},
)}
  <div class="grid gap-3 sm:grid-cols-2">
    {#each data.utmKeys.slice(0, 5) as key (key)}
      <div class="space-y-1">
        <label for={`${prefix}-${key}`} class="block text-sm font-medium">
          {key in labels ? labels[key as keyof typeof labels] : key}
        </label>
        <input
          id={`${prefix}-${key}`}
          name={key}
          defaultValue={values[key] ?? ''}
          maxlength="256"
          class="admin-control w-full min-w-0"
        />
      </div>
    {/each}
  </div>
  <details open={data.utmKeys.slice(5).some((key) => values[key])}>
    <summary class="cursor-pointer text-sm font-medium">
      {messages.additionalFields}
    </summary>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      {#each data.utmKeys.slice(5) as key (key)}
        <div class="space-y-1">
          <label for={`${prefix}-${key}`} class="block font-mono text-sm">
            {key}
          </label>
          <input
            id={`${prefix}-${key}`}
            name={key}
            defaultValue={values[key] ?? ''}
            maxlength="256"
            class="admin-control w-full min-w-0"
          />
        </div>
      {/each}
    </div>
  </details>
{/snippet}

<div class="admin-page">
  <header class="context-header space-y-2">
    <h1>{messages.title}</h1>
    <p>{messages.description}</p>
  </header>

  {#if form?.issue}
    <p role="alert" class="font-medium">{messages[form.issue]}</p>
  {:else if form?.saved || form?.deleted}
    <p role="status" class="font-medium">
      {form.saved ? messages.saved : messages.deleted}
    </p>
  {/if}

  <div class="admin-section-stack">
    <section
      aria-labelledby="utm-templates-title"
      class="context-panel min-w-0 space-y-4"
    >
      <div class="space-y-3">
        <div
          class="admin-section-header flex flex-wrap items-center justify-between gap-3"
        >
          <h2 id="utm-templates-title">
            {messages.templates}
          </h2>
          <a
            href={`${pageHref}#template-editor`}
            class="admin-button"
            data-sveltekit-reload={!!data.editing}
          >
            {messages.newTemplate}
          </a>
        </div>
        {#if !data.templates.length}
          <p class="text-sm">{messages.noTemplates}</p>
        {:else}
          <ul class="divide-y divide-line">
            {#each data.templates as template (template.id)}
              <li class="py-2">
                <a
                  class="inline-block max-w-full break-words font-medium text-link underline underline-offset-4"
                  href={`${pageHref}?edit=${encodeURIComponent(template.id)}#template-editor`}
                  aria-current={data.editing?.id === template.id
                    ? 'page'
                    : undefined}
                  data-sveltekit-reload
                >
                  {template.name}
                </a>
                {#if template.description}
                  <p class="text-sm break-words text-muted">
                    {template.description}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <div class="admin-section-stack">
      <section
        id="template-editor"
        aria-labelledby="template-editor-title"
        class="context-panel scroll-mt-24 min-w-0 space-y-4"
      >
        <header class="admin-section-header">
          <h2 id="template-editor-title">
            {data.editing ? messages.editTemplate : messages.newTemplate}
          </h2>
        </header>

        <form method="POST" action={`?/save${editQuery}`} class="space-y-4">
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          {#if data.editing}
            <input type="hidden" name="id" value={data.editing.id} />
            <input
              type="hidden"
              name="updatedAt"
              value={staleTemplate ? '' : data.editing.updatedAt}
            />
          {/if}
          <div class="space-y-1">
            <label for="template-name" class="block text-sm font-medium">
              {messages.name}
            </label>
            <input
              id="template-name"
              name="name"
              defaultValue={draft?.name ?? ''}
              required
              maxlength="80"
              class="admin-control w-full min-w-0"
            />
          </div>
          <div class="space-y-1">
            <label for="template-purpose" class="block text-sm font-medium">
              {messages.purpose}
            </label>
            <input
              id="template-purpose"
              name="description"
              defaultValue={draft?.description ?? ''}
              maxlength="256"
              class="admin-control w-full min-w-0"
            />
          </div>
          {@render utmFields('template', draft?.values)}
          <div class="admin-form-footer">
            <button
              type="submit"
              class="admin-button admin-button-primary"
              disabled={staleTemplate}
            >
              {messages.save}
            </button>
          </div>
        </form>

        {#if data.editing}
          <form method="POST" action={`?/remove${editQuery}`}>
            <input type="hidden" name="csrfToken" value={data.csrfToken} />
            <input type="hidden" name="id" value={data.editing.id} />
            <input
              type="hidden"
              name="updatedAt"
              value={staleTemplate ? '' : data.editing.updatedAt}
            />
            <button
              type="submit"
              disabled={staleTemplate}
              class="admin-button admin-button-danger"
            >
              {messages.remove}
            </button>
          </form>
        {/if}
      </section>

      <section
        aria-labelledby="utm-preview-title"
        class="context-panel min-w-0 space-y-4"
      >
        <header class="admin-section-header">
          <h2 id="utm-preview-title">{messages.preview}</h2>
        </header>
        <form method="POST" action={`?/preview${editQuery}`} class="space-y-4">
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <div class="space-y-1">
            <label for="preview-url" class="block text-sm font-medium">
              {messages.url}
            </label>
            <input
              id="preview-url"
              name="destinationUrl"
              type="url"
              defaultValue={previewInput?.destinationUrl ?? ''}
              maxlength="8192"
              required
              class="admin-control w-full min-w-0"
            />
          </div>
          {#if data.templates.length}
            <div class="space-y-1">
              <label for="preview-template" class="block text-sm font-medium">
                {messages.template}
              </label>
              <select
                id="preview-template"
                name="templateId"
                class="admin-control w-full min-w-0"
                aria-describedby="utm-override-hint"
              >
                <option value="">{messages.noTemplate}</option>
                {#each data.templates as template (template.id)}
                  <option
                    value={template.id}
                    selected={previewInput?.templateId === template.id}
                  >
                    {template.name}
                  </option>
                {/each}
              </select>
              <p id="utm-override-hint" class="text-sm">
                {messages.overrideHint}
              </p>
            </div>
          {/if}
          {@render utmFields('preview', previewInput?.values)}
          <div class="admin-form-footer">
            <button type="submit" class="admin-button admin-button-primary">
              {messages.previewAction}
            </button>
          </div>
        </form>

        {#if form?.preview}
          <dl
            class="space-y-2 rounded-md border border-line bg-canvas p-3 text-sm"
          >
            <dt class="font-medium">{messages.before}</dt>
            <dd><code class="break-all">{form.preview.before}</code></dd>
            <dt class="font-medium">{messages.after}</dt>
            <dd><code class="break-all">{form.preview.after}</code></dd>
          </dl>
        {/if}
      </section>
    </div>
  </div>
</div>
