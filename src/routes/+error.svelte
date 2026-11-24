<script lang="ts">
  import { page } from '$app/state';
  import { brand } from '$lib/brand';
  import Brand from '$lib/components/Brand.svelte';
  import { protectionMessages } from '$lib/i18n/protection';
  import { messagesFor, resolveLocale } from '$lib/i18n/locale';
  import { landingCopy } from '$lib/i18n/landing';

  let locale = $derived(resolveLocale(page.data.locale, null));
  let text = $derived(
    page.status === 404 || page.status === 410
      ? protectionMessages(locale).unavailable
      : messagesFor(locale)['error.generic'],
  );
</script>

<svelte:head><title>{page.status} · {brand.name}</title></svelte:head>

<main
  class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10"
>
  <div><Brand /></div>
  <section class="rounded-xl border border-line bg-surface p-8">
    <h1 class="text-3xl font-bold">{page.status}</h1>
    <p class="mt-3 text-muted">{text}</p>
    <a class="mt-6 inline-block font-semibold text-link underline" href="/">
      {landingCopy[locale].home}
    </a>
  </section>
</main>
