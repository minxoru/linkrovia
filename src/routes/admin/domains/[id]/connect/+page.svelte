<script lang="ts">
  import { brand } from '$lib/brand';
  import { onMount } from 'svelte';
  import '../../../admin-context.css';
  import { invalidateAll } from '$app/navigation';
  import {
    automaticDomainMessages,
    domainMessages,
    domainOperationMessages,
    domainVerificationMessages,
    managementDomainMessages,
  } from '../../messages';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let automatic = $derived(automaticDomainMessages(data.locale));
  let m = $derived(domainMessages(data.locale));
  let managementMessages = $derived(managementDomainMessages(data.locale));
  let operationMessages = $derived(domainOperationMessages(data.locale));
  let verificationMessages = $derived(domainVerificationMessages(data.locale));

  onMount(() => {
    if (form?.operation === 'attach' && form.code === 'attached')
      void connect();
  });
  let busy = $state(false);
  let message = $state('');
  let failed = $state(false);
  let accountId = $state('');
  let zoneId = $state('');
  let token = $state('');
  let diagnosis = $state('');

  const domainPath = $derived(
    `/api/v1/domains/${encodeURIComponent(data.domain.id)}`,
  );

  async function request<Result>(path: string, body: unknown): Promise<Result> {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': data.csrfToken,
      },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = result as { code?: string } | null;
      throw new Error(problem?.code ?? 'request_failed');
    }
    return result as Result;
  }
  async function probe(url: string) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const result = (await response.json().catch(() => null)) as {
        proof?: unknown;
      } | null;
      return typeof result?.proof === 'string' && result.proof.length > 0
        ? result.proof
        : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }
  async function connect() {
    busy = true;
    failed = false;
    message = m.checking;
    try {
      const { ticket, url } = await request<{ ticket: string; url: string }>(
        `${domainPath}/connect`,
        { confirmed: true },
      );
      const proof = await probe(url);
      if (!proof) throw new Error('proof_unavailable');
      const result = await request<{ status: string }>(`${domainPath}/verify`, {
        ticket,
        proof,
      });
      message = result.status === 'active' ? m.ready : m.failed;
      failed = result.status !== 'active';
      await invalidateAll();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      message =
        code === 'https_required'
          ? m.httpsOnly
          : (verificationMessages[code] ?? m.failed);
      failed = true;
    } finally {
      busy = false;
    }
  }
  async function disconnect() {
    if (!window.confirm(m.disconnectConfirm)) return;
    busy = true;
    failed = false;
    try {
      await request(`${domainPath}/disconnect`, {
        confirmed: true,
        version: data.domain.version,
      });
      message = m.disconnected;
      await invalidateAll();
    } catch {
      message = m.failed;
      failed = true;
    } finally {
      busy = false;
    }
  }
  async function diagnose() {
    busy = true;
    diagnosis = '';
    try {
      const result = await request<{ code: string }>(
        '/api/v1/domains/preflight',
        {
          hostname: data.domain.hostname,
          accountId,
          zoneId,
          token,
        },
      );
      diagnosis =
        result.code === 'ready'
          ? automatic.preflightReady
          : result.code === 'attached'
            ? automatic.preflightAttached
            : (operationMessages[result.code] ?? automatic.preflightFailed);
    } catch (error) {
      diagnosis =
        error instanceof Error
          ? (operationMessages[error.message] ?? automatic.preflightFailed)
          : automatic.preflightFailed;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{m.wizardTitle} · {brand.name}</title></svelte:head>
<div class="admin-page">
  <header class="context-header space-y-3">
    <h1 class="text-3xl font-semibold tracking-tight">{m.wizardTitle}</h1>
    <p>{m.wizardIntro}</p>
    <dl class="context-panel grid gap-4 text-sm">
      <div class="min-w-0 space-y-1">
        <dt class="font-medium">{m.hostname}</dt>
        <dd class="break-all font-mono">{data.domain.hostname}</dd>
      </div>
      <div class="space-y-1">
        <dt class="font-medium">{m.connection}</dt>
        <dd>{m.statuses[data.domain.status] ?? m.checking}</dd>
      </div>
    </dl>
  </header>

  {#if data.isOwner && data.domain.hostname !== data.managementHostname}
    <div class="admin-section-stack">
      {#if data.domain.status !== 'active'}
        <section class="context-panel space-y-4">
          <h2 class="text-xl font-semibold">{automatic.title}</h2>
          <p>{automatic.intro}</p>
          <p class="text-sm">{operationMessages.scopes}</p>
          <a
            href="https://dash.cloudflare.com/profile/api-tokens"
            target="_blank"
            rel="noreferrer"
            class="text-link underline"
          >
            {operationMessages.tokenLink}
          </a>
          <form
            method="POST"
            action="?/attach"
            autocomplete="off"
            class="space-y-3"
          >
            <input type="hidden" name="csrfToken" value={data.csrfToken} />
            <input type="hidden" name="version" value={data.domain.version} />
            <label class="block">
              <span class="mb-1 block font-medium">{m.token}</span>
              <input
                name="token"
                bind:value={token}
                type="password"
                required
                autocomplete="new-password"
                class="admin-control w-full"
              />
            </label>
            <p class="text-sm">{m.tokenWarning}</p>
            <details>
              <summary class="cursor-pointer font-medium">{m.advanced}</summary>
              <p class="text-sm">{automatic.optionalIds}</p>
              <label class="block">
                <span class="mb-1 block font-medium">{m.accountId}</span>
                <input
                  name="accountId"
                  bind:value={accountId}
                  autocomplete="off"
                  class="admin-control w-full"
                />
              </label>
              <label class="block">
                <span class="mb-1 block font-medium">{m.zoneId}</span>
                <input
                  name="zoneId"
                  bind:value={zoneId}
                  autocomplete="off"
                  class="admin-control w-full"
                />
              </label>
            </details>
            <button
              type="button"
              disabled={busy || !token || !!accountId !== !!zoneId}
              onclick={diagnose}
              class="admin-button"
            >
              {busy ? m.checking : automatic.preflight}
            </button>
            {#if diagnosis}<p role="status">{diagnosis}</p>{/if}
            <label class="flex items-start gap-2">
              <input type="checkbox" name="confirmed" required class="mt-1" />
              <span>
                {automatic.confirm}
                <strong class="break-all">{data.domain.hostname}</strong>
              </span>
            </label>
            <button type="submit" class="admin-button admin-button-primary">
              {automatic.attach}
            </button>
          </form>
          {#if form?.operation === 'attach'}
            <p
              role={form.code === 'attached' ? 'status' : 'alert'}
              class={form.code === 'attached'
                ? 'text-positive'
                : 'text-negative'}
            >
              {form.code === 'attached'
                ? automatic.attached
                : (operationMessages[form.code] ?? automatic.error)}
            </p>
          {/if}
          {#if data.domain.status === 'provisioning' || data.domain.status === 'verifying'}
            <p role="status">{automatic.pending}</p>
          {/if}
        </section>
      {/if}
      <div class="admin-section-stack">
        <details class="context-panel space-y-4">
          <summary class="cursor-pointer text-xl font-semibold">
            {automatic.manual}
          </summary>
          <h2 class="text-xl font-semibold">Cloudflare Workers &amp; Pages</h2>
          <ol class="list-decimal space-y-2 pl-5">
            <li>
              <a
                href="https://dash.cloudflare.com/?to=/:account/workers-and-pages"
                target="_blank"
                rel="noreferrer"
                class="text-link underline"
              >
                {m.cloudflareSteps[0]}
              </a>
            </li>
            {#each m.cloudflareSteps.slice(1) as step (step)}<li>
                {step}
              </li>{/each}
          </ol>
          <p class="text-sm">{m.automatic}</p>
          <p class="text-sm">{m.externalDns}</p>
          <p class="text-sm font-medium">{m.noWorkersCname}</p>
        </details>
        <section class="context-panel space-y-4">
          <h2 class="text-xl font-semibold">{m.checkConnection}</h2>
          <p class="text-sm">{m.httpsOnly}</p>
          <button
            type="button"
            disabled={busy}
            onclick={connect}
            class="admin-button admin-button-primary"
          >
            {busy ? m.checking : m.checkConnection}
          </button>
          {#if message}<p
              role={failed ? 'alert' : 'status'}
              class={failed ? 'text-negative' : 'text-positive'}
            >
              {message}
            </p>{/if}
        </section>
      </div>
    </div>
    {#if data.managementAvailable && data.domain.status === 'active' && data.domain.verifiedAt && data.domain.providerMode === 'cloudflare_custom_domain'}
      <section class="context-panel space-y-4">
        <h2 class="text-xl font-semibold">{managementMessages.title}</h2>
        <p>{managementMessages.description}</p>
        <form method="POST" action="?/management" class="space-y-3">
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <input
            type="hidden"
            name="enabled"
            value={data.domain.managementEnabled ? '0' : '1'}
          />
          <p>
            {data.domain.managementEnabled
              ? managementMessages.enabled
              : managementMessages.disabled}
          </p>
          <button type="submit" class="admin-button">
            {data.domain.managementEnabled
              ? managementMessages.disable
              : managementMessages.enable}
          </button>
        </form>
        {#if form?.operation === 'management'}
          <p role={form.code === 'saved' ? 'status' : 'alert'}>
            {form.code === 'saved'
              ? managementMessages.saved
              : managementMessages.error}
          </p>
        {/if}
      </section>
    {/if}
    {#if data.domain.managed}
      <details
        open={form?.operation === 'detach'}
        class="context-panel space-y-4"
      >
        <summary class="cursor-pointer text-xl font-semibold">
          {automatic.detachTitle}
        </summary>
        <p class="text-sm">{operationMessages.scopes}</p>
        <a
          href="https://dash.cloudflare.com/profile/api-tokens"
          target="_blank"
          rel="noreferrer"
          class="text-link underline"
        >
          {operationMessages.tokenLink}
        </a>
        <form
          method="POST"
          action="?/detach"
          autocomplete="off"
          class="space-y-3"
        >
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <input type="hidden" name="version" value={data.domain.version} />
          <details>
            <summary class="cursor-pointer font-medium">{m.advanced}</summary>
            <p class="text-sm">{automatic.optionalIds}</p>
            <label class="block">
              <span class="mb-1 block font-medium">{m.accountId}</span><input
                name="accountId"
                autocomplete="off"
                class="admin-control w-full"
              />
            </label>
            <label class="block">
              <span class="mb-1 block font-medium">{m.zoneId}</span><input
                name="zoneId"
                autocomplete="off"
                class="admin-control w-full"
              />
            </label>
          </details>
          <label class="block">
            <span class="mb-1 block font-medium">{m.token}</span><input
              name="token"
              type="password"
              required
              autocomplete="new-password"
              class="admin-control w-full"
            />
          </label>
          <p class="text-sm">{m.tokenWarning}</p>
          <label class="flex items-start gap-2">
            <input
              type="checkbox"
              name="confirmed"
              required
              class="mt-1"
            /><span>
              {automatic.detachConfirm}
              <strong class="break-all">{data.domain.hostname}</strong>
            </span>
          </label>
          <button type="submit" class="admin-button">
            {automatic.detachButton}
          </button>
        </form>
      </details>
    {/if}
    {#if form?.operation === 'detach'}
      <p
        role={form.code === 'detached' ? 'status' : 'alert'}
        class={form.code === 'detached' ? 'text-positive' : 'text-negative'}
      >
        {form.code === 'detached'
          ? automatic.detached
          : (operationMessages[form.code] ?? automatic.error)}
      </p>
    {/if}
    {#if data.domain.status === 'active'}<details
        class="context-panel space-y-3"
      >
        <summary class="cursor-pointer font-semibold">{m.disconnect}</summary>
        <button
          type="button"
          disabled={busy}
          onclick={disconnect}
          class="admin-button admin-button-danger"
        >
          {m.disconnect}
        </button>
      </details>{/if}
  {:else}
    <p class="rounded-md border border-line p-4" role="note">{m.readOnly}</p>
  {/if}
</div>
