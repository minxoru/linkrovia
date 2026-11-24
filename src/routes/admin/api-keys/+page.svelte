<script lang="ts">
  import { brand } from '$lib/brand';
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  import { apiKeyMessages } from './messages';

  let { data, form }: PageProps = $props();
  let messages = $derived(apiKeyMessages(data.locale));
  let dateTime = $derived(
    new Intl.DateTimeFormat(data.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data.timeZone,
    }),
  );
</script>

<svelte:head>
  <title>{messages.title} · {brand.name}</title>
</svelte:head>

<div class="admin-page">
  <header class="context-header flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">{messages.title}</h1>
      <p>{messages.intro}</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      {#if data.user.role === 'owner'}
        <a class="admin-button" href="/admin/integrations/mcp">
          MCP <span aria-hidden="true">→</span>
        </a>
      {/if}
      <a class="admin-button admin-button-primary" href="#create-api-key">
        {messages.create}
      </a>
    </div>
  </header>

  {#if form?.newToken}
    <div class="context-panel space-y-2" role="status">
      <p id="new-api-key" class="font-medium">{messages.created}</p>
      <input
        aria-labelledby="new-api-key"
        class="admin-control w-full font-mono text-sm"
        readonly
        value={form.newToken}
        onfocus={(event) => event.currentTarget.select()}
      />
    </div>
  {:else if form?.issue}
    <p role="alert" class="font-medium">{messages[form.issue]}</p>
  {:else if form?.revoked}
    <p role="status" class="font-medium">{messages.revokedNotice}</p>
  {/if}

  <div class="admin-section-stack">
    <section class="context-panel space-y-4" aria-labelledby="your-api-keys">
      <h2 id="your-api-keys" class="text-xl font-semibold">
        {messages.existing}
      </h2>
      {#if data.keys.length === 0}
        <p>{messages.empty}</p>
      {:else}
        <ul class="divide-y divide-line border-y border-line">
          {#each data.keys as key (key.id)}
            <li class="flex flex-wrap items-start justify-between gap-3 py-4">
              <div class="min-w-0 space-y-1">
                <h3 class="break-words font-medium">{key.name}</h3>
                <code class="text-sm">{key.prefix}…</code>
                <p class="break-words font-mono text-sm">
                  {key.scopes.join(', ')}
                </p>
                <dl class="space-y-1 text-sm text-muted">
                  <div class="flex gap-2">
                    <dt>{messages.expires}</dt>
                    <dd>
                      {key.expiresAt === null
                        ? messages.never
                        : dateTime.format(key.expiresAt * 1000)}
                    </dd>
                  </div>
                  <div class="flex gap-2">
                    <dt>{messages.lastUsed}</dt>
                    <dd>
                      {key.lastUsedAt === null
                        ? messages.never
                        : dateTime.format(key.lastUsedAt * 1000)}
                    </dd>
                  </div>
                </dl>
              </div>
              {#if key.revokedAt !== null}
                <span class="text-sm">{messages.revoked}</span>
              {:else if key.expiresAt !== null && key.expiresAt <= data.now}
                <span class="text-sm">{messages.expired}</span>
              {:else}
                <form method="POST" action="?/revoke" use:enhance>
                  <input
                    type="hidden"
                    name="csrfToken"
                    value={data.csrfToken}
                  />
                  <input type="hidden" name="id" value={key.id} />
                  <button
                    type="submit"
                    class="admin-button admin-button-danger"
                    aria-label={`${messages.revoke}: ${key.name}`}
                  >
                    {messages.revoke}
                  </button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    <form
      id="create-api-key"
      aria-labelledby="create-api-key-heading"
      method="POST"
      action="?/create"
      use:enhance
      class="context-panel scroll-mt-24 space-y-4"
    >
      <h2 id="create-api-key-heading" class="text-xl font-semibold">
        {messages.create}
      </h2>
      <input type="hidden" name="csrfToken" value={data.csrfToken} />
      <div class="space-y-1">
        <label for="key-name" class="block font-medium">{messages.name}</label>
        <input
          id="key-name"
          name="name"
          maxlength="80"
          required
          class="admin-control w-full"
        />
      </div>
      <div class="space-y-1">
        <label for="key-expiry" class="block font-medium">
          {messages.expiry}
        </label>
        <select id="key-expiry" name="expiry" class="admin-control w-full">
          {#each data.expiryOptions as expiry (expiry)}
            <option value={expiry}>{messages[expiry]}</option>
          {/each}
        </select>
      </div>
      <fieldset class="space-y-2">
        <legend class="font-medium">{messages.scopes}</legend>
        <div class="grid gap-2">
          {#each data.availableScopes as scope (scope)}
            <label class="flex items-center gap-2">
              <input type="checkbox" name="scope" value={scope} />
              <code class="text-sm">{scope}</code>
            </label>
          {/each}
        </div>
      </fieldset>
      <button type="submit" class="admin-button admin-button-primary">
        {messages.create}
      </button>
    </form>
  </div>
</div>
