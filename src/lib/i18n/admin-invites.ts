import type { Locale } from './locale';

const en = {
  title: 'Administrator access',
  intro: 'Invite administrators to manage links and view reports.',
  invite: 'Create invitation',
  link: 'Invitation link',
  share:
    'Copy this link and send it privately to the intended recipient. It expires in 24 hours and works once.',
  copy: 'Copy link',
  copied: 'Link copied.',
  duplicate: 'This email already has an account or a pending invitation.',
  pending: 'Pending invitations',
  expires: 'Expires',
  revoke: 'Revoke',
  noInvites: 'No pending invitations.',
  admins: 'Administrators',
  disabled: 'Disabled',
  disable: 'Disable access',
  confirmDisable:
    'Disable this administrator and revoke their sessions and API keys?',
  noAdmins: 'No administrators have been added.',
  acceptTitle: 'Accept administrator invitation',
  acceptIntro:
    'Create a passkey to sign in with the email address selected by the owner.',
  invalidInvite:
    'This invitation is invalid, expired, revoked, or already used. Ask the owner for a new invitation.',
  registeredWithoutSession:
    'Your passkey was created. Sign in with it to finish.',
  signedIn: 'Sign out of your current account before accepting an invitation.',
};

export const adminInviteMessages = {
  en,
  ja: {
    title: '管理者アクセス',
    intro: 'リンクの管理やレポートの閲覧を行う管理者を招待できます。',
    invite: '招待を作成',
    link: '招待リンク',
    share:
      'リンクをコピーし、招待する相手に直接送ってください。有効期間は24時間で、一度だけ使えます。',
    copy: 'リンクをコピー',
    copied: 'リンクをコピーしました。',
    duplicate:
      'このメールアドレスには、すでにアカウントまたは保留中の招待があります。',
    pending: '保留中の招待',
    expires: '有効期限',
    revoke: '招待を取り消す',
    noInvites: '保留中の招待はありません。',
    admins: '管理者',
    disabled: '無効',
    disable: 'アクセスを無効にする',
    confirmDisable:
      'この管理者を無効にし、セッションと API キーを取り消しますか？',
    noAdmins: '管理者はまだ追加されていません。',
    acceptTitle: '管理者の招待を受ける',
    acceptIntro:
      'パスキーを作成すると、オーナーが指定したメールアドレスでサインインできます。',
    invalidInvite:
      'この招待は無効、有効期限切れ、取り消し済み、または使用済みです。オーナーに新しい招待を依頼してください。',
    registeredWithoutSession:
      'パスキーを作成しました。そのパスキーでサインインして完了してください。',
    signedIn:
      '招待を受ける前に、現在のアカウントからサインアウトしてください。',
  },
  'zh-CN': {
    title: '管理员访问权限',
    intro: '邀请管理员管理链接并查看报告。',
    invite: '创建邀请',
    link: '邀请链接',
    share: '请复制链接并私下发送给受邀人。链接 24 小时后过期，只能使用一次。',
    copy: '复制链接',
    copied: '已复制链接。',
    duplicate: '此邮箱已有账号或待接受的邀请。',
    pending: '待接受的邀请',
    expires: '过期时间',
    revoke: '撤销邀请',
    noInvites: '没有待接受的邀请。',
    admins: '管理员',
    disabled: '已停用',
    disable: '停用权限',
    confirmDisable: '要停用此管理员并撤销其会话和 API 密钥吗？',
    noAdmins: '尚未添加管理员。',
    acceptTitle: '接受管理员邀请',
    acceptIntro: '创建通行密钥后，即可使用所有者指定的邮箱登录。',
    invalidInvite: '邀请无效、已过期、已撤销或已使用。请向所有者索取新的邀请。',
    registeredWithoutSession: '通行密钥已创建。请使用它登录以完成操作。',
    signedIn: '请先退出当前账号，再接受邀请。',
  },
  'zh-TW': {
    title: '管理員存取權限',
    intro: '邀請管理員管理連結並查看報表。',
    invite: '建立邀請',
    link: '邀請連結',
    share:
      '請複製連結並私下傳送給受邀者。連結將於 24 小時後到期，僅可使用一次。',
    copy: '複製連結',
    copied: '已複製連結。',
    duplicate: '此電子郵件已關聯帳號或待接受的邀請。',
    pending: '待接受的邀請',
    expires: '到期時間',
    revoke: '撤銷邀請',
    noInvites: '沒有待接受的邀請。',
    admins: '管理員',
    disabled: '已停用',
    disable: '停用存取權限',
    confirmDisable: '要停用此管理員並撤銷其工作階段和 API 金鑰嗎？',
    noAdmins: '尚未新增管理員。',
    acceptTitle: '接受管理員邀請',
    acceptIntro: '建立通行金鑰後，即可使用擁有者指定的電子郵件登入。',
    invalidInvite: '邀請無效、已到期、已撤銷或已使用。請向擁有者索取新的邀請。',
    registeredWithoutSession: '已建立通行金鑰。請使用它登入以完成操作。',
    signedIn: '請先登出目前的帳號，再接受邀請。',
  },
  es: {
    title: 'Acceso de administradores',
    intro: 'Invita a administradores a gestionar enlaces y consultar informes.',
    invite: 'Crear invitación',
    link: 'Enlace de invitación',
    share:
      'Copia el enlace y envíalo por privado a la persona invitada. Caduca en 24 horas y se puede usar una sola vez.',
    copy: 'Copiar enlace',
    copied: 'Enlace copiado.',
    duplicate: 'Este correo ya tiene una cuenta o una invitación pendiente.',
    pending: 'Invitaciones pendientes',
    expires: 'Caduca el',
    revoke: 'Revocar invitación',
    noInvites: 'No hay invitaciones pendientes.',
    admins: 'Administradores',
    disabled: 'Desactivado',
    disable: 'Desactivar acceso',
    confirmDisable:
      '¿Quieres desactivar a este administrador y revocar sus sesiones y claves de API?',
    noAdmins: 'Todavía no hay administradores.',
    acceptTitle: 'Aceptar invitación de administrador',
    acceptIntro:
      'Crea una llave de acceso para iniciar sesión con el correo indicado por el propietario.',
    invalidInvite:
      'La invitación no es válida, ha caducado, se ha revocado o ya se ha usado. Solicita una nueva al propietario.',
    registeredWithoutSession:
      'Se ha creado tu llave de acceso. Inicia sesión con ella para terminar.',
    signedIn: 'Cierra la sesión de tu cuenta antes de aceptar la invitación.',
  },
  it: {
    title: 'Accesso amministratori',
    intro: 'Invita gli amministratori a gestire i link e consultare i report.',
    invite: 'Crea invito',
    link: 'Link di invito',
    share:
      'Copia il link e invialo in privato al destinatario. Scade dopo 24 ore e può essere usato una sola volta.',
    copy: 'Copia link',
    copied: 'Link copiato.',
    duplicate: 'Questo indirizzo ha già un account o un invito in sospeso.',
    pending: 'Inviti in sospeso',
    expires: 'Scade il',
    revoke: 'Revoca invito',
    noInvites: 'Nessun invito in sospeso.',
    admins: 'Amministratori',
    disabled: 'Disattivato',
    disable: 'Disattiva accesso',
    confirmDisable:
      'Vuoi disattivare questo amministratore e revocare le sue sessioni e chiavi API?',
    noAdmins: 'Non è ancora stato aggiunto alcun amministratore.',
    acceptTitle: 'Accetta invito come amministratore',
    acceptIntro:
      'Crea una passkey per accedere con l’indirizzo email indicato dal proprietario.',
    invalidInvite:
      'L’invito non è valido, è scaduto, è stato revocato o è già stato usato. Chiedi al proprietario un nuovo invito.',
    registeredWithoutSession:
      'La passkey è stata creata. Usala per accedere e completare la procedura.',
    signedIn: 'Esci dall’account corrente prima di accettare l’invito.',
  },
  fr: {
    title: 'Accès administrateur',
    intro:
      'Invitez des administrateurs à gérer les liens et à consulter les rapports.',
    invite: 'Créer une invitation',
    link: 'Lien d’invitation',
    share:
      'Copiez ce lien et envoyez-le en privé à la personne invitée. Il expire après 24 heures et ne fonctionne qu’une fois.',
    copy: 'Copier le lien',
    copied: 'Lien copié.',
    duplicate:
      'Cette adresse e-mail est déjà associée à un compte ou à une invitation en attente.',
    pending: 'Invitations en attente',
    expires: 'Expire le',
    revoke: 'Révoquer l’invitation',
    noInvites: 'Aucune invitation en attente.',
    admins: 'Administrateurs',
    disabled: 'Désactivé',
    disable: 'Désactiver l’accès',
    confirmDisable:
      'Voulez-vous désactiver cet administrateur et révoquer ses sessions et ses clés API ?',
    noAdmins: 'Aucun administrateur n’a encore été ajouté.',
    acceptTitle: 'Accepter l’invitation comme administrateur',
    acceptIntro:
      'Créez une clé d’accès pour vous connecter avec l’adresse e-mail indiquée par le propriétaire.',
    invalidInvite:
      'Cette invitation est invalide, expirée, révoquée ou déjà utilisée. Demandez au propriétaire une nouvelle invitation.',
    registeredWithoutSession:
      'Votre clé d’accès a été créée. Connectez-vous avec cette clé pour terminer.',
    signedIn:
      'Déconnectez-vous du compte actuel avant d’accepter l’invitation.',
  },
} satisfies Record<Locale, typeof en>;
