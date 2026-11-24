import type { Locale } from './locale';

type LandingCopy = {
  headline: readonly [string, string];
  features: readonly [string, string, string, string, string, string];
  ownership: readonly [string, string];
  example: string;
  guide: string;
  home: string;
  independent: string;
};

export const landingCopy = {
  en: {
    headline: ['Every link.', 'The right destination.'],
    features: [
      'Shorten',
      'Create short links and QR codes on your own hostname.',
      'Route',
      'Send visitors to the right page based on device, country, or language.',
      'Understand',
      'Review clicks and traffic sources for each link.',
    ],
    ownership: [
      'Own your links',
      'Run Linkrovia on your Cloudflare account and manage your own domains, links, and configuration.',
    ],
    example: 'Example analytics with sample data',
    guide: 'Deployment guide',
    home: 'Back to home',
    independent:
      'An independent open-source project. Unaffiliated with Cloudflare.',
  },
  ja: {
    headline: ['リンクを、', '最適な行き先へ。'],
    features: [
      '短縮',
      '自分のホスト名で短縮リンクとQRコードを作成できます。',
      '振り分け',
      'デバイス・国・言語に応じて、訪問者を適切なページへ案内します。',
      '把握',
      'リンクごとにクリックと流入元を確認できます。',
    ],
    ownership: [
      'リンクを自分で管理',
      '自分のCloudflareアカウントで運用し、ドメイン・リンク・設定を管理できます。',
    ],
    example: 'サンプルデータによる分析画面イメージ',
    guide: '導入ガイド',
    home: 'トップページへ戻る',
    independent:
      '独立したオープンソースプロジェクトです。Cloudflareとの提携はありません。',
  },
  'zh-CN': {
    headline: ['每个链接，', '都通向正确的目的地。'],
    features: [
      '缩短',
      '在自己的主机名上创建短链接和二维码。',
      '路由',
      '按设备、国家或语言将访客引导到合适的页面。',
      '了解',
      '查看每个链接的点击次数和流量来源。',
    ],
    ownership: [
      '掌控自己的链接',
      '在自己的 Cloudflare 账户上运行，管理域名、链接和配置。',
    ],
    example: '使用示例数据的分析预览',
    guide: '部署指南',
    home: '返回首页',
    independent: '独立开源项目，与 Cloudflare 无关联。',
  },
  'zh-TW': {
    headline: ['每個連結，', '都通往正確的目的地。'],
    features: [
      '縮短',
      '使用自己的主機名稱建立短連結和 QR 碼。',
      '路由',
      '依裝置、國家或語言將訪客引導至合適的頁面。',
      '掌握',
      '查看每個連結的點擊次數和流量來源。',
    ],
    ownership: [
      '掌握自己的連結',
      '在自己的 Cloudflare 帳戶上運作，管理網域、連結及設定。',
    ],
    example: '使用範例資料的分析預覽',
    guide: '部署指南',
    home: '返回首頁',
    independent: '獨立的開放原始碼專案，與 Cloudflare 無關。',
  },
  es: {
    headline: ['Cada enlace.', 'El destino adecuado.'],
    features: [
      'Acorta',
      'Crea enlaces cortos y códigos QR en tu propio dominio.',
      'Dirige',
      'Envía a cada visitante a la página adecuada según su dispositivo, país o idioma.',
      'Comprende',
      'Consulta los clics y las fuentes de tráfico de cada enlace.',
    ],
    ownership: [
      'Controla tus enlaces',
      'Usa tu cuenta de Cloudflare y gestiona tus propios dominios, enlaces y ajustes.',
    ],
    example: 'Vista previa de análisis con datos de ejemplo',
    guide: 'Guía de despliegue',
    home: 'Volver al inicio',
    independent:
      'Proyecto de código abierto independiente, sin afiliación con Cloudflare.',
  },
  it: {
    headline: ['Ogni link.', 'La destinazione giusta.'],
    features: [
      'Accorcia',
      'Crea link brevi e codici QR sul tuo hostname.',
      'Instrada',
      'Invia i visitatori alla pagina adatta in base a dispositivo, paese o lingua.',
      'Comprendi',
      'Consulta i clic e le fonti di traffico di ogni link.',
    ],
    ownership: [
      'Controlla i tuoi link',
      'Usa il tuo account Cloudflare e gestisci domini, link e configurazione.',
    ],
    example: 'Anteprima delle analisi con dati di esempio',
    guide: 'Guida alla distribuzione',
    home: 'Torna alla pagina iniziale',
    independent:
      'Progetto open source indipendente, senza affiliazione con Cloudflare.',
  },
  fr: {
    headline: ['Chaque lien.', 'La bonne destination.'],
    features: [
      'Raccourcir',
      'Créez des liens courts et des codes QR sur votre propre nom d’hôte.',
      'Rediriger',
      'Envoyez les visiteurs vers la page appropriée selon leur appareil, leur pays ou leur langue.',
      'Comprendre',
      'Consultez les clics et les sources de trafic de chaque lien.',
    ],
    ownership: [
      'Gérez vos liens',
      'Exécutez Linkrovia sur votre compte Cloudflare et gérez vos propres domaines, liens et paramètres.',
    ],
    example: 'Exemple d’analyses avec des données fictives',
    guide: 'Guide de déploiement',
    home: 'Retour à l’accueil',
    independent: 'Projet open source indépendant, sans lien avec Cloudflare.',
  },
} satisfies Record<Locale, LandingCopy>;
