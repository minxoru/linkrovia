<script lang="ts">
  import { onMount } from 'svelte';
  import type { Locale } from '$lib/i18n/locale';
  import { messagesFor } from '$lib/i18n/locale';
  import TurnstileWidget from '$lib/components/security/TurnstileWidget.svelte';
  import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
  } from '@simplewebauthn/browser';

  let {
    mode,
    locale,
    turnstile = null,
    inviteCode = '',
    invalidInvite = '',
    registeredWithoutSession = '',
  }: {
    mode: 'setup' | 'login' | 'invite';
    locale: Locale;
    inviteCode?: string;
    invalidInvite?: string;
    registeredWithoutSession?: string;
    turnstile?: { siteKey: string } | null;
  } = $props();
  let endpoint = $derived(
    mode === 'invite' ? '/invite/admin/passkey' : `/${mode}/passkey`,
  );
  let messages = $derived(messagesFor(locale));
  let busy = $state(false);
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  let issue = $state('');
  let needsSignIn = $state(false);
  let resetKey = $state(0);

  function errorText(code: string): string {
    switch (code) {
      case 'csrf':
        return messages['error.csrf'];
      case 'unavailable':
        return messages['error.unavailable'];
      case 'rate_limit':
        return messages['error.rate_limit'];
      case 'invalid_input':
        return messages['error.invalid_input'];
      case 'invalid_token':
        return mode === 'invite'
          ? invalidInvite
          : messages['error.invalid_token'];
      case 'registered_without_session':
        return registeredWithoutSession;
      case 'signed_in':
        return messages['error.generic'];
      case 'turnstile':
        return messages['error.turnstile'];
      case 'invalid_credentials':
        return messages['error.invalid_credentials'];
      default:
        return messages['passkey.cancelled'];
    }
  }
  async function post(
    body: object,
  ): Promise<{ options?: unknown; redirect?: string }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'invite' ? { ...body, code: inviteCode } : body,
      ),
      credentials: 'same-origin',
    });
    const result = (await response.json()) as {
      code?: string;
      options?: unknown;
      redirect?: string;
    };
    if (!response.ok) throw new Error(result.code || 'error');
    return result;
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    if (!window.isSecureContext || !window.PublicKeyCredential) {
      issue = messages['passkey.unavailable'];
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    busy = true;
    issue = '';
    try {
      const token = fields.get('cf-turnstile-response');
      const begin = await post(
        mode === 'setup'
          ? { step: 'begin', email: fields.get('email') }
          : mode === 'invite'
            ? { step: 'begin' }
            : {
                step: 'begin',
                turnstileToken: typeof token === 'string' ? token : undefined,
              },
      );
      if (!begin.options) throw new Error('unavailable');
      const browser = await import('@simplewebauthn/browser');
      const response =
        mode !== 'login'
          ? await browser.startRegistration({
              optionsJSON:
                begin.options as PublicKeyCredentialCreationOptionsJSON,
            })
          : await browser.startAuthentication({
              optionsJSON:
                begin.options as PublicKeyCredentialRequestOptionsJSON,
            });
      const finish = await post({ step: 'finish', response });
      const destination = finish.redirect;
      if (
        destination !== '/admin' &&
        !(mode === 'login' && destination === '/login/transfer/finish')
      ) {
        throw new Error('unavailable');
      }
      if (mode === 'invite') window.location.replace(destination);
      else window.location.assign(destination);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'error';
      needsSignIn = code === 'registered_without_session';
      issue = errorText(code);
      resetKey += 1;
    } finally {
      busy = false;
    }
  }
</script>

<form method="POST" action={endpoint} onsubmit={submit} class="space-y-5">
  <p>
    {mode !== 'login'
      ? messages['passkey.createHelp']
      : messages['passkey.loginHelp']}
  </p>
  {#if mode === 'setup'}<div class="space-y-2">
      <label for="passkey-email" class="block font-medium">
        {messages['auth.email']}
      </label><input
        id="passkey-email"
        name="email"
        type="email"
        required
        autocomplete="email"
        class="w-full rounded-md border border-control bg-surface px-3 py-2"
      />
    </div>{/if}
  {#if mode === 'login' && turnstile}<TurnstileWidget
      siteKey={turnstile.siteKey}
      action="login"
      {locale}
      {resetKey}
    />{/if}
  {#if issue}<p role="alert" class="text-negative">
      {issue}
    </p>{/if}
  {#if needsSignIn}
    <a class="text-primary underline" href="/login">
      {messages['login.submit']}
    </a>
  {:else}
    <button
      type="submit"
      disabled={busy || !hydrated}
      class="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
    >
      {busy
        ? messages['passkey.busy']
        : mode !== 'login'
          ? messages['passkey.create']
          : messages['passkey.login']}
    </button>
  {/if}
  <noscript><p>{messages['passkey.javascript']}</p></noscript>
</form>
