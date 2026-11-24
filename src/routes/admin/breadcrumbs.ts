import { analyticsMessages } from '$lib/components/analytics/messages';
import { adminInviteMessages } from '$lib/i18n/admin-invites';
import { linkMessages } from '$lib/i18n/links';
import { messagesFor, type Locale } from '$lib/i18n/locale';
import { preferenceMessages } from '$lib/i18n/preferences';
import { protectionMessages } from '$lib/i18n/protection';
import { apiKeyMessages } from './api-keys/messages';
import { backupMessages } from './backup/messages';
import { domainMessages } from './domains/messages';
import { csvMessages } from './import/messages';
import { ruleMessages } from './links/[id]/rules/messages';
import { simulationMessages } from './links/[id]/simulate/messages';
import { linkUtmMessages } from './links/[id]/utm/messages';
import { healthMessages } from './settings/health/messages';
import { utmMessages } from './utm/messages';

export const breadcrumbLabel = {
  en: 'Breadcrumb',
  ja: 'パンくずリスト',
  'zh-CN': '面包屑导航',
  'zh-TW': '麵包屑導覽',
  es: 'Ruta de navegación',
  it: 'Percorso di navigazione',
  fr: 'Fil d’Ariane',
} satisfies Record<Locale, string>;

export function linkSectionLabels(locale: Locale): Record<string, string> {
  const analytics = analyticsMessages(locale);
  const protection = protectionMessages(locale);
  return {
    '': linkMessages(locale).edit,
    '/rules': ruleMessages(locale).title,
    '/analytics': analytics.title,
    '/conversions': analytics.conversions,
    '/protection': protection.title,
    '/qr': protection.qr,
    '/utm': linkUtmMessages(locale).title,
    '/simulate': simulationMessages(locale).title,
  };
}

type Breadcrumb = { label: string; href?: string };
type SavedLink = { title: string | null; shortUrl: string };

const linkRoute = '/admin/links/[id]';

export function adminBreadcrumbs(
  route: string | null,
  pathname: string,
  locale: Locale,
  linkContext?: SavedLink | null,
): Breadcrumb[] {
  const messages = messagesFor(locale);
  const overview = messages['admin.overview'];
  const links = linkMessages(locale);
  const analytics = analyticsMessages(locale);
  const domains = domainMessages(locale);
  const settings = preferenceMessages(locale).settings;
  const trail: Breadcrumb[] = [{ label: overview, href: '/admin' }];

  if (route === linkRoute || route?.startsWith(linkRoute + '/')) {
    const section = route.slice(linkRoute.length);
    const label =
      linkContext?.title?.trim() || linkContext?.shortUrl || links.edit;
    const sectionLabel = linkSectionLabels(locale)[section];
    trail.push({ label: links.links, href: '/admin/links' });
    if (section && sectionLabel) {
      trail.push(
        { label, href: pathname.replace(/\/$/, '').slice(0, -section.length) },
        { label: sectionLabel },
      );
    } else {
      trail.push({ label });
    }
    return trail;
  }

  switch (route) {
    case '/admin/links/new':
      return [
        ...trail,
        { label: links.links, href: '/admin/links' },
        { label: links.create },
      ];
    case '/admin/analytics/conversions':
      return [
        ...trail,
        { label: analytics.title, href: '/admin/analytics' },
        { label: analytics.conversions },
      ];
    case '/admin/domains/[id]/connect':
      return [
        ...trail,
        { label: domains.domains, href: '/admin/domains' },
        { label: domains.wizardTitle },
      ];
  }

  const settingsPages: Record<string, string> = {
    '/admin/settings/admins': adminInviteMessages[locale].title,
    '/admin/settings/health': healthMessages(locale).title,
    '/admin/settings/security': messages['admin.security'],
  };
  const settingsPage = route && settingsPages[route];
  if (settingsPage)
    return [
      ...trail,
      { label: settings, href: '/admin/settings' },
      { label: settingsPage },
    ];

  const primaryPages: Record<string, string> = {
    '/admin/links': links.links,
    '/admin/analytics': analytics.title,
    '/admin/import': csvMessages(locale).title,
    '/admin/utm': utmMessages(locale).title,
    '/admin/domains': domains.domains,
    '/admin/backup': backupMessages(locale).title,
    '/admin/integrations/mcp': 'MCP',
    '/admin/settings': settings,
    '/admin/api-keys': apiKeyMessages(locale).title,
  };
  const primaryPage = route && primaryPages[route];
  return primaryPage
    ? [...trail, { label: primaryPage }]
    : [{ label: overview }];
}
