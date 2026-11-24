<script lang="ts">
  import { brand } from '$lib/brand';
  import type { PageProps } from './$types';
  import { backupMessages } from './messages';

  type Counts = {
    added: number;
    updated: number;
    skipped: number;
    removed: number;
    locked: number;
    qrRegenerated: number;
    domainsToConnect: number;
  };
  type Preview = { manifest: string; preview: Counts };
  let { data }: PageProps = $props();
  let m = $derived(backupMessages(data.locale));
  let file = $state<File | null>(null);
  let mode = $state<'merge' | 'replace'>('merge');
  let conflict = $state<'skip' | 'overwrite'>('skip');
  let preview = $state.raw<Preview | null>(null);
  let receipt = $state('');
  let confirmed = $state(false);
  let busy = $state(false);
  let issue = $state('');
  let completed = $state(false);
  const countKeys = [
    'added',
    'updated',
    'skipped',
    'removed',
    'locked',
    'qrRegenerated',
    'domainsToConnect',
  ] as const;

  function reset() {
    preview = null;
    receipt = '';
    confirmed = false;
    issue = '';
    completed = false;
  }
  function errorText(code: string) {
    if (['unauthorized', 'forbidden'].includes(code)) return m.auth;
    if (code === 'too_large') return m.tooLarge;
    if (
      [
        'invalid_json',
        'invalid_document',
        'unsupported_version',
        'checksum_mismatch',
        'invalid_options',
      ].includes(code)
    )
      return m.invalid;
    if (['stale_manifest', 'confirmation_required'].includes(code))
      return m.stale;
    return m.error;
  }
  async function checked(response: Response) {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(
        payload &&
          typeof payload === 'object' &&
          'code' in payload &&
          typeof payload.code === 'string'
          ? payload.code
          : 'request_failed',
      );
    }
    return response;
  }
  function save(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'linkrovia-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function download(preRestore = false) {
    if (busy) return;
    busy = true;
    issue = '';
    if (preRestore) {
      receipt = '';
      confirmed = false;
    }
    try {
      const headers: Record<string, string> = {
        'x-csrf-token': data.csrfToken,
      };
      if (preRestore && preview)
        headers['x-backup-manifest'] = preview.manifest;
      const response = await checked(
        await fetch('/api/v1/backup/export', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
        }),
      );
      const blob = await response.blob();
      const token = response.headers.get('x-backup-download');
      if (preRestore && !token) throw new Error('backup_unavailable');
      save(blob);
      if (preRestore && token) receipt = token;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'request_failed';
      issue = errorText(code);
      if (code === 'stale_manifest') {
        preview = null;
        receipt = '';
        confirmed = false;
      }
    } finally {
      busy = false;
    }
  }
  async function validate() {
    if (busy || !file) return;
    reset();
    if (file.size > 128 * 1024) {
      issue = m.tooLarge;
      return;
    }
    busy = true;
    try {
      const query = new URLSearchParams({
        mode,
        conflict: mode === 'replace' ? 'overwrite' : conflict,
      });
      const response = await checked(
        await fetch(`/api/v1/backup/validate?${query}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': data.csrfToken,
          },
          body: file,
        }),
      );
      preview = await response.json();
    } catch (cause) {
      issue = errorText(
        cause instanceof Error ? cause.message : 'request_failed',
      );
    } finally {
      busy = false;
    }
  }
  async function restore() {
    if (
      busy ||
      !file ||
      !preview ||
      (mode === 'replace' && (!receipt || !confirmed))
    )
      return;
    busy = true;
    issue = '';
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-csrf-token': data.csrfToken,
        'x-backup-manifest': preview.manifest,
      };
      if (mode === 'replace') {
        headers['x-backup-download'] = receipt;
        headers['x-backup-confirm'] = 'replace';
      }
      await checked(
        await fetch('/api/v1/backup/restore', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: file,
        }),
      );
      preview = null;
      receipt = '';
      confirmed = false;
      completed = true;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'request_failed';
      issue = errorText(code);
      if (['stale_manifest', 'confirmation_required'].includes(code)) {
        preview = null;
        receipt = '';
        confirmed = false;
      }
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<div class="admin-page">
  <header class="context-header space-y-2">
    <h1>{m.title}</h1>
    <p>{m.intro}</p>
  </header>
  {#if busy}<p role="status">{m.working}</p>{/if}
  {#if issue}<p role="alert">{issue}</p>{/if}
  {#if completed}<p role="status">{m.completed}</p>{/if}
  <div class="admin-section-stack">
    <section class="context-panel space-y-4" aria-labelledby="export-heading">
      <h2 id="export-heading" class="text-xl font-semibold">{m.export}</h2>
      <p>{m.exportHelp}</p>
      <button
        class="admin-button admin-button-primary"
        type="button"
        disabled={busy}
        onclick={() => download()}
      >
        {m.download}
      </button>
    </section>
    <section class="context-panel space-y-5" aria-labelledby="restore-heading">
      <h2 id="restore-heading" class="text-xl font-semibold">{m.restore}</h2>
      <p>{m.restoreHelp}</p>
      <p id="backup-limits" class="text-sm text-muted">{m.limits}</p>
      <div>
        <label for="backup-file" class="block font-semibold">
          {m.file}
        </label><input
          aria-describedby="backup-limits"
          id="backup-file"
          class="admin-control mt-2 block w-full min-w-0"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onchange={(event) => {
            file = event.currentTarget.files?.[0] ?? null;
            reset();
          }}
        />
      </div>
      <div class="grid gap-4">
        <fieldset disabled={busy} class="space-y-2">
          <legend class="font-semibold">{m.mode}</legend>
          <label class="block">
            <input
              type="radio"
              name="mode"
              value="merge"
              checked={mode === 'merge'}
              onchange={() => {
                mode = 'merge';
                reset();
              }}
            />
            {m.merge}
          </label>
          <label class="block">
            <input
              type="radio"
              name="mode"
              value="replace"
              checked={mode === 'replace'}
              onchange={() => {
                mode = 'replace';
                reset();
              }}
            />
            {m.replace}
          </label>
        </fieldset>
        {#if mode === 'merge'}<fieldset disabled={busy} class="space-y-2">
            <legend class="font-semibold">{m.conflict}</legend>
            <label class="block">
              <input
                type="radio"
                name="conflict"
                value="skip"
                checked={conflict === 'skip'}
                onchange={() => {
                  conflict = 'skip';
                  reset();
                }}
              />
              {m.skip}
            </label>
            <label class="block">
              <input
                type="radio"
                name="conflict"
                value="overwrite"
                checked={conflict === 'overwrite'}
                onchange={() => {
                  conflict = 'overwrite';
                  reset();
                }}
              />
              {m.overwrite}
            </label>
          </fieldset>{/if}
      </div>
      <p class="text-sm text-muted">{m.matching}</p>
      {#if mode === 'replace' || conflict === 'overwrite'}<p>
          {m.domainPolicy}
        </p>{/if}
      <p class="rounded-md border border-line bg-canvas p-3 text-sm">
        {m.warnings}
      </p>
      <details class="space-y-3">
        <summary class="cursor-pointer font-medium text-link">
          {m.domainsToConnect}
        </summary>
        <p>{m.domainSteps}</p>
        <p class="flex flex-wrap gap-4">
          <a
            class="text-link underline"
            href="https://dash.cloudflare.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.domainDashboard} ↗
          </a>
          <a class="text-link underline" href="/admin/domains">
            {m.domainManage}
          </a>
          <a
            class="text-link underline"
            href="https://developers.cloudflare.com/workers/configuration/routing/custom-domains/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.domainDocs} ↗
          </a>
        </p>
      </details>
      <button
        class="admin-button admin-button-primary"
        type="button"
        disabled={busy || !file}
        onclick={validate}
      >
        {m.validate}
      </button>
      {#if preview}
        <div class="space-y-4 border-t border-line pt-5" aria-live="polite">
          <h3 class="text-lg font-semibold">{m.preview}</h3>
          <dl class="grid gap-3">
            {#each countKeys as key (key)}<div>
                <dt>{m[key]}</dt>
                <dd class="font-semibold">{preview.preview[key]}</dd>
              </div>{/each}
          </dl>
          {#if mode === 'replace'}<p>{m.preBackupHelp}</p>
            <button
              class="admin-button"
              type="button"
              disabled={busy}
              onclick={() => download(true)}
            >
              {m.preBackup}
            </button>
            <label class="block">
              <input
                type="checkbox"
                bind:checked={confirmed}
                disabled={busy || !receipt}
              />
              {m.confirm}
            </label>{/if}
          <button
            class={[
              'admin-button',
              mode === 'replace'
                ? 'admin-button-danger'
                : 'admin-button-primary',
            ]}
            type="button"
            disabled={busy || (mode === 'replace' && (!receipt || !confirmed))}
            onclick={restore}
          >
            {m.restoreNow}
          </button>
        </div>
      {/if}
    </section>
  </div>
</div>
