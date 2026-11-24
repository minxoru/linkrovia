import type { Locale } from '$lib/i18n/locale';

const messages: Record<
  Locale,
  {
    title: string;
    description: string;
    create: string;
    preview: string;
    downloadSvg: string;
    downloadPng: string;
    back: string;
    url: string;
  }
> = {
  en: {
    title: 'QR code',
    description:
      'Create a QR code to distinguish scans from other visits. It follows the same redirect rules as this link.',
    create: 'Create QR code',
    preview: 'QR code preview',
    downloadSvg: 'Download SVG',
    downloadPng: 'Download PNG',
    back: 'Back to link',
    url: 'QR destination',
  },
  ja: {
    title: 'QR コード',
    description:
      'QR コードを作成すると、スキャンからのアクセスを区別できます。このリンクと同じ転送ルールが適用されます。',
    create: 'QR コードを作成',
    preview: 'QR コードのプレビュー',
    downloadSvg: 'SVG をダウンロード',
    downloadPng: 'PNG をダウンロード',
    back: 'リンクに戻る',
    url: 'QR の接続先',
  },
  'zh-CN': {
    title: '二维码',
    description: '创建二维码以区分扫码访问。它使用此链接的相同跳转规则。',
    create: '创建二维码',
    preview: '二维码预览',
    downloadSvg: '下载 SVG',
    downloadPng: '下载 PNG',
    back: '返回链接',
    url: '二维码地址',
  },
  'zh-TW': {
    title: 'QR 碼',
    description: '建立 QR 碼以區分掃描造訪。它會套用此連結相同的轉址規則。',
    create: '建立 QR 碼',
    preview: 'QR 碼預覽',
    downloadSvg: '下載 SVG',
    downloadPng: '下載 PNG',
    back: '返回連結',
    url: 'QR 碼網址',
  },
  es: {
    title: 'Código QR',
    description:
      'Crea un código QR para distinguir las visitas por escaneo. Usa las mismas reglas de redirección del enlace.',
    create: 'Crear código QR',
    preview: 'Vista previa del código QR',
    downloadSvg: 'Descargar SVG',
    downloadPng: 'Descargar PNG',
    back: 'Volver al enlace',
    url: 'Dirección del QR',
  },
  it: {
    title: 'Codice QR',
    description:
      'Crea un codice QR per distinguere le visite da scansione. Usa le stesse regole di reindirizzamento del link.',
    create: 'Crea codice QR',
    preview: 'Anteprima del codice QR',
    downloadSvg: 'Scarica SVG',
    downloadPng: 'Scarica PNG',
    back: 'Torna al link',
    url: 'Indirizzo QR',
  },
  fr: {
    title: 'Code QR',
    description:
      'Créez un code QR pour distinguer les visites issues d’un scan des autres visites. Les mêmes règles de redirection que celles de ce lien s’appliquent.',
    create: 'Créer un code QR',
    preview: 'Aperçu du code QR',
    downloadSvg: 'Télécharger le SVG',
    downloadPng: 'Télécharger le PNG',
    back: 'Retour au lien',
    url: 'Destination du code QR',
  },
};
export const qrMessages = (locale: Locale) => messages[locale];
