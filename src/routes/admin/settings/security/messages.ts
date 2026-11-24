import type { Locale } from '$lib/i18n/locale';

const en = {
  title: 'Security settings',
  intro: 'Use Cloudflare Turnstile to protect sign-in and initial owner setup.',
  status: 'Protection',
  disabled: 'Off',
  enabled: 'On',
  incomplete: 'Setup incomplete',
  manageWidget: 'Open Turnstile in Cloudflare',
  widgetSetup:
    'Select Add widget. Choose Managed, add the hostname shown below, and leave pre-clearance off. Add each new hostname here when you change domains.',
  hostname: 'Hostname for this check',
  manageWorker: 'Open Workers & Pages in Cloudflare',
  secretSetup:
    'Select your Worker, then Settings → Variables and Secrets → Add. Choose Secret, name it TURNSTILE_SECRET_KEY, paste the widget’s secret key, and deploy.',
  siteKey: 'Site key',
  siteKeyHint: 'Copy the public site key from your widget.',
  prepare: 'Continue to verification',
  verifyEnable: 'Verify and enable',
  verifySave: 'Verify and save',
  verify:
    'Complete the check below to verify the site key and secret for this hostname.',
  edit: 'Change site key',
  disable: 'Disable Turnstile',
  saved: 'Verification passed. Turnstile is on.',
  turnedOff: 'Turnstile is off.',
  missingSiteKey: 'Enter the public site key from your widget.',
  missingSecret:
    'Add TURNSTILE_SECRET_KEY to your Worker and deploy, then try again.',
  invalidKeys:
    'Check that you copied the public site key. Use production keys on this hostname.',
  verificationFailed:
    'Verification failed. Check that the widget allows this hostname and both keys belong to the same widget, then try again.',
  rotate:
    'Rotate the secret in Turnstile, update the Worker secret, then run this verification again.',
};

const messages = {
  en,
  ja: {
    title: 'セキュリティ設定',
    intro: 'Cloudflare Turnstile でログインと初回オーナー登録を保護します。',
    status: '保護状況',
    disabled: '無効',
    enabled: '有効',
    incomplete: '設定未完了',
    manageWidget: 'Cloudflare の Turnstile を開く',
    widgetSetup:
      'ウィジェットを追加し、モードに「マネージド」を選び、下のホスト名を追加します。事前クリアランスはオフのままにします。ドメインを変更したときは、新しいホスト名もウィジェットに追加します。',
    hostname: '確認するホスト名',
    manageWorker: 'Cloudflare の Workers & Pages を開く',
    secretSetup:
      '対象の Worker を選び、「設定」から「変数とシークレット」で追加します。種類は「シークレット」、名前は TURNSTILE_SECRET_KEY を指定し、ウィジェットの秘密鍵を貼り付けてデプロイします。',
    siteKey: 'サイトキー',
    siteKeyHint: 'ウィジェットの公開サイトキーをコピーします。',
    prepare: '検証に進む',
    verifyEnable: '検証して有効にする',
    verifySave: '検証して保存する',
    verify: '下の認証を完了し、このホスト名でサイトキーと秘密鍵を確認します。',
    edit: 'サイトキーを変更する',
    disable: 'Turnstile を無効にする',
    saved: '検証に成功しました。Turnstile は有効です。',
    turnedOff: 'Turnstile は無効です。',
    missingSiteKey: 'ウィジェットの公開サイトキーを入力してください。',
    missingSecret:
      'Worker に TURNSTILE_SECRET_KEY を追加してデプロイし、もう一度お試しください。',
    invalidKeys:
      '公開サイトキーをコピーしたか確認してください。このホスト名では本番用の鍵を使います。',
    verificationFailed:
      '検証に失敗しました。ウィジェットがこのホスト名を許可していることと、両方の鍵が同じウィジェットのものであることを確認し、もう一度お試しください。',
    rotate:
      'Turnstile で秘密鍵を更新したら、Worker のシークレットを更新し、ここで再検証します。',
  },
  'zh-CN': {
    title: '安全设置',
    intro: '使用 Cloudflare Turnstile 保护登录和首次所有者注册。',
    status: '保护状态',
    disabled: '已关闭',
    enabled: '已开启',
    incomplete: '设置未完成',
    manageWidget: '在 Cloudflare 中打开 Turnstile',
    widgetSetup:
      '选择添加小组件，使用托管模式，添加下方的主机名，并保持预先验证关闭。更换域名后，请将新的主机名添加到小组件。',
    hostname: '本次验证的主机名',
    manageWorker: '在 Cloudflare 中打开 Workers & Pages',
    secretSetup:
      '选择你的 Worker，然后打开设置 → 变量和机密 → 添加。类型选择机密，名称输入 TURNSTILE_SECRET_KEY，粘贴小组件的密钥并部署。',
    siteKey: '站点密钥',
    siteKeyHint: '复制小组件的公开站点密钥。',
    prepare: '继续验证',
    verifyEnable: '验证并启用',
    verifySave: '验证并保存',
    verify: '完成下方验证，检查此主机名的站点密钥和密钥。',
    edit: '更改站点密钥',
    disable: '停用 Turnstile',
    saved: '验证成功。Turnstile 已启用。',
    turnedOff: 'Turnstile 已停用。',
    missingSiteKey: '请输入小组件的公开站点密钥。',
    missingSecret: '将 TURNSTILE_SECRET_KEY 添加到 Worker 并部署后重试。',
    invalidKeys: '请确认复制的是公开站点密钥。此主机名须使用生产环境密钥。',
    verificationFailed:
      '验证失败。请确认小组件允许此主机名且两个密钥属于同一小组件，然后重试。',
    rotate: '在 Turnstile 中轮换密钥，更新 Worker 的机密，然后再次验证。',
  },
  'zh-TW': {
    title: '安全性設定',
    intro: '使用 Cloudflare Turnstile 保護登入及首次擁有者註冊。',
    status: '保護狀態',
    disabled: '已關閉',
    enabled: '已開啟',
    incomplete: '設定未完成',
    manageWidget: '在 Cloudflare 中開啟 Turnstile',
    widgetSetup:
      '選取新增小工具，使用受管理模式，新增下方的主機名稱，並維持預先驗證關閉。更換網域後，請將新的主機名稱新增至小工具。',
    hostname: '本次驗證的主機名稱',
    manageWorker: '在 Cloudflare 中開啟 Workers & Pages',
    secretSetup:
      '選取你的 Worker，再開啟設定 → 變數和密碼 → 新增。類型選擇密碼，名稱輸入 TURNSTILE_SECRET_KEY，貼上小工具的私密金鑰並部署。',
    siteKey: '網站金鑰',
    siteKeyHint: '複製小工具的公開網站金鑰。',
    prepare: '繼續驗證',
    verifyEnable: '驗證並啟用',
    verifySave: '驗證並儲存',
    verify: '完成下方驗證，檢查此主機名稱的網站金鑰和私密金鑰。',
    edit: '變更網站金鑰',
    disable: '停用 Turnstile',
    saved: '驗證成功。Turnstile 已啟用。',
    turnedOff: 'Turnstile 已停用。',
    missingSiteKey: '請輸入小工具的公開網站金鑰。',
    missingSecret: '將 TURNSTILE_SECRET_KEY 新增至 Worker 並部署後再試。',
    invalidKeys: '請確認複製的是公開網站金鑰。此主機名稱須使用正式環境金鑰。',
    verificationFailed:
      '驗證失敗。請確認小工具允許此主機名稱且兩把金鑰屬於同一小工具，然後再試。',
    rotate: '在 Turnstile 輪替私密金鑰後，更新 Worker 的密碼，再驗證一次。',
  },
  es: {
    title: 'Configuración de seguridad',
    intro:
      'Usa Cloudflare Turnstile para proteger el inicio de sesión y el registro inicial del propietario.',
    status: 'Protección',
    disabled: 'Desactivada',
    enabled: 'Activada',
    incomplete: 'Configuración incompleta',
    manageWidget: 'Abrir Turnstile en Cloudflare',
    widgetSetup:
      'Selecciona Añadir widget. Elige el modo Gestionado, añade el nombre de host que aparece abajo y deja desactivada la autorización previa. Añade cada nombre de host nuevo al widget cuando cambies de dominio.',
    hostname: 'Nombre de host de la verificación',
    manageWorker: 'Abrir Workers & Pages en Cloudflare',
    secretSetup:
      'Selecciona tu Worker y ve a Configuración → Variables y secretos → Añadir. Elige el tipo Secreto, escribe TURNSTILE_SECRET_KEY como nombre, pega la clave secreta del widget y despliega los cambios.',
    siteKey: 'Clave del sitio',
    siteKeyHint: 'Copia la clave pública del sitio de tu widget.',
    prepare: 'Continuar con la verificación',
    verifyEnable: 'Verificar y activar',
    verifySave: 'Verificar y guardar',
    verify:
      'Completa la comprobación de abajo para verificar la clave del sitio y la clave secreta de este nombre de host.',
    edit: 'Cambiar la clave del sitio',
    disable: 'Desactivar Turnstile',
    saved: 'Verificación completada. Turnstile está activado.',
    turnedOff: 'Turnstile está desactivado.',
    missingSiteKey: 'Introduce la clave pública del sitio de tu widget.',
    missingSecret:
      'Añade TURNSTILE_SECRET_KEY a tu Worker, despliega los cambios y vuelve a intentarlo.',
    invalidKeys:
      'Comprueba que has copiado la clave pública del sitio. Usa claves de producción en este nombre de host.',
    verificationFailed:
      'La verificación ha fallado. Comprueba que el widget permite este nombre de host y que ambas claves pertenecen al mismo widget. Después, vuelve a intentarlo.',
    rotate:
      'Rota la clave secreta en Turnstile, actualiza el secreto del Worker y repite esta verificación.',
  },
  it: {
    title: 'Impostazioni di sicurezza',
    intro:
      'Usa Cloudflare Turnstile per proteggere l’accesso e la registrazione iniziale del proprietario.',
    status: 'Protezione',
    disabled: 'Disattivata',
    enabled: 'Attiva',
    incomplete: 'Configurazione incompleta',
    manageWidget: 'Apri Turnstile in Cloudflare',
    widgetSetup:
      'Seleziona Aggiungi widget. Scegli la modalità Gestita, aggiungi il nome host qui sotto e lascia disattivata la pre-autorizzazione. Quando cambi dominio, aggiungi ogni nuovo nome host al widget.',
    hostname: 'Nome host della verifica',
    manageWorker: 'Apri Workers & Pages in Cloudflare',
    secretSetup:
      'Seleziona il tuo Worker, poi vai a Impostazioni → Variabili e segreti → Aggiungi. Scegli il tipo Segreto, assegna il nome TURNSTILE_SECRET_KEY, incolla la chiave segreta del widget e distribuisci le modifiche.',
    siteKey: 'Chiave del sito',
    siteKeyHint: 'Copia la chiave pubblica del sito dal tuo widget.',
    prepare: 'Continua con la verifica',
    verifyEnable: 'Verifica e attiva',
    verifySave: 'Verifica e salva',
    verify:
      'Completa il controllo qui sotto per verificare la chiave del sito e la chiave segreta per questo nome host.',
    edit: 'Modifica la chiave del sito',
    disable: 'Disattiva Turnstile',
    saved: 'Verifica completata. Turnstile è attivo.',
    turnedOff: 'Turnstile è disattivato.',
    missingSiteKey: 'Inserisci la chiave pubblica del sito del tuo widget.',
    missingSecret:
      'Aggiungi TURNSTILE_SECRET_KEY al Worker, distribuisci le modifiche e riprova.',
    invalidKeys:
      'Controlla di aver copiato la chiave pubblica del sito. Usa le chiavi di produzione per questo nome host.',
    verificationFailed:
      'Verifica non riuscita. Controlla che il widget consenta questo nome host e che entrambe le chiavi appartengano allo stesso widget, quindi riprova.',
    rotate:
      'Sostituisci la chiave segreta in Turnstile, aggiorna il segreto del Worker e ripeti la verifica.',
  },
  fr: {
    title: 'Paramètres de sécurité',
    intro:
      'Utilisez Cloudflare Turnstile pour protéger la connexion et la configuration initiale du compte propriétaire.',
    status: 'Protection',
    disabled: 'Désactivée',
    enabled: 'Activée',
    incomplete: 'Configuration incomplète',
    manageWidget: 'Ouvrir Turnstile dans Cloudflare',
    widgetSetup:
      'Sélectionnez Add widget (Ajouter un widget). Choisissez Managed (Géré), ajoutez le nom d’hôte indiqué ci-dessous et laissez le précontrôle (pre-clearance) désactivé. Ajoutez chaque nouveau nom d’hôte ici si vous changez de domaine.',
    hostname: 'Nom d’hôte à vérifier',
    manageWorker: 'Ouvrir Workers & Pages dans Cloudflare',
    secretSetup:
      'Sélectionnez votre Worker, puis Settings → Variables and Secrets → Add. Choisissez Secret, nommez-le TURNSTILE_SECRET_KEY, collez la clé secrète du widget, puis déployez le Worker.',
    siteKey: 'Clé de site',
    siteKeyHint: 'Copiez la clé de site publique de votre widget.',
    prepare: 'Passer à la vérification',
    verifyEnable: 'Vérifier et activer',
    verifySave: 'Vérifier et enregistrer',
    verify:
      'Effectuez le contrôle ci-dessous pour vérifier la clé de site et la clé secrète pour ce nom d’hôte.',
    edit: 'Modifier la clé de site',
    disable: 'Désactiver Turnstile',
    saved: 'Vérification réussie. Turnstile est activé.',
    turnedOff: 'Turnstile est désactivé.',
    missingSiteKey: 'Saisissez la clé de site publique de votre widget.',
    missingSecret:
      'Ajoutez TURNSTILE_SECRET_KEY à votre Worker, déployez-le, puis réessayez.',
    invalidKeys:
      'Vérifiez que vous avez copié la clé de site publique. Utilisez des clés de production pour ce nom d’hôte.',
    verificationFailed:
      'La vérification a échoué. Vérifiez que le widget autorise ce nom d’hôte et que les deux clés appartiennent au même widget, puis réessayez.',
    rotate:
      'Générez une nouvelle clé secrète dans Turnstile, mettez à jour le secret du Worker, puis effectuez à nouveau cette vérification.',
  },
} satisfies Record<Locale, typeof en>;

export function securityMessages(locale: Locale) {
  return messages[locale];
}
