<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { brand } from '$lib/brand';
  import { messagesFor } from '$lib/i18n/locale';
  import { adminInviteMessages } from '$lib/i18n/admin-invites';
  import AuthFrame from '$lib/components/auth/AuthFrame.svelte';
  import PasskeyForm from '$lib/components/auth/PasskeyForm.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let messages = $derived(messagesFor(data.locale));
  let m = $derived(adminInviteMessages[data.locale]);
  let code = $state<string | null>(null);

  function readInvitation() {
    if (!window.location.hash) {
      code ??= '';
      return;
    }
    code = window.location.hash.slice(1);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    void goto(cleanUrl, { state: page.state, shallow: true, replace: true });
  }

  onMount(readInvitation);
</script>

<svelte:window onhashchange={readInvitation} />

<svelte:head><title>{m.acceptTitle} · {brand.name}</title></svelte:head>

<AuthFrame title={m.acceptTitle} description={m.acceptIntro}>
  {#if data.signedIn}
    <p>{m.signedIn}</p>
    <p class="mt-4">
      <a
        class="inline-flex min-h-12 items-center rounded-md bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover"
        href="/admin"
      >
        {messages['admin.title']}
      </a>
    </p>
  {:else if !data.available}
    <p role="alert">{messages['passkey.unavailable']}</p>
  {:else if code !== null}
    {#if code.length === 64 && /^[a-f0-9]{64}$/.test(code)}
      <PasskeyForm
        mode="invite"
        locale={data.locale}
        inviteCode={code}
        invalidInvite={m.invalidInvite}
        registeredWithoutSession={m.registeredWithoutSession}
      />
    {:else}
      <p role="alert">{m.invalidInvite}</p>
    {/if}
  {/if}
  <noscript><p>{messages['passkey.javascript']}</p></noscript>
</AuthFrame>
