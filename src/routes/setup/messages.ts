import type { Locale } from '$lib/i18n/locale';

type SetupDomainMessages = {
  heading: string;
  purpose: string;
  custom: string;
  hostname: string;
  token: string;
  connect: string;
  connecting: string;
  operationUnknown: string;
  confirm: string;
  fallback: string;
  useCurrent: string;
  continue: string;
  waiting: string;
};

export const setupDomainMessages: Record<Locale, SetupDomainMessages> = {
  en: {
    heading: 'Step 2 of 3 · Choose your admin hostname',
    purpose: 'This domain will be the URL for your admin dashboard.',
    custom: 'Use a domain in an active Cloudflare DNS zone in this account.',
    hostname: 'Custom hostname',
    token: 'Cloudflare API token',
    connect: 'Connect hostname',
    connecting: 'Connecting your hostname. This may take a little while.',
    operationUnknown:
      'The connection could not be confirmed. Wait a moment, then retry the same hostname on this screen.',
    confirm: 'I want Cloudflare to connect this hostname to this Worker.',
    fallback: 'You can set up your dashboard at the current hostname.',
    useCurrent: 'Use this hostname',
    continue: 'Open setup on your custom hostname',
    waiting:
      'Verify your setup token again on the new hostname to create the owner account. If the page does not open, wait for Cloudflare to finish setting up HTTPS and try again, or continue here.',
  },
  ja: {
    heading: 'ステップ 2 / 3：管理画面のホスト名を選択',
    purpose: 'このドメインが管理画面の URL になります。',
    custom:
      'このアカウントで有効な Cloudflare DNS ゾーンのドメインを使えます。',
    hostname: 'カスタムホスト名',
    token: 'Cloudflare API トークン',
    connect: 'ホスト名を接続',
    connecting: 'ホスト名を接続しています。しばらくお待ちください。',
    operationUnknown:
      '接続結果を確認できませんでした。しばらく待ってから、この画面で同じホスト名を再試行してください。',
    confirm:
      'このホスト名を Cloudflare でこの Worker に接続することを確認します。',
    fallback: '現在のホスト名で管理画面を設定できます。',
    useCurrent: 'このホスト名を使う',
    continue: 'カスタムホスト名でセットアップを開く',
    waiting:
      '新しいホスト名でセットアップトークンを再確認して、オーナーアカウントを作成します。ページが開かない場合は Cloudflare の HTTPS 設定が完了してから再試行するか、このページで続けてください。',
  },
  'zh-CN': {
    heading: '第 2 步，共 3 步：选择管理主机名',
    purpose: '此域名将用作管理面板的网址。',
    custom: '可以使用此账户中处于活动状态的 Cloudflare DNS 区域内的域名。',
    hostname: '自定义主机名',
    token: 'Cloudflare API 令牌',
    connect: '连接主机名',
    connecting: '正在连接主机名，请稍候。',
    operationUnknown:
      '无法确认连接结果。请稍等片刻，然后在此页面重试相同的主机名。',
    confirm: '我确认让 Cloudflare 将此主机名连接到此 Worker。',
    fallback: '可以在当前主机名上设置管理面板。',
    useCurrent: '使用此主机名',
    continue: '在自定义主机名上打开设置页面',
    waiting:
      '在新主机名上再次验证设置令牌以创建所有者账户。如果页面无法打开，请等待 Cloudflare 完成 HTTPS 设置后重试，也可以在此页面继续。',
  },
  'zh-TW': {
    heading: '步驟 2 / 3：選擇管理主機名稱',
    purpose: '此網域將用作管理介面的網址。',
    custom: '可以使用此帳戶中已啟用的 Cloudflare DNS 區域內的網域。',
    hostname: '自訂主機名稱',
    token: 'Cloudflare API 權杖',
    connect: '連接主機名稱',
    connecting: '正在連接主機名稱，請稍候。',
    operationUnknown:
      '無法確認連接結果。請稍候片刻，然後在此頁面重試相同的主機名稱。',
    confirm: '我確認讓 Cloudflare 將此主機名稱連接至此 Worker。',
    fallback: '可以在目前的主機名稱上設定管理介面。',
    useCurrent: '使用此主機名稱',
    continue: '在自訂主機名稱上開啟設定頁面',
    waiting:
      '在新主機名稱上再次驗證設定權杖以建立擁有者帳戶。若無法開啟頁面，請等候 Cloudflare 完成 HTTPS 設定後再試，或在此頁面繼續。',
  },
  es: {
    heading: 'Paso 2 de 3 · Elige el host de administración',
    purpose: 'Este dominio será la URL de tu panel de administración.',
    custom:
      'Usa un dominio de una zona DNS activa de Cloudflare en esta cuenta.',
    hostname: 'Host personalizado',
    token: 'Token de API de Cloudflare',
    connect: 'Conectar host',
    connecting: 'Conectando el host. Esto puede tardar un momento.',
    operationUnknown:
      'No se pudo confirmar la conexión. Espera un momento y vuelve a intentar el mismo host en esta pantalla.',
    confirm: 'Confirmo que Cloudflare conecte este host a este Worker.',
    fallback: 'Puedes configurar tu panel en el host actual.',
    useCurrent: 'Usar este host',
    continue: 'Abrir la configuración en el host personalizado',
    waiting:
      'Verifica de nuevo el token de configuración en el nuevo host para crear la cuenta de propietario. Si la página no se abre, espera a que Cloudflare configure HTTPS y vuelve a intentarlo, o continúa aquí.',
  },
  it: {
    heading: 'Passaggio 2 di 3 · Scegli l’hostname di amministrazione',
    purpose: 'Questo dominio sarà l’URL del pannello di amministrazione.',
    custom:
      'Usa un dominio di una zona DNS Cloudflare attiva in questo account.',
    hostname: 'Hostname personalizzato',
    token: 'Token API Cloudflare',
    connect: 'Collega hostname',
    connecting:
      'Connessione dell’hostname in corso. Potrebbe richiedere qualche istante.',
    operationUnknown:
      'Impossibile confermare la connessione. Attendi un momento, poi riprova lo stesso hostname su questa schermata.',
    confirm:
      'Confermo che Cloudflare colleghi questo hostname a questo Worker.',
    fallback: 'Puoi configurare il pannello sull’hostname attuale.',
    useCurrent: 'Usa questo hostname',
    continue: 'Apri la configurazione sull’hostname personalizzato',
    waiting:
      'Verifica di nuovo il token di configurazione sul nuovo hostname per creare l’account proprietario. Se la pagina non si apre, attendi che Cloudflare configuri HTTPS e riprova, oppure continua qui.',
  },
  fr: {
    heading: 'Étape 2 sur 3 · Choisissez l’hôte d’administration',
    purpose: 'Ce domaine sera l’URL de votre tableau de bord d’administration.',
    custom:
      'Utilisez un domaine d’une zone DNS Cloudflare active dans ce compte.',
    hostname: 'Nom d’hôte personnalisé',
    token: 'Jeton API Cloudflare',
    connect: 'Connecter l’hôte',
    connecting: 'Connexion de l’hôte en cours. Cela peut prendre un moment.',
    operationUnknown:
      'La connexion n’a pas pu être confirmée. Patientez, puis réessayez avec le même hôte sur cet écran.',
    confirm: 'Je confirme que Cloudflare peut connecter cet hôte à ce Worker.',
    fallback: 'Vous pouvez configurer votre tableau de bord sur l’hôte actuel.',
    useCurrent: 'Utiliser cet hôte',
    continue: 'Ouvrir la configuration sur l’hôte personnalisé',
    waiting:
      'Vérifiez à nouveau le jeton de configuration sur le nouvel hôte pour créer le compte propriétaire. Si la page ne s’ouvre pas, attendez que Cloudflare configure HTTPS puis réessayez, ou continuez ici.',
  },
};
