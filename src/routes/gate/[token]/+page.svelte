<script lang="ts">
  import { brand } from '$lib/brand';
  import AuthFrame from '$lib/components/auth/AuthFrame.svelte';
  import TurnstileWidget from '$lib/components/security/TurnstileWidget.svelte';
  import { messagesFor } from '$lib/i18n/locale';
  import { protectionMessages } from '$lib/i18n/protection';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(protectionMessages(data.locale));
  let common = $derived(messagesFor(data.locale));
  let message = $derived(
    form?.code === 'rate_limit'
      ? common['error.rate_limit']
      : form?.code === 'turnstile'
        ? common['error.turnstile']
        : form?.code === 'csrf'
          ? common['error.csrf']
          : form?.code
            ? m.unlockFailed
            : null,
  );
</script>

<svelte:head>
  <title>{m.openLink} · {brand.name}</title>
  {#if data.nextPath}<meta
      http-equiv="refresh"
      content={`0;url=${data.nextPath}`}
    />{/if}
</svelte:head>
<AuthFrame
  title={m.openLink}
  description={data.oneTime ? m.oneTimeNotice : m.passwordNotice}
>
  {#if data.nextPath}
    <a href={data.nextPath} class="font-medium text-link underline">
      {m.continue}
    </a>
  {:else}
    <form method="POST" class="space-y-5">
      <input type="hidden" name="csrfToken" value={data.csrfToken} />
      {#if data.needsPassword}
        <label class="block space-y-2">
          <span class="block font-medium">{common['auth.password']}</span>
          <input
            name="password"
            type="password"
            required
            autocomplete="current-password"
            maxlength="128"
            class="w-full px-3 py-2"
          />
        </label>
      {/if}
      {#if data.turnstile}
        <TurnstileWidget
          siteKey={data.turnstile.siteKey}
          action="link_gate"
          locale={data.locale}
        />
      {/if}
      {#if message}<p class="text-negative" role="alert">
          {message}
        </p>{/if}
      <button type="submit" class="w-full font-medium">{m.continue}</button>
    </form>
  {/if}
</AuthFrame>
