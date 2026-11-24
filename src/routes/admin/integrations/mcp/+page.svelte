<script lang="ts">
  import { brand } from '$lib/brand';
  import Clipboard from '@lucide/svelte/icons/clipboard';
  import { onMount } from 'svelte';
  import type { Locale } from '$lib/i18n/locale';
  import type { PageProps } from './$types';
  import { mcpClientConfigurations } from './clients';
  import { mcpMessages } from './messages';

  let { data }: PageProps = $props();
  let copy = $derived(mcpMessages[data.locale]);
  let clients = $derived(
    mcpClientConfigurations(data.endpoint, copy.tokenPrompt),
  );
  let copyFeedback = $state<{ id: string; copied: boolean } | null>(null);
  let clipboardReady = $state(false);
  onMount(() => {
    clipboardReady = typeof navigator.clipboard?.writeText === 'function';
  });
  const clipboard = {
    en: [
      'Copy configuration',
      'Configuration copied.',
      'Select and copy the configuration manually.',
    ],
    ja: [
      '設定をコピー',
      '設定をコピーしました。',
      '設定のテキストを選択してコピーしてください。',
    ],
    'zh-CN': ['复制配置', '已复制配置。', '请选择配置文本并手动复制。'],
    'zh-TW': ['複製設定', '已複製設定。', '請選取設定文字並手動複製。'],
    es: [
      'Copiar configuración',
      'Configuración copiada.',
      'Selecciona y copia la configuración manualmente.',
    ],
    it: [
      'Copia configurazione',
      'Configurazione copiata.',
      'Seleziona e copia la configurazione manualmente.',
    ],
    fr: [
      'Copier la configuration',
      'Configuration copiée.',
      'Sélectionnez et copiez la configuration manuellement.',
    ],
  } satisfies Record<Locale, readonly [string, string, string]>;
  let clipboardText = $derived(clipboard[data.locale]);

  async function copyConfiguration(id: string, configuration: string) {
    try {
      await navigator.clipboard.writeText(configuration);
      copyFeedback = { id, copied: true };
    } catch {
      copyFeedback = { id, copied: false };
    }
  }
</script>

<svelte:head><title>MCP · {brand.name}</title></svelte:head>

<div class="admin-page">
  <header class="context-header space-y-2">
    <h1>MCP</h1>
    <p>{copy.client}</p>
  </header>

  <div class="admin-section-stack">
    <div class="admin-section-stack">
      <section class="context-panel min-w-0 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">
            {data.enabled ? copy.enabled : copy.disabled}
          </h2>
          <form method="POST">
            <input type="hidden" name="csrfToken" value={data.csrfToken} />
            <input type="hidden" name="enabled" value={String(!data.enabled)} />
            <button
              type="submit"
              class={[
                'admin-button',
                data.enabled ? 'admin-button-danger' : 'admin-button-primary',
              ]}
            >
              {data.enabled ? copy.disable : copy.enable}
            </button>
          </form>
        </div>
        <label class="grid gap-2">
          <span class="font-medium">{copy.endpoint}</span>
          <input
            readonly
            value={data.endpoint}
            onfocus={(event) => event.currentTarget.select()}
            class="admin-control w-full min-w-0 font-mono"
          />
        </label>
        <p>{copy.connect}</p>
        <a class="admin-button" href="/admin/api-keys">
          {copy.keys} <span aria-hidden="true">→</span>
        </a>
      </section>

      <details class="context-panel">
        <summary class="cursor-pointer px-4 py-3 font-medium">
          {copy.tools}
        </summary>
        <ul class="grid gap-2 px-4 pb-4 text-sm">
          {#each data.tools as [name, scope] (name)}
            <li class="flex flex-wrap items-baseline gap-x-3">
              <code>{name}</code>
              <code class="text-muted">{scope}</code>
            </li>
          {/each}
        </ul>
      </details>
    </div>
    <section
      class="context-panel min-w-0 space-y-4"
      aria-labelledby="mcp-clients"
    >
      <div class="space-y-2">
        <h2 id="mcp-clients" class="text-xl font-semibold">{copy.clients}</h2>
        <p>{copy.secret}</p>
      </div>
      <div
        class="divide-y divide-line rounded-xl border border-line bg-surface"
      >
        {#each clients as client (client.id)}
          <details>
            <summary class="cursor-pointer px-4 py-3 font-medium">
              {client.name}
            </summary>
            <div class="min-w-0 space-y-3 px-4 pb-4">
              {#if client.file}
                <p>
                  <code class="break-all text-sm">{client.file}</code>
                </p>
                {#if client.id === 'vsCode'}
                  <p>{copy.vsCode}</p>
                {:else if client.id === 'claudeDesktop'}
                  <p>{copy.claudeDesktop}</p>
                {:else}
                  <p>{copy.environment}</p>
                {/if}
                <p>{copy.merge}</p>
                {#if client.id === 'claudeCode'}
                  <p>{copy.approveClaudeCode}</p>
                {/if}
              {:else}
                <p>{copy.claudeConnector}</p>
                <p>{copy.claudeNetwork}</p>
              {/if}
              <div class="min-w-0 space-y-2">
                <pre
                  class="overflow-x-auto rounded-md border border-line bg-canvas p-3 text-sm"><code
                    >{client.configuration}</code
                  ></pre>
                {#if clipboardReady}<button
                    type="button"
                    class="admin-button"
                    onclick={() =>
                      copyConfiguration(client.id, client.configuration)}
                  >
                    <Clipboard size={15} aria-hidden="true" />{clipboardText[0]}
                  </button>{/if}
                {#if copyFeedback?.id === client.id}
                  <p class="text-sm text-muted" role="status">
                    {clipboardText[copyFeedback.copied ? 1 : 2]}
                  </p>
                {/if}
              </div>
            </div>
          </details>
        {/each}
      </div>
      <p class="text-sm text-muted">{copy.chatgpt}</p>
    </section>
  </div>
</div>
