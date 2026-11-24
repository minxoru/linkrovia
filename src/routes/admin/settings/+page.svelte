<script lang="ts">
  import { adminInviteMessages } from '$lib/i18n/admin-invites';
  import { apiKeyMessages } from '../api-keys/messages';
  import { backupMessages } from '../backup/messages';
  import { domainMessages } from '../domains/messages';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { healthMessages } from './health/messages';
  import { brand } from '$lib/brand';
  import { messagesFor } from '$lib/i18n/locale';
  import '../admin-context.css';
  import { locales, localeNames } from '$lib/i18n/locale';
  import { preferenceMessages } from '$lib/i18n/preferences';
  import { themes } from '$lib/theme/theme';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let m = $derived(preferenceMessages(data.locale));
  let userZone = $derived(data.userZone);
  let defaultZone = $derived(data.defaultZone);
  const scopeLabels = {
    en: ['Personal preferences', 'Instance defaults'],
    ja: ['個人の設定', '導入先全体の既定値'],
    'zh-CN': ['个人偏好', '实例默认设置'],
    'zh-TW': ['個人偏好', '執行個體預設設定'],
    es: ['Preferencias personales', 'Valores predeterminados de la instancia'],
    it: ['Preferenze personali', 'Impostazioni predefinite dell’istanza'],
    fr: ['Préférences personnelles', 'Valeurs par défaut de l’instance'],
  } as const;
  let scopes = $derived(scopeLabels[data.locale]);
  const directoryLabels = {
    en: ['Access and integrations', 'Instance operations'],
    ja: ['アクセスと連携', 'インスタンスの運用'],
    'zh-CN': ['访问与集成', '实例运维'],
    'zh-TW': ['存取與整合', '執行個體維運'],
    es: ['Acceso e integraciones', 'Operaciones de la instancia'],
    it: ['Accesso e integrazioni', 'Operazioni dell’istanza'],
    fr: ['Accès et intégrations', 'Exploitation de l’instance'],
  } as const;
  let [access, operations] = $derived(directoryLabels[data.locale]);
  let directories = $derived([
    {
      label: access,
      entries: [
        { href: '/admin/api-keys', label: apiKeyMessages(data.locale).title },
        ...(data.isOwner
          ? [
              {
                href: '/admin/settings/security',
                label: messagesFor(data.locale)['admin.security'],
              },
              {
                href: '/admin/settings/admins',
                label: adminInviteMessages[data.locale].title,
              },
              { href: '/admin/integrations/mcp', label: 'MCP' },
            ]
          : []),
      ],
    },
    {
      label: operations,
      entries: [
        { href: '/admin/domains', label: domainMessages(data.locale).domains },
        ...(data.isOwner
          ? [
              {
                href: '/admin/settings/health',
                label: healthMessages(data.locale).title,
              },
              {
                href: '/admin/backup',
                label: backupMessages(data.locale).title,
              },
            ]
          : []),
      ],
    },
  ]);

  function zoneExamples(zone: string) {
    if (!data.timeZones.includes(zone)) return [];
    try {
      const format = new Intl.DateTimeFormat(data.locale, {
        timeZone: zone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'shortOffset',
      });
      const example = new Date(data.previewAt);
      const year = example.getUTCFullYear();
      const january = Date.UTC(year, 0, 15, 12);
      const july = Date.UTC(year, 6, 15, 12);
      const offset = (date: number) =>
        format.formatToParts(date).find(({ type }) => type === 'timeZoneName')
          ?.value;
      return offset(january) === offset(july)
        ? [format.format(example)]
        : [format.format(example), format.format(january), format.format(july)];
    } catch {
      return [];
    }
  }
</script>

<svelte:head><title>{m.settings} · {brand.name}</title></svelte:head>
<div class="admin-page">
  <header class="context-header">
    <h1>{m.settings}</h1>
  </header>
  <datalist id="time-zones">
    {#each data.timeZones as zone (zone)}<option
        value={zone}
        label={zone.replaceAll('_', ' ').replaceAll('/', ' · ')}
      ></option>{/each}
  </datalist>
  <div class="admin-section-stack">
    <form
      id="personal-preferences"
      aria-labelledby="personal-preferences-heading"
      method="POST"
      action="?/personal"
      class="context-panel scroll-mt-24 space-y-5"
    >
      <input type="hidden" name="csrfToken" value={data.csrfToken} />
      <div class="admin-section-header">
        <h2 id="personal-preferences-heading">
          {scopes[0]}
        </h2>
        <p class="text-sm text-muted">{m.intro}</p>
      </div>
      <p class="text-sm text-muted">{m.effective}: {data.timeZone}</p>
      <div class="space-y-2">
        <label for="locale" class="block font-medium">
          {m.language}
        </label><select id="locale" name="locale" class="admin-control w-full">
          {#each locales as locale (locale)}<option
              value={locale}
              lang={locale}
              selected={locale === data.locale}
            >
              {localeNames[locale]}
            </option>{/each}
        </select>
      </div>
      <div class="space-y-2">
        <label for="timezone" class="block font-medium">
          {m.userZone}
        </label><input
          id="timezone"
          name="timezone"
          type="text"
          list="time-zones"
          bind:value={userZone}
          aria-describedby="user-zone-help user-zone-example"
          autocomplete="off"
          class="admin-control w-full"
        />
        <p id="user-zone-help" class="text-sm text-muted">
          {m.userHelp}
        </p>
        <p
          id="user-zone-example"
          class="text-sm text-muted tabular-nums"
          aria-live="polite"
        >
          {zoneExamples(userZone || data.defaultZone).join(' · ')}
        </p>
      </div>
      <div class="space-y-2">
        <label for="theme" class="block font-medium">{m.appearance}</label>
        <select id="theme" name="theme" class="admin-control w-full">
          {#each themes as theme (theme)}
            <option value={theme} selected={theme === data.theme}>
              {m[`${theme}Theme`]}
            </option>
          {/each}
        </select>
      </div>
      <div class="admin-form-footer">
        {#if form?.section === 'personal'}
          <p role="alert" class="text-negative">{m.invalid}</p>
        {:else if data.saved === 'personal'}
          <p role="status">{m.saved}</p>
        {/if}
        <button type="submit" class="admin-button admin-button-primary">
          {m.save}
        </button>
      </div>
    </form>
    {#if data.isOwner}<form
        method="POST"
        action="?/defaultZone"
        aria-labelledby="instance-defaults-heading"
        class="context-panel space-y-5"
      >
        <input type="hidden" name="csrfToken" value={data.csrfToken} />
        <div class="admin-section-header">
          <h2 id="instance-defaults-heading">{scopes[1]}</h2>
        </div>
        <div class="space-y-2">
          <label for="default-timezone" class="block font-medium">
            {m.defaultZone}
          </label><input
            id="default-timezone"
            name="timezone"
            type="text"
            required
            list="time-zones"
            bind:value={defaultZone}
            aria-describedby="default-zone-help default-zone-example"
            autocomplete="off"
            class="admin-control w-full"
          />
          <p id="default-zone-help" class="text-sm text-muted">
            {m.defaultHelp}
          </p>
          <p
            id="default-zone-example"
            class="text-sm text-muted tabular-nums"
            aria-live="polite"
          >
            {zoneExamples(defaultZone).join(' · ')}
          </p>
        </div>
        <div class="space-y-2">
          <label for="default-locale" class="block font-medium">
            {m.defaultLanguage}
          </label>
          <select
            id="default-locale"
            name="defaultLocale"
            aria-describedby="default-locale-help"
            class="admin-control w-full"
          >
            {#each locales as locale (locale)}<option
                value={locale}
                lang={locale}
                selected={locale === data.defaultLocale}
              >
                {localeNames[locale]}
              </option>{/each}
          </select>
          <p id="default-locale-help" class="text-sm text-muted">
            {m.defaultLanguageHelp}
          </p>
        </div>
        <div class="admin-form-footer">
          {#if form?.section === 'global'}
            <p role="alert" class="text-negative">{m.invalidZone}</p>
          {:else if data.saved === 'global'}
            <p role="status">{m.globalSaved}</p>
          {/if}
          <button type="submit" class="admin-button admin-button-primary">
            {m.save}
          </button>
        </div>
      </form>{/if}
    <nav class="context-panel admin-section-stack" aria-label={m.settings}>
      {#each directories as directory (directory.label)}
        <section class="space-y-1" aria-label={directory.label}>
          <div class="admin-section-header">
            <h2>{directory.label}</h2>
          </div>
          <ul class="divide-y divide-line">
            {#each directory.entries as entry (entry.href)}
              <li>
                <a
                  href={entry.href}
                  class="flex items-center justify-between gap-4 min-h-11 py-2 font-medium text-link hover:underline"
                >
                  <span>{entry.label}</span>
                  <ArrowRight size={16} aria-hidden="true" class="shrink-0" />
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </nav>
  </div>
</div>
