<script lang="ts">
  import { brand } from '$lib/brand';
  import { simulationMessages } from './messages';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(simulationMessages(data.locale));
  const fields = [
    { name: 'userAgent', placeholder: 'Mozilla/5.0 …' },
    { name: 'country', placeholder: 'JP' },
    { name: 'region', placeholder: 'JP-13' },
    { name: 'language', placeholder: 'ja' },
  ] as const;
  let result = $derived(form?.result);
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>

<div class="admin-section-stack">
  <form
    method="POST"
    aria-describedby="simulation-help"
    class="context-panel space-y-5"
  >
    <p id="simulation-help" class="text-sm text-muted">{m.help}</p>
    <input type="hidden" name="csrfToken" value={data.csrfToken} />
    {#if form?.invalidFields?.length}
      <p role="alert" class="text-sm text-negative">{m.invalid}</p>
    {/if}
    <div class="grid gap-4 sm:grid-cols-3">
      {#each fields as { name, placeholder } (name)}
        {@const invalid = form?.invalidFields?.includes(name)}
        <div class={['space-y-2', { 'sm:col-span-3': name === 'userAgent' }]}>
          <label for="simulate-{name}" class="block text-sm font-medium">
            {m[name]}
          </label>
          <input
            id="simulate-{name}"
            {name}
            {placeholder}
            defaultValue={form?.values[name] ?? ''}
            maxlength={data.limits[name]}
            spellcheck="false"
            autocomplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `simulate-${name}-error` : undefined}
            class="admin-control w-full"
          />
          {#if invalid}
            <p id="simulate-{name}-error" class="text-sm text-negative">
              {m[`${name}Error`]}
            </p>
          {/if}
        </div>
      {/each}
    </div>
    <div class="admin-form-footer">
      <button type="submit" class="admin-button admin-button-primary">
        {m.run}
      </button>
    </div>
  </form>

  <section aria-labelledby="simulation-result" class="context-panel space-y-4">
    <header class="admin-section-header">
      <h2 id="simulation-result">{m.result}</h2>
    </header>
    {#if result}
      <dl class="space-y-3 text-sm">
        <div>
          <dt class="font-medium">{m.redirectStatus}</dt>
          <dd>{form?.redirectStatus ?? m.noRedirect}</dd>
        </div>
        {#if result.destinationUrl}
          <div>
            <dt class="font-medium">{m.destination}</dt>
            <dd class="break-all"><code>{result.destinationUrl}</code></dd>
          </div>
        {/if}
        <div>
          <dt class="font-medium">{m.reason}</dt>
          <dd>
            {#each result.reasonCodes as code (code)}
              <p>{m[code as keyof typeof m] ?? code}</p>
            {/each}
          </dd>
        </div>
        {#if result.matchedRuleId}
          <div>
            <dt class="font-medium">{m.matchedRule}</dt>
            <dd class="break-all"><code>{result.matchedRuleId}</code></dd>
          </div>
        {/if}
      </dl>
    {:else}
      <p class="text-sm text-muted">{m.help}</p>
    {/if}
  </section>
</div>
