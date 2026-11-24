<script lang="ts">
  import { brand } from '$lib/brand';
  import { messagesFor } from '$lib/i18n/locale';
  import AuthFrame from '$lib/components/auth/AuthFrame.svelte';
  import PasskeyForm from '$lib/components/auth/PasskeyForm.svelte';
  import TurnstileWidget from '$lib/components/security/TurnstileWidget.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let messages = $derived(messagesFor(data.locale));
  let errorMessage = $derived.by(() => {
    switch (form?.code) {
      case 'invalid_credentials':
        return messages['error.invalid_credentials'];
      case 'invalid_input':
        return messages['error.invalid_input'];
      case 'unavailable':
        return messages['error.unavailable'];
      case 'rate_limit':
        return messages['error.rate_limit'];
      case 'turnstile':
        return messages['error.turnstile'];
      case 'csrf':
        return messages['error.csrf'];
      case 'setup_required':
        return messages['error.setup_required'];
      default:
        return form?.code ? messages['error.generic'] : '';
    }
  });
</script>

<svelte:head>
  <title>{messages['login.title']} · {brand.name}</title>
</svelte:head>
<AuthFrame
  title={messages['login.title']}
  description={data.transferAvailable
    ? messages['login.transferHelp']
    : messages['login.subtitle']}
>
  {#if data.transferAvailable}
    <a
      class="inline-block rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
      href="/login/transfer/start"
      data-sveltekit-reload
    >
      {messages['login.transferContinue']}
    </a>
  {:else}<div class="space-y-8">
      {#if data.passkeyAvailable}<PasskeyForm
          mode="login"
          locale={data.locale}
          turnstile={data.turnstile}
        />{/if}
      {#if data.passwordAvailable}
        <details
          open={!data.passkeyAvailable || Boolean(errorMessage)}
          class="space-y-5"
          class:sole-method={!data.passkeyAvailable}
        >
          <summary class="cursor-pointer font-medium">
            {messages['passkey.password']}
          </summary>
          <form method="POST" class="space-y-5">
            <div class="space-y-2">
              <label for="email" class="block font-medium">
                {messages['auth.email']}
              </label><input
                id="email"
                name="email"
                type="email"
                required
                autocomplete="username"
                class="w-full rounded-md border border-control bg-surface px-3 py-2"
              />
            </div>
            <div class="space-y-2">
              <label for="password" class="block font-medium">
                {messages['auth.password']}
              </label><input
                id="password"
                name="password"
                type="password"
                required
                autocomplete="current-password"
                class="w-full rounded-md border border-control bg-surface px-3 py-2"
              />
            </div>
            {#if data.turnstile}<TurnstileWidget
                siteKey={data.turnstile.siteKey}
                action="login"
                locale={data.locale}
              />{/if}
            {#if errorMessage}<p role="alert" class="text-negative">
                {errorMessage}
              </p>{/if}
            <button
              class="rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
              type="submit"
            >
              {messages['login.submit']}
            </button>
          </form>
        </details>
      {:else if !data.passkeyAvailable}<p role="alert">
          {messages['passkey.noMethods']}
        </p>{/if}
    </div>{/if}
</AuthFrame>

<style>
  .sole-method > summary {
    display: none;
  }
  .sole-method > form {
    margin-block-start: 0;
  }
</style>
