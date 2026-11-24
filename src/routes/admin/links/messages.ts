import type { Locale } from '$lib/i18n/locale';

type ListMessages = {
  copy: string;
  copied: string;
  copyError: string;
  clear: string;
  sort: string;
  newest: string;
  oldest: string;
  recentlyUpdated: string;
};

export const listMessages = {
  en: {
    copy: 'Copy short URL',
    copied: 'Short URL copied.',
    copyError: 'Select the short URL to copy it manually.',
    clear: 'Clear filters',
    sort: 'Sort by',
    newest: 'Newest first',
    oldest: 'Oldest first',
    recentlyUpdated: 'Recently updated',
  },
  ja: {
    copy: '短縮URLをコピー',
    copied: '短縮URLをコピーしました。',
    copyError: '短縮URLを選択してコピーしてください。',
    clear: '絞り込みを解除',
    sort: '並び替え',
    newest: '作成日時が新しい順',
    oldest: '作成日時が古い順',
    recentlyUpdated: '更新日時が新しい順',
  },
  'zh-CN': {
    copy: '复制短链接',
    copied: '短链接已复制。',
    copyError: '请选择短链接并手动复制。',
    clear: '清除筛选',
    sort: '排序方式',
    newest: '最新创建',
    oldest: '最早创建',
    recentlyUpdated: '最近更新',
  },
  'zh-TW': {
    copy: '複製短網址',
    copied: '短網址已複製。',
    copyError: '請選取短網址並手動複製。',
    clear: '清除篩選',
    sort: '排序方式',
    newest: '最新建立',
    oldest: '最早建立',
    recentlyUpdated: '最近更新',
  },
  es: {
    copy: 'Copiar URL corta',
    copied: 'URL corta copiada.',
    copyError: 'Selecciona la URL corta para copiarla manualmente.',
    clear: 'Quitar filtros',
    sort: 'Ordenar por',
    newest: 'Más recientes',
    oldest: 'Más antiguos',
    recentlyUpdated: 'Actualizados recientemente',
  },
  it: {
    copy: 'Copia URL breve',
    copied: 'URL breve copiato.',
    copyError: 'Seleziona e copia manualmente l’URL breve.',
    clear: 'Rimuovi filtri',
    sort: 'Ordina per',
    newest: 'Più recenti',
    oldest: 'Meno recenti',
    recentlyUpdated: 'Aggiornati di recente',
  },
  fr: {
    copy: 'Copier l’URL courte',
    copied: 'URL courte copiée.',
    copyError: 'Sélectionnez et copiez l’URL courte manuellement.',
    clear: 'Effacer les filtres',
    sort: 'Trier par',
    newest: 'Plus récents',
    oldest: 'Plus anciens',
    recentlyUpdated: 'Récemment modifiés',
  },
} satisfies Record<Locale, ListMessages>;

export const detailNavigation = {
  en: {
    sections: 'Link sections',
    noMatches: 'No links match these filters.',
  },
  ja: {
    sections: 'リンクのメニュー',
    noMatches: '条件に一致するリンクがありません。',
  },
  'zh-CN': {
    sections: '链接菜单',
    noMatches: '没有链接符合这些筛选条件。',
  },
  'zh-TW': {
    sections: '連結選單',
    noMatches: '沒有連結符合這些篩選條件。',
  },
  es: {
    sections: 'Secciones del enlace',
    noMatches: 'Ningún enlace coincide con estos filtros.',
  },
  it: {
    sections: 'Sezioni del link',
    noMatches: 'Nessun link corrisponde a questi filtri.',
  },
  fr: {
    sections: 'Sections du lien',
    noMatches: 'Aucun lien ne correspond à ces filtres.',
  },
} satisfies Record<
  Locale,
  {
    sections: string;
    noMatches: string;
  }
>;
