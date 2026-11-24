<script lang="ts">
  import { onMount } from 'svelte';
  import { brand } from '$lib/brand';
  import { resolve } from '$app/paths';
  import {
    CsvInputError,
    csvPreviewBatchSize,
    maxCsvBytes,
    parseCsv,
  } from '$lib/csv';
  import type { commitCsv, previewCsv } from '$lib/server/links/csv-import';
  import type { PageProps } from './$types';
  import { csvBatches, csvCell } from './spreadsheet';
  import { markPreviewDuplicates } from './preview';
  import { csvMessages } from './messages';

  type Preview = Awaited<ReturnType<typeof previewCsv>>;
  type Row = Preview['rows'][number];
  type Batch = Awaited<ReturnType<typeof commitCsv>>;
  let { data }: PageProps = $props();
  let messages = $derived(csvMessages(data.locale));
  let preview = $state.raw<Preview | null>(null);
  let rows = $state.raw<Row[]>([]);
  let duplicate = $state<'skip' | 'error'>('error');
  let previewPolicy = $state<'skip' | 'error'>('error');
  let interactive = $state(false);
  let busy = $state(false);
  let started = $state(false);
  let issue = $state<string | null>(null);

  onMount(() => {
    interactive = true;
  });

  let remaining = $derived(
    rows.filter((row) => row.status === 'ready' || row.code === 'write_failed'),
  );
  let errors = $derived(rows.filter((row) => row.status === 'error'));
  let destinationColumn = $derived(
    preview?.headers.indexOf('destination_url') ?? -1,
  );

  const example = [
    'destination_url,slug,domain,redirect_type,starts_at,expires_at,tags,ios_url,android_url,title,is_active,rules',
    'https://example.org/launch,launch-campaign,,302,,,"campaign,launch",,,Launch campaign,true,',
  ].join('\r\n');

  function label(code: string) {
    return Object.hasOwn(messages, code)
      ? messages[code as keyof typeof messages]
      : messages.request_failed;
  }

  function rowStatus(row: Row) {
    return row.status === 'error' ? messages.rowError : messages[row.status];
  }

  function resetPreview() {
    preview = null;
    rows = [];
    issue = null;
    started = false;
  }

  async function send<T>(
    mode: 'preview' | 'commit',
    body: BodyInit,
    policy: string,
    zone: string,
  ): Promise<T> {
    const params = new URLSearchParams({ duplicate: policy, tz: zone });
    const result = await fetch(resolve('/admin/import/batch') + '?' + params, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'x-csrf-token': data.csrfToken,
        'x-import-mode': mode,
      },
      body,
    });
    if (!result.ok) {
      const payload = await result.json().catch(() => null);
      throw new Error(
        typeof payload === 'object' &&
          payload !== null &&
          'code' in payload &&
          typeof payload.code === 'string'
          ? payload.code
          : 'request_failed',
      );
    }
    return result.json();
  }

  async function previewFile(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !(event.currentTarget instanceof HTMLFormElement)) return;
    const file = new FormData(event.currentTarget).get('csv');
    resetPreview();
    if (!(file instanceof File) || !file.size) {
      issue = 'invalid_csv';
      return;
    }
    if (file.size > maxCsvBytes) {
      issue = 'file_too_large';
      return;
    }
    busy = true;
    previewPolicy = duplicate;
    try {
      let decoded: string;
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(
          await file.arrayBuffer(),
        );
      } catch {
        throw new CsvInputError('invalid_encoding');
      }
      const fileData = parseCsv(decoded);
      const results: Row[] = [];
      const zone = data.timeZone;
      let lastBatch: Preview | null = null;
      for (const { offset, body } of csvBatches(
        fileData.headers,
        fileData.rows,
        csvPreviewBatchSize,
      )) {
        lastBatch = await send<Preview>('preview', body, previewPolicy, zone);
        results.push(
          ...lastBatch.rows.map((row) => ({ ...row, row: row.row + offset })),
        );
      }
      preview = lastBatch;
      rows = markPreviewDuplicates(results, previewPolicy);
    } catch (cause) {
      issue = cause instanceof Error ? cause.message : 'request_failed';
    } finally {
      busy = false;
    }
  }

  async function importRows() {
    if (!preview || busy) return;
    const { commitBatchSize, headers, timeZone } = preview;
    const candidates = remaining;
    busy = true;
    started = true;
    issue = null;

    try {
      for (const { offset, size, body } of csvBatches(
        headers,
        candidates.map((row) => row.record!),
        commitBatchSize,
      )) {
        const batch = candidates.slice(offset, offset + size);
        const result = await send<Batch>(
          'commit',
          body,
          previewPolicy,
          timeZone,
        );
        const byRow = new Map(
          batch.map((row, index) => [row.row, result.rows[index]]),
        );
        rows = rows.map((row) => {
          const updated = byRow.get(row.row);
          return updated
            ? { ...updated, row: row.row, record: row.record }
            : row;
        });
      }
    } catch (cause) {
      issue = cause instanceof Error ? cause.message : 'request_failed';
    } finally {
      busy = false;
    }
  }

  function download(filename: string, csv: string) {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadErrors() {
    const csv = [
      [
        messages.row,
        messages.slug,
        messages.status,
        messages.detail,
        messages.timeZone,
      ],
      ...errors.map((row) => [
        String(row.row),
        row.slug ?? '',
        rowStatus(row),
        [row.code && label(row.code), row.fields?.join(', ')]
          .filter(Boolean)
          .join(' '),
        preview?.timeZone ?? data.timeZone,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    download('import-errors.csv', csv);
  }
</script>

<svelte:head>
  <title>{messages.title} · {brand.name}</title>
</svelte:head>

<div class="admin-page">
  <header class="context-header space-y-2">
    <h1>{messages.title}</h1>
    <p>{messages.description}</p>
  </header>

  <div class="admin-section-stack">
    <section class="context-panel min-w-0 space-y-5">
      <form class="space-y-5" onsubmit={previewFile}>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <label for="csv-file" class="block text-sm font-semibold">
              {messages.file}
            </label>
            <input
              id="csv-file"
              class="admin-control w-full min-w-0"
              name="csv"
              type="file"
              accept=".csv,text/csv"
              aria-describedby="csv-limits"
              onchange={resetPreview}
              disabled={!interactive || busy}
              required
            />
            <p id="csv-limits" class="text-sm text-muted">
              {messages.limits}
            </p>
          </div>
          <div class="space-y-2">
            <label for="csv-duplicate" class="block text-sm font-semibold">
              {messages.policy}
            </label>
            <select
              id="csv-duplicate"
              bind:value={duplicate}
              onchange={resetPreview}
              disabled={!interactive || busy}
              class="admin-control w-full min-w-0"
            >
              <option value="error">{messages.error}</option>
              <option value="skip">{messages.skip}</option>
            </select>
            <p class="text-sm text-muted">
              {messages.timeZone} · {data.timeZone}
            </p>
          </div>
        </div>
        <div class="admin-form-footer">
          <button
            type="submit"
            class="admin-button admin-button-primary"
            disabled={!interactive || busy}
          >
            {messages.preview}
          </button>
          <button
            type="button"
            class="admin-button"
            disabled={!interactive}
            onclick={() => download('links-example.csv', example)}
          >
            {messages.example}
          </button>
        </div>
      </form>
      <noscript><p class="text-sm">{messages.javascript}</p></noscript>
      {#if issue}
        <p role="alert" class="text-sm font-medium">{label(issue)}</p>
      {/if}
      {#if busy}
        <p role="status" class="text-sm font-medium">{messages.working}</p>
      {/if}
    </section>
    <details class="context-panel space-y-3 text-sm">
      <summary class="cursor-pointer font-semibold text-link">
        {messages.format}
      </summary>
      <p class="mt-3">{messages.required}</p>
      <p>{messages.formats}</p>
      <p>{messages.dateFormat}</p>
      <p
        class="rounded-md border border-line bg-canvas p-2 font-mono wrap-anywhere"
      >
        {example.split('\r\n')[0]}
      </p>
    </details>
  </div>

  {#if preview}
    <section class="context-panel space-y-4" aria-labelledby="csv-results">
      <div
        class="admin-section-header flex flex-wrap items-center justify-between gap-3"
      >
        <h2 id="csv-results">
          {started ? messages.results : messages.preview}
        </h2>
        <div class="flex flex-wrap gap-3">
          {#if errors.length}
            <button type="button" class="admin-button" onclick={downloadErrors}>
              {messages.download}
            </button>
          {/if}
          {#if remaining.length}
            <button
              type="button"
              class="admin-button admin-button-primary"
              onclick={importRows}
              disabled={busy}
            >
              {started ? messages.retry : messages.confirm}
            </button>
          {/if}
        </div>
      </div>
      {#if started && remaining.length && !busy}
        <p class="text-sm text-muted">{messages.retryInfo}</p>
      {/if}
      <div class="overflow-x-auto rounded-xl border border-line bg-surface">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="border-b border-line bg-canvas">
            <tr>
              {#each [messages.row, messages.slug, messages.destination, messages.status, messages.detail] as heading (heading)}
                <th scope="col" class="px-4 py-3 font-semibold">{heading}</th>
              {/each}
            </tr>
          </thead>
          <tbody aria-live="polite" aria-busy={busy}>
            {#each rows as row (row.row)}
              <tr class="border-b border-line align-top last:border-b-0">
                <th scope="row" class="px-4 py-3 font-normal">{row.row}</th>
                <td class="px-4 py-3 font-mono wrap-anywhere">
                  {#if row.id}
                    <a
                      class="underline"
                      href={resolve('/admin/links/[id]', { id: row.id })}
                    >
                      {row.slug}
                    </a>
                  {:else}
                    {row.slug ?? '—'}
                  {/if}
                  {#if row.domain}
                    <span class="block text-xs text-muted">
                      {row.domain}
                    </span>
                  {/if}
                </td>
                <td class="min-w-40 max-w-72 px-4 py-3 wrap-anywhere">
                  {row.record?.[destinationColumn] ?? '—'}
                </td>
                <td class="px-4 py-3 font-semibold">{rowStatus(row)}</td>
                <td class="min-w-32 px-4 py-3">
                  {#if row.code}<span>{label(row.code)}</span>{/if}
                  {#if row.fields}
                    <span class="block font-mono text-xs wrap-anywhere">
                      {row.fields.join(', ')}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
