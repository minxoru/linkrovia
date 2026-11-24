import type { Locale } from './locale';

export const analyticsEngineDashboard =
  'https://dash.cloudflare.com/?to=/:account/workers/analytics-engine';

type AnalyticsActivationMessages = {
  heading: string;
  continueSetup: string;
  steps: string;
  dashboard: string;
  askOwner: string;
};

export const analyticsActivationMessages = {
  en: {
    heading: 'Click analytics can be enabled later',
    continueSetup: 'You can finish setup and use short links now.',
    steps:
      'Enable Workers Analytics Engine in Cloudflare. In this Worker’s Deployments, open View Build History and select Retry build. Click tracking starts after that deployment.',
    dashboard: 'Open Analytics Engine in Cloudflare',
    askOwner: 'Ask the instance owner to enable click analytics.',
  },
  ja: {
    heading: 'クリック解析はあとで有効にできます',
    continueSetup: 'このまま初期設定を完了し、短縮リンクを利用できます。',
    steps:
      'Cloudflare で Workers Analytics Engine を有効にしてください。同じ Worker の「デプロイ」からビルド履歴を開き、ビルドを再試行すると、再デプロイ後のクリックから計測が始まります。',
    dashboard: 'Cloudflare で Analytics Engine を開く',
    askOwner:
      'クリック解析の有効化はインスタンスのオーナーに依頼してください。',
  },
  'zh-CN': {
    heading: '可稍后启用点击分析',
    continueSetup: '你可以继续完成设置并使用短链接。',
    steps:
      '在 Cloudflare 启用 Workers Analytics Engine。打开当前 Worker 的部署页面和构建历史，然后重试构建。点击跟踪会在重新部署后开始。',
    dashboard: '在 Cloudflare 中打开 Analytics Engine',
    askOwner: '请联系实例所有者启用点击分析。',
  },
  'zh-TW': {
    heading: '可稍後啟用點擊分析',
    continueSetup: '你可以繼續完成設定並使用短網址。',
    steps:
      '在 Cloudflare 啟用 Workers Analytics Engine。開啟目前 Worker 的部署與建置記錄，然後重試建置。重新部署後會開始記錄點擊。',
    dashboard: '在 Cloudflare 中開啟 Analytics Engine',
    askOwner: '請聯絡執行個體擁有者啟用點擊分析。',
  },
  es: {
    heading: 'Puedes activar la analítica de clics más adelante',
    continueSetup: 'Ya puedes terminar la configuración y usar enlaces cortos.',
    steps:
      'Activa Workers Analytics Engine en Cloudflare. Abre el historial de compilación en los despliegues de este Worker y reintenta la compilación. El seguimiento empieza después del despliegue.',
    dashboard: 'Abrir Analytics Engine en Cloudflare',
    askOwner:
      'Pide al propietario de la instancia que active la analítica de clics.',
  },
  it: {
    heading: 'Puoi attivare l’analisi dei clic in seguito',
    continueSetup:
      'Puoi completare la configurazione e usare i link brevi da subito.',
    steps:
      'Attiva Workers Analytics Engine in Cloudflare. Apri la cronologia delle build nelle distribuzioni di questo Worker e avvia di nuovo la build. Il monitoraggio inizia dopo la distribuzione.',
    dashboard: 'Apri Analytics Engine in Cloudflare',
    askOwner:
      'Chiedi al proprietario dell’istanza di attivare l’analisi dei clic.',
  },
  fr: {
    heading: 'Vous pouvez activer l’analyse des clics plus tard',
    continueSetup:
      'Vous pouvez terminer la configuration et utiliser les liens courts dès maintenant.',
    steps:
      'Activez Workers Analytics Engine dans Cloudflare. Dans les déploiements de ce Worker, ouvrez l’historique des builds et relancez le build. Le suivi des clics commence après le déploiement.',
    dashboard: 'Ouvrir Analytics Engine dans Cloudflare',
    askOwner:
      'Demandez au propriétaire de l’instance d’activer l’analyse des clics.',
  },
} satisfies Record<Locale, AnalyticsActivationMessages>;
