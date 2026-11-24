export const mcpMessages = {
  en: {
    endpoint: 'Endpoint',
    enable: 'Enable MCP',
    disable: 'Disable MCP',
    keys: 'Manage API keys',
    connect:
      'Create a dedicated API key with mcp:connect and the scopes for the tools you want to use. Start with links:read for read-only link access. Revoke the key from the API keys page when you no longer need it.',
    client:
      'Linkrovia connects to AI tools over Streamable HTTP using a scoped API key.',
    enabled: 'MCP is enabled',
    disabled: 'MCP is disabled',
    clients: 'Connect a client',
    tools: 'Available tools and scopes',
    tokenPrompt: 'Linkrovia MCP API key',
    environment:
      'Set LINKROVIA_MCP_TOKEN in the environment where this client runs, then restart the client.',
    merge:
      'Merge the example into your existing settings if the file already exists.',
    approveClaudeCode:
      'Open the project in Claude Code, trust the project and approve the Linkrovia server when prompted.',
    vsCode: 'VS Code prompts for the key when it connects.',
    claudeConnector:
      'In Claude, add a custom web connector under Customize → Connectors. Enter the endpoint above, choose No sign-in and add the header under Request headers. Replace YOUR_LINKROVIA_API_KEY with your key.',
    claudeNetwork:
      'The request header feature is in limited beta. Claude connects from its cloud and requires a publicly reachable HTTPS endpoint on port 443.',
    claudeDesktop:
      'Install Node.js and mcp-remote 0.16.6. In Claude Desktop, open Settings → Developer → Edit Config. Set LINKROVIA_MCP_AUTHORIZATION in the environment inherited by Claude Desktop to Bearer followed by a space and your key. Fully restart Claude Desktop.',
    chatgpt:
      'ChatGPT custom apps use OAuth to connect to authenticated servers. This endpoint uses an API key.',
    secret:
      'Some clients store keys in plain text. Use your client’s secret storage or an environment variable when available.',
  },
  ja: {
    endpoint: 'エンドポイント',
    enable: 'MCP を有効にする',
    disable: 'MCP を無効にする',
    keys: 'API キーを管理',
    connect:
      'mcp:connect と、使うツールに必要なスコープを付けた専用 API キーを作成します。リンクの読み取りだけなら links:read を追加します。不要になったキーは API キー画面で失効させてください。',
    client:
      'Linkrovia は、権限を限定した API キーと Streamable HTTP で AI ツールに接続します。',
    enabled: 'MCP は有効です',
    disabled: 'MCP は無効です',
    clients: 'クライアントを接続',
    tools: '利用できるツールとスコープ',
    tokenPrompt: 'Linkrovia の MCP 用 API キー',
    environment:
      'クライアントの実行環境に LINKROVIA_MCP_TOKEN を設定し、クライアントを再起動してください。',
    merge: '設定ファイルがある場合は、既存の設定に例の内容を追加してください。',
    approveClaudeCode:
      'Claude Code でプロジェクトを開き、信頼を確認した後、表示された Linkrovia サーバーの接続を承認してください。',
    vsCode: '接続時に VS Code が API キーの入力を求めます。',
    claudeConnector:
      'Claude の「カスタマイズ」→「コネクタ」でカスタム Web コネクタを追加します。上の URL を入力し、サインインなしを選びます。リクエストヘッダーに下の項目を追加し、YOUR_LINKROVIA_API_KEY を発行したキーに置き換えてください。',
    claudeNetwork:
      'リクエストヘッダーは一部の組織向けのベータ機能です。Claude のクラウドから接続するため、インターネットから HTTPS の 443 番ポートで接続できる必要があります。',
    claudeDesktop:
      'Node.js と mcp-remote 0.16.6 をインストールします。Claude Desktop の「設定」→「開発者」→「構成を編集」を開きます。Claude Desktop が継承する環境変数 LINKROVIA_MCP_AUTHORIZATION に、Bearer、半角スペース、API キーの順で値を設定し、Claude Desktop を完全に終了して再起動してください。',
    chatgpt:
      'ChatGPT のカスタムアプリは認証に OAuth を使います。このエンドポイントの認証には API キーが必要です。',
    secret:
      'キーを平文で保存するクライアントもあります。利用可能な場合はクライアントのシークレット保管機能か環境変数を使用してください。',
  },
  'zh-CN': {
    endpoint: '端点',
    enable: '启用 MCP',
    disable: '禁用 MCP',
    keys: '管理 API 密钥',
    connect:
      '创建专用 API 密钥，授予 mcp:connect 和所需工具的权限。若只需读取链接，请添加 links:read。不再使用时，请在 API 密钥页面撤销该密钥。',
    client:
      'Linkrovia 通过 Streamable HTTP 和限定权限的 API 密钥连接 AI 工具。',
    enabled: 'MCP 已启用',
    disabled: 'MCP 已禁用',
    clients: '连接客户端',
    tools: '可用工具及权限',
    tokenPrompt: 'Linkrovia MCP API 密钥',
    environment:
      '请在客户端的运行环境中设置 LINKROVIA_MCP_TOKEN，然后重启客户端。',
    merge: '如果文件已存在，请将示例合并到现有配置中。',
    approveClaudeCode:
      '在 Claude Code 中打开项目，确认信任该项目，并在提示时批准连接 Linkrovia 服务器。',
    vsCode: '连接时，VS Code 会提示您输入密钥。',
    claudeConnector:
      '在 Claude 的 Customize → Connectors 中添加自定义 Web 连接器。输入上方的端点，选择 No sign-in，在 Request headers 中添加下方的请求头，并将 YOUR_LINKROVIA_API_KEY 替换为您的密钥。',
    claudeNetwork:
      '请求头功能仅对部分组织开放测试。Claude 从云端连接，要求端点可通过公网 HTTPS 的 443 端口访问。',
    claudeDesktop:
      '安装 Node.js 和 mcp-remote 0.16.6。在 Claude Desktop 中打开 Settings → Developer → Edit Config。将 Claude Desktop 继承的环境变量 LINKROVIA_MCP_AUTHORIZATION 设置为 Bearer、空格和您的密钥，然后完全退出并重启。',
    chatgpt:
      'ChatGPT 自定义应用通过 OAuth 连接需要身份验证的服务器。此端点使用 API 密钥。',
    secret:
      '部分客户端会以明文存储密钥。如有条件，请使用客户端的密钥存储功能或环境变量。',
  },
  'zh-TW': {
    endpoint: '端點',
    enable: '啟用 MCP',
    disable: '停用 MCP',
    keys: '管理 API 金鑰',
    connect:
      '建立專用 API 金鑰，加入 mcp:connect 和所用工具的權限。若只需讀取連結，請加入 links:read。不再使用時，請在 API 金鑰頁面撤銷金鑰。',
    client:
      'Linkrovia 透過 Streamable HTTP 和限定權限的 API 金鑰連接 AI 工具。',
    enabled: 'MCP 已啟用',
    disabled: 'MCP 已停用',
    clients: '連接用戶端',
    tools: '可用工具及權限',
    tokenPrompt: 'Linkrovia MCP API 金鑰',
    environment:
      '請在用戶端的執行環境中設定 LINKROVIA_MCP_TOKEN，然後重新啟動用戶端。',
    merge: '如果檔案已存在，請將範例合併到現有設定中。',
    approveClaudeCode:
      '在 Claude Code 中開啟專案，確認信任專案，並在提示時核准連線至 Linkrovia 伺服器。',
    vsCode: '連線時，VS Code 會提示您輸入金鑰。',
    claudeConnector:
      '在 Claude 的 Customize → Connectors 中新增自訂 Web 連接器。輸入上方的端點，選擇 No sign-in，在 Request headers 中新增下方的標頭，並將 YOUR_LINKROVIA_API_KEY 替換為您的金鑰。',
    claudeNetwork:
      '要求標頭功能僅開放部分組織測試。Claude 從雲端連線，端點須可透過公開網路的 HTTPS 連接埠 443 存取。',
    claudeDesktop:
      '安裝 Node.js 和 mcp-remote 0.16.6。在 Claude Desktop 中開啟 Settings → Developer → Edit Config。將 Claude Desktop 繼承的環境變數 LINKROVIA_MCP_AUTHORIZATION 設為 Bearer、空格和您的金鑰，然後完全結束並重新啟動。',
    chatgpt:
      'ChatGPT 自訂應用程式透過 OAuth 連線至需要驗證的伺服器。此端點使用 API 金鑰。',
    secret:
      '部分用戶端會以明文儲存金鑰。若可使用安全儲存功能或環境變數，請優先採用。',
  },
  es: {
    endpoint: 'URL de conexión',
    enable: 'Activar MCP',
    disable: 'Desactivar MCP',
    keys: 'Gestionar claves de API',
    connect:
      'Crea una clave de API exclusiva con mcp:connect y los permisos de las herramientas que necesitas. Usa links:read para consultar enlaces. Revoca la clave desde la página de claves de API cuando dejes de usarla.',
    client:
      'Linkrovia se conecta a herramientas de IA mediante Streamable HTTP y una clave de API con permisos limitados.',
    enabled: 'MCP está activado',
    disabled: 'MCP está desactivado',
    clients: 'Conectar un cliente',
    tools: 'Herramientas y permisos disponibles',
    tokenPrompt: 'Clave de API de Linkrovia para MCP',
    environment:
      'Configura LINKROVIA_MCP_TOKEN en el entorno donde se ejecuta el cliente y reinícialo.',
    merge:
      'Si el archivo ya existe, incorpora el ejemplo a la configuración existente.',
    approveClaudeCode:
      'Abre el proyecto en Claude Code, confirma que confías en él y aprueba el servidor de Linkrovia cuando se te solicite.',
    vsCode: 'VS Code te pedirá la clave al conectarse.',
    claudeConnector:
      'En Claude, añade un conector web personalizado desde Customize → Connectors. Introduce la URL indicada arriba, elige No sign-in y añade la cabecera indicada en Request headers. Sustituye YOUR_LINKROVIA_API_KEY por tu clave.',
    claudeNetwork:
      'La opción de cabeceras está en beta para un grupo limitado de organizaciones. Claude se conecta desde la nube y necesita una URL HTTPS accesible públicamente por el puerto 443.',
    claudeDesktop:
      'Instala Node.js y mcp-remote 0.16.6. En Claude Desktop, abre Settings → Developer → Edit Config. Define LINKROVIA_MCP_AUTHORIZATION en el entorno que hereda Claude Desktop con Bearer, un espacio y tu clave. Cierra Claude Desktop por completo y vuelve a abrirlo.',
    chatgpt:
      'Las aplicaciones personalizadas de ChatGPT usan OAuth para conectar con servidores autenticados. Esta URL usa una clave de API.',
    secret:
      'Algunos clientes guardan las claves en texto plano. Si es posible, usa el almacén seguro del cliente o una variable de entorno.',
  },
  it: {
    endpoint: 'URL di connessione',
    enable: 'Attiva MCP',
    disable: 'Disattiva MCP',
    keys: 'Gestisci le chiavi API',
    connect:
      'Crea una chiave API dedicata con mcp:connect e i permessi degli strumenti che vuoi usare. Per leggere i link, usa links:read. Revoca la chiave dalla pagina delle chiavi API quando non ti serve più.',
    client:
      'Linkrovia si collega agli strumenti di IA tramite Streamable HTTP e una chiave API con permessi limitati.',
    enabled: 'MCP è attivo',
    disabled: 'MCP è disattivato',
    clients: 'Collega un client',
    tools: 'Strumenti e permessi disponibili',
    tokenPrompt: 'Chiave API Linkrovia per MCP',
    environment:
      'Imposta LINKROVIA_MCP_TOKEN nell’ambiente in cui viene eseguito il client e riavvialo.',
    merge:
      'Se il file esiste già, integra l’esempio nelle impostazioni esistenti.',
    approveClaudeCode:
      'Apri il progetto in Claude Code, conferma che è attendibile e approva il server Linkrovia quando richiesto.',
    vsCode: 'VS Code chiede la chiave al momento della connessione.',
    claudeConnector:
      'In Claude aggiungi un connettore web personalizzato da Customize → Connectors. Inserisci l’URL qui sopra, seleziona No sign-in e aggiungi l’intestazione qui sotto in Request headers. Sostituisci YOUR_LINKROVIA_API_KEY con la tua chiave.',
    claudeNetwork:
      'Le intestazioni sono in beta per un numero limitato di organizzazioni. Claude si collega dal cloud e richiede un URL HTTPS raggiungibile pubblicamente sulla porta 443.',
    claudeDesktop:
      'Installa Node.js e mcp-remote 0.16.6. In Claude Desktop apri Settings → Developer → Edit Config. Imposta LINKROVIA_MCP_AUTHORIZATION nell’ambiente ereditato da Claude Desktop con Bearer, uno spazio e la tua chiave. Chiudi completamente Claude Desktop e riaprilo.',
    chatgpt:
      'Le app personalizzate di ChatGPT utilizzano OAuth per accedere ai server autenticati. Questo endpoint usa una chiave API.',
    secret:
      'Alcuni client salvano le chiavi in chiaro. Se possibile, usa l’archivio sicuro del client o una variabile d’ambiente.',
  },
  fr: {
    endpoint: 'URL de connexion',
    enable: 'Activer MCP',
    disable: 'Désactiver MCP',
    keys: 'Gérer les clés API',
    connect:
      'Créez une clé API dédiée dotée de mcp:connect et des autorisations requises par les outils. Pour consulter les liens, utilisez links:read. Révoquez la clé depuis la page des clés API lorsque vous n’en avez plus besoin.',
    client:
      'Linkrovia se connecte aux outils d’IA via Streamable HTTP et une clé API à portée limitée.',
    enabled: 'MCP est activé',
    disabled: 'MCP est désactivé',
    clients: 'Connecter un client',
    tools: 'Outils et autorisations disponibles',
    tokenPrompt: 'Clé API Linkrovia pour MCP',
    environment:
      'Définissez LINKROVIA_MCP_TOKEN dans l’environnement où s’exécute le client, puis redémarrez-le.',
    merge:
      'Si le fichier existe déjà, intégrez l’exemple aux paramètres existants.',
    approveClaudeCode:
      'Ouvrez le projet dans Claude Code, confirmez que vous lui faites confiance et approuvez le serveur Linkrovia lorsque vous y êtes invité.',
    vsCode: 'VS Code vous invite à saisir la clé lors de la connexion.',
    claudeConnector:
      'Dans Claude, ajoutez un connecteur web personnalisé depuis Customize → Connectors. Saisissez l’URL ci-dessus, choisissez No sign-in et ajoutez l’en-tête ci-dessous dans Request headers. Remplacez YOUR_LINKROVIA_API_KEY par votre clé.',
    claudeNetwork:
      'Les en-têtes de requête sont en bêta dans certaines organisations. Claude se connecte depuis le cloud et nécessite une URL HTTPS accessible publiquement sur le port 443.',
    claudeDesktop:
      'Installez Node.js et mcp-remote 0.16.6. Dans Claude Desktop, ouvrez Settings → Developer → Edit Config. Définissez LINKROVIA_MCP_AUTHORIZATION dans l’environnement hérité par Claude Desktop avec Bearer, une espace et votre clé. Quittez Claude Desktop complètement, puis relancez-le.',
    chatgpt:
      'Les applications personnalisées de ChatGPT utilisent OAuth pour les serveurs authentifiés. Ce point de terminaison utilise une clé API.',
    secret:
      'Certains clients conservent les clés en clair. Utilisez le stockage sécurisé du client ou une variable d’environnement si possible.',
  },
};
