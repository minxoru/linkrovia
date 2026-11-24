<script lang="ts">
  import { page } from '$app/state';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import Link2 from '@lucide/svelte/icons/link-2';
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import Upload from '@lucide/svelte/icons/upload';
  import Archive from '@lucide/svelte/icons/archive';
  import { backupMessages } from './backup/messages';
  import Route from '@lucide/svelte/icons/route';
  import Globe from '@lucide/svelte/icons/globe';
  import Settings from '@lucide/svelte/icons/settings';
  import Shield from '@lucide/svelte/icons/shield';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import { csvMessages } from './import/messages';
  import Brand from '$lib/components/Brand.svelte';
  import { messagesFor } from '$lib/i18n/locale';
  import { linkMessages } from '$lib/i18n/links';
  import { preferenceMessages } from '$lib/i18n/preferences';
  import type { LayoutProps } from './$types';
  import { adminBreadcrumbs, breadcrumbLabel } from './breadcrumbs';
  import './admin-context.css';

  let { data, children }: LayoutProps = $props();
  let messages = $derived(messagesFor(data.locale));
  let links = $derived(linkMessages(data.locale));
  let preferences = $derived(preferenceMessages(data.locale));
  let nav = $derived([
    {
      href: '/admin',
      label: messages['admin.overview'],
      icon: LayoutDashboard,
    },
    { href: '/admin/links', label: links.links, icon: Link2 },
    {
      href: '/admin/analytics',
      label: analyticsMessages(data.locale).title,
      icon: ChartNoAxesCombined,
    },
    {
      href: '/admin/import',
      label: csvMessages(data.locale).title,
      icon: Upload,
    },
    { href: '/admin/utm', label: 'UTM', icon: Route },
    { href: '/admin/domains', label: links.domains, icon: Globe },
    ...(data.user.role === 'owner'
      ? [
          {
            href: '/admin/backup',
            label: backupMessages(data.locale).title,
            icon: Archive,
          },
          { href: '/admin/integrations/mcp', label: 'MCP', icon: Route },
        ]
      : []),
    { href: '/admin/settings', label: preferences.settings, icon: Settings },
    ...(data.user.role === 'owner'
      ? [
          {
            href: '/admin/settings/security',
            label: messages['admin.security'],
            icon: Shield,
          },
        ]
      : []),
    {
      href: '/admin/api-keys',
      label: messages['admin.apiKeys'],
      icon: KeyRound,
    },
  ]);
  const groupLabels = {
    en: ['Workspace', 'Link tools', 'Instance'],
    ja: ['ワークスペース', 'リンクツール', 'インスタンス'],
    'zh-CN': ['工作区', '链接工具', '实例'],
    'zh-TW': ['工作區', '連結工具', '執行個體'],
    es: ['Espacio de trabajo', 'Herramientas de enlaces', 'Instancia'],
    it: ['Area di lavoro', 'Strumenti per link', 'Istanza'],
    fr: ['Espace de travail', 'Outils de liens', 'Instance'],
  } as const;
  const groupKeys = ['workspace', 'tools', 'instance'] as const;
  type GroupKey = (typeof groupKeys)[number];
  function groupFor(href: string): GroupKey {
    if (
      href === '/admin' ||
      href === '/admin/links' ||
      href === '/admin/analytics'
    )
      return 'workspace';
    if (href === '/admin/import' || href === '/admin/utm') return 'tools';
    return 'instance';
  }
  let groups = $derived(
    groupKeys.map((key, index) => ({
      key,
      label: groupLabels[data.locale][index],
      items: nav.filter((item) => groupFor(item.href) === key),
    })),
  );
  let breadcrumbs = $derived(
    adminBreadcrumbs(
      page.route.id,
      page.url.pathname,
      data.locale,
      page.data.linkContext,
    ),
  );
  let drawer: HTMLDialogElement;
  const accountLabels = {
    en: 'Account menu',
    ja: 'アカウントメニュー',
    'zh-CN': '账户菜单',
    'zh-TW': '帳號選單',
    es: 'Menú de la cuenta',
    it: 'Menu dell’account',
    fr: 'Menu du compte',
  };
  const menuLabels = {
    en: 'Open navigation',
    ja: 'ナビゲーションを開く',
    'zh-CN': '打开导航',
    'zh-TW': '開啟導覽',
    es: 'Abrir navegación',
    it: 'Apri navigazione',
    fr: 'Ouvrir la navigation',
  };
  const closeLabels = {
    en: 'Close navigation',
    ja: 'ナビゲーションを閉じる',
    'zh-CN': '关闭导航',
    'zh-TW': '關閉導覽',
    es: 'Cerrar navegación',
    it: 'Chiudi navigazione',
    fr: 'Fermer la navigation',
  };
  function active(href: string, path: string) {
    if (href === '/admin') return href === path;
    if (href === '/admin/settings') {
      return (
        path === href ||
        (path.startsWith(`${href}/`) &&
          path !== `${href}/security` &&
          !path.startsWith(`${href}/security/`))
      );
    }
    return path === href || path.startsWith(`${href}/`);
  }
</script>

{#snippet navigation()}
  <nav aria-label={messages['admin.title']} class="navigation">
    {#each groups as group (group.key)}
      <p class="nav-group">{group.label}</p>
      {#each group.items as item (item.href)}
        <a
          href={item.href}
          aria-current={active(item.href, page.url.pathname)
            ? item.href === page.url.pathname
              ? 'page'
              : 'location'
            : undefined}
          onclick={() => drawer?.close()}
        >
          <span class="nav-icon">
            <item.icon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>{item.label}</span>
        </a>
      {/each}
    {/each}
  </nav>
{/snippet}
<div class="admin-shell">
  <aside class="sidebar">
    <div class="sidebar-brand"><Brand href="/admin" /></div>
    {@render navigation()}
  </aside>
  <dialog
    id="admin-navigation"
    class="drawer"
    bind:this={drawer}
    aria-label={messages['admin.title']}
  >
    <div class="drawer-header">
      <Brand href="/admin" />
      <form method="dialog">
        <button
          class="drawer-close"
          type="submit"
          aria-label={closeLabels[data.locale]}
        >
          <X size={22} />
        </button>
      </form>
    </div>
    {@render navigation()}
  </dialog>
  <div class="admin-content">
    <header class="topbar">
      <div class="topbar-inner">
        <button
          class="menu-button"
          type="button"
          aria-label={menuLabels[data.locale]}
          aria-haspopup="dialog"
          aria-controls="admin-navigation"
          commandfor="admin-navigation"
          command="show-modal"
          onclick={(event) => {
            if (!('commandForElement' in event.currentTarget))
              drawer.showModal();
          }}
        >
          <Menu size={23} />
        </button>
        <nav class="breadcrumbs" aria-label={breadcrumbLabel[data.locale]}>
          <ol>
            {#each breadcrumbs as crumb, index (index)}
              <li class:current={index === breadcrumbs.length - 1}>
                {#if index > 0}<span
                    class="breadcrumb-separator"
                    aria-hidden="true"
                  >
                    /
                  </span>{/if}
                {#if crumb.href && index < breadcrumbs.length - 1}
                  <a href={crumb.href}>{crumb.label}</a>
                {:else}
                  <span
                    aria-current={index === breadcrumbs.length - 1
                      ? 'page'
                      : undefined}
                  >
                    {crumb.label}
                  </span>
                {/if}
              </li>
            {/each}
          </ol>
        </nav>
        <div class="account">
          <button
            class="account-trigger"
            type="button"
            aria-label={accountLabels[data.locale]}
            popovertarget="admin-account"
          >
            <span class="account-mark" aria-hidden="true">
              {data.user.email.slice(0, 1).toUpperCase()}
            </span>
            <span class="account-summary-email">{data.user.email}</span>
            <span class="account-chevron">
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </button>
          <div class="account-menu" id="admin-account" popover="auto">
            <span class="account-email">{data.user.email}</span>
            <span class="account-zone">
              {preferences.effective}: {data.timeZone}
            </span>
            <form method="POST" action="/logout">
              <input type="hidden" name="csrfToken" value={data.csrfToken} />
              <button type="submit" class="signout">
                {messages['admin.signOut']}
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
    <main class="main-content">{@render children()}</main>
  </div>
</div>

<style>
  .admin-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 212px minmax(0, 1fr);
    background: var(--ui-background);
    color: var(--ui-text);
  }
  .sidebar,
  .drawer {
    background: light-dark(#f9fbfc, #111d30);
    color: var(--ui-text);
  }
  .sidebar {
    padding: 0 12px 24px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    border-inline-end: 1px solid var(--ui-border);
  }
  .sidebar-brand {
    display: flex;
    align-items: center;
    min-height: 72px;
    padding: 0 6px;
    border-bottom: 1px solid var(--ui-border);
  }
  .navigation {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .nav-group {
    margin: 22px 11px 8px;
    color: var(--ui-text-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .navigation a {
    display: grid;
    grid-template-columns: 27px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 6px 11px 6px 8px;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--ui-text-muted);
    font-size: 14px;
    font-weight: 530;
    text-decoration: none;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }
  .nav-icon {
    display: grid;
    width: 27px;
    height: 27px;
    place-items: center;
    border-radius: 7px;
  }
  .navigation a:hover {
    background: light-dark(var(--ui-background), var(--brand-ink-panel));
    color: var(--ui-text);
  }
  .navigation a[aria-current] {
    background: light-dark(var(--ui-accent-surface), var(--brand-ink-panel));
    color: var(--ui-link);
    font-weight: 650;
  }
  .navigation a:focus-visible,
  .drawer-close:focus-visible {
    outline: 3px solid var(--ui-focus);
    outline-offset: 2px;
  }
  .admin-content {
    min-width: 0;
    --shell-gutter: clamp(20px, 3vw, 36px);
  }
  .topbar {
    border-bottom: 1px solid var(--ui-border);
    background: var(--ui-surface);
  }
  .topbar-inner {
    min-height: 72px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding-inline: var(--shell-gutter);
  }
  .breadcrumbs {
    min-width: 0;
    flex: 1;
  }
  .breadcrumbs ol {
    display: flex;
    align-items: center;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .breadcrumbs li {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 0 0 auto;
    color: var(--ui-text-muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .breadcrumbs li.current,
  .breadcrumbs li:nth-last-child(2) {
    flex: 0 1 auto;
  }
  .breadcrumbs li.current {
    color: var(--ui-text);
    font-weight: 650;
  }
  .breadcrumbs li > a,
  .breadcrumbs li > span:not(.breadcrumb-separator) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .breadcrumbs li:first-child {
    flex-shrink: 0;
  }
  .breadcrumb-separator {
    flex: none;
    margin: 0 10px;
    opacity: 0.7;
  }
  .breadcrumbs a {
    color: inherit;
    text-decoration: none;
  }
  .breadcrumbs a:hover {
    color: var(--ui-link);
    text-decoration: underline;
  }
  .account {
    flex: none;
  }
  .account-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding-inline: 6px;
    border-radius: var(--ui-radius-sm);
    cursor: pointer;
  }
  .account-trigger:hover,
  .account:has(.account-menu:popover-open) .account-trigger {
    background: var(--ui-background);
  }
  .account-trigger:focus-visible {
    outline: 3px solid var(--ui-focus);
    outline-offset: 2px;
  }
  .account-mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--ui-accent-surface);
    color: var(--ui-link);
    font-weight: 700;
  }
  .account-summary-email {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }
  .account-chevron {
    color: var(--ui-text-muted);
  }
  .account:has(.account-menu:popover-open) .account-chevron {
    transform: rotate(180deg);
  }
  .account-menu {
    position: absolute;
    inset: 72px var(--shell-gutter) auto auto;
    top: calc(anchor(bottom, 72px) + 5px);
    right: anchor(right, var(--shell-gutter));
    margin: 0;
    width: max-content;
    max-width: min(300px, calc(100vw - var(--shell-gutter) * 2));
    padding: 16px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface);
    color: var(--ui-text);
    box-shadow: var(--ui-shadow-raised);
  }
  .account-email,
  .account-zone {
    display: block;
    overflow-wrap: anywhere;
  }
  .account-email {
    font-size: 13px;
    font-weight: 650;
  }
  .account-zone {
    margin-top: 4px;
    color: var(--ui-text-muted);
    font-size: 11px;
  }
  .signout {
    min-height: 44px;
    margin-top: 6px;
    color: var(--ui-link);
    font-size: 13px;
    font-weight: 650;
  }
  .signout:hover {
    text-decoration: underline;
  }
  .main-content {
    width: 100%;
    padding: 36px var(--shell-gutter) 80px;
  }
  .menu-button {
    display: none;
  }
  .drawer {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(280px, 85vw);
    max-height: none;
    height: 100dvh;
    margin: 0;
    padding: 24px 16px;
    border: 0;
  }
  .drawer::backdrop {
    background: rgb(0 0 0 / 55%);
  }
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 8px 32px;
  }
  .drawer-close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--ui-text);
  }
  @media (max-width: 767px) {
    .admin-shell {
      display: block;
    }
    .sidebar {
      display: none;
    }
    .topbar-inner {
      gap: 10px;
    }
    .menu-button {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      color: var(--ui-text);
    }
    .account-summary-email {
      display: none;
    }
    .main-content {
      padding-block: 28px 60px;
    }
  }
  @media (max-width: 480px) {
    .topbar-inner {
      flex-wrap: wrap;
      gap: 0 8px;
      padding-block: 6px 10px;
    }
    .menu-button {
      order: 0;
    }
    .account {
      order: 1;
      margin-left: auto;
    }
    .breadcrumbs {
      order: 2;
      flex-basis: 100%;
    }
    .breadcrumbs ol {
      flex-wrap: wrap;
      gap: 4px 0;
    }
    .breadcrumbs li {
      white-space: normal;
    }
    .breadcrumbs li > a,
    .breadcrumbs li > span:not(.breadcrumb-separator) {
      overflow: visible;
      overflow-wrap: anywhere;
    }
  }
</style>
