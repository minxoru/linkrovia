<script module lang="ts">
  type TurnstileApi = {
    render: (
      element: HTMLElement,
      options: {
        sitekey: string;
        action: string;
        language: string;
        size: 'flexible';
        retry: 'never';
        'refresh-expired': 'manual';
        'refresh-timeout': 'manual';
        callback: () => void;
        'error-callback': () => boolean;
        'expired-callback': () => void;
        'timeout-callback': () => void;
        'unsupported-callback': () => void;
      },
    ) => string;
    remove: (widget: string) => void;
  };

  const scriptUrl =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  let scriptLoad: Promise<TurnstileApi> | undefined;

  function loadTurnstile() {
    const browser = window as Window & { turnstile?: TurnstileApi };
    if (browser.turnstile) return Promise.resolve(browser.turnstile);

    scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(
        () => reject(new Error('Turnstile script timed out')),
        12_000,
      );
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timeout);
        if (browser.turnstile) resolve(browser.turnstile);
        else reject(new Error('Turnstile API is unavailable'));
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Turnstile script did not load'));
      };
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      document
        .querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`)
        ?.remove();
      scriptLoad = undefined;
      throw error;
    });

    return scriptLoad;
  }
</script>

<script lang="ts">
  import type { Locale } from '$lib/i18n/locale';
  import type { TurnstileAction } from '$lib/server/security/turnstile';

  let {
    siteKey,
    action,
    locale,
    resetKey = 0,
  }: {
    siteKey: string;
    action: TurnstileAction;
    locale: Locale;
    resetKey?: number;
  } = $props();

  const copies = {
    en: [
      'Verification is unavailable. Try again.',
      'Verification expired. Try again.',
      'Try verification again',
      'Enable JavaScript to complete verification.',
    ],
    ja: [
      '認証を利用できません。もう一度お試しください。',
      '認証の有効期限が切れました。もう一度お試しください。',
      '認証をやり直す',
      '認証を完了するには JavaScript を有効にしてください。',
    ],
    'zh-CN': [
      '暂时无法完成验证，请重试。',
      '验证已过期，请重试。',
      '重新验证',
      '请启用 JavaScript 以完成验证。',
    ],
    'zh-TW': [
      '暫時無法完成驗證，請重試。',
      '驗證已過期，請重試。',
      '重新驗證',
      '請啟用 JavaScript 以完成驗證。',
    ],
    es: [
      'No se pudo completar la verificación. Inténtalo de nuevo.',
      'La verificación ha caducado. Inténtalo de nuevo.',
      'Volver a verificar',
      'Activa JavaScript para completar la verificación.',
    ],
    it: [
      'Verifica non disponibile. Riprova.',
      'La verifica è scaduta. Riprova.',
      'Ripeti la verifica',
      'Abilita JavaScript per completare la verifica.',
    ],
    fr: [
      'La vérification est indisponible. Réessayez.',
      'La vérification a expiré. Réessayez.',
      'Réessayer la vérification',
      'Activez JavaScript pour terminer la vérification.',
    ],
  } satisfies Record<Locale, [string, string, string, string]>;

  let issue = $state<'expired' | 'unavailable' | undefined>();
  let retries = $state(0);
  let copy = $derived(copies[locale]);

  function attachWidget(
    key: string,
    widgetAction: TurnstileAction,
    language: string,
  ) {
    return (element: HTMLElement) => {
      issue = undefined;
      let remove: (() => void) | undefined;
      let active = true;

      loadTurnstile()
        .then((api) => {
          if (!active) return;
          const widget = api.render(element, {
            sitekey: key,
            action: widgetAction,
            language,
            size: 'flexible',
            retry: 'never',
            'refresh-expired': 'manual',
            'refresh-timeout': 'manual',
            callback: () => {
              if (active) issue = undefined;
            },
            'error-callback': () => {
              if (active) issue = 'unavailable';
              return true;
            },
            'expired-callback': () => {
              if (active) issue = 'expired';
            },
            'timeout-callback': () => {
              if (active) issue = 'expired';
            },
            'unsupported-callback': () => {
              if (active) issue = 'unavailable';
            },
          });
          remove = () => api.remove(widget);
        })
        .catch(() => {
          if (active) issue = 'unavailable';
        });

      return () => {
        active = false;
        remove?.();
      };
    };
  }
</script>

{#key resetKey + retries}
  <div {@attach attachWidget(siteKey, action, locale.toLowerCase())}></div>
{/key}
{#if issue}
  <p role="status" class="mt-2 text-sm">
    {issue === 'expired' ? copy[1] : copy[0]}
  </p>
  <button
    type="button"
    class="mt-2 rounded-md border px-3 py-2 text-sm"
    onclick={() => (retries += 1)}
  >
    {copy[2]}
  </button>
{/if}
<noscript>{copy[3]}</noscript>
