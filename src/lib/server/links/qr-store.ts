import { getLink } from './store';

const defaultId = (linkId: string) => `default:${linkId}`;
export async function getDefaultQr(db: D1Database, linkId: string) {
  return db
    .prepare('SELECT token FROM qr_codes WHERE id = ? AND link_id = ?')
    .bind(defaultId(linkId), linkId)
    .first<{ token: string }>();
}
export async function ensureDefaultQr(db: D1Database, linkId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  await db
    .prepare(
      `INSERT INTO qr_codes (id, link_id, token)
       SELECT ?, l.id, ? FROM links l JOIN domains d ON d.id = l.domain_id
       WHERE l.id = ? AND l.deleted_at IS NULL AND d.is_active = 1 AND d.connection_status = 'active'
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(defaultId(linkId), token, linkId)
    .run();
  return getDefaultQr(db, linkId);
}
export async function qrLink(db: D1Database, id: string) {
  const link = await getLink(db, id);
  if (!link) return null;
  const active = await db
    .prepare(
      "SELECT id FROM domains WHERE id = ? AND is_active = 1 AND connection_status = 'active'",
    )
    .bind(link.domainId)
    .first();
  return active ? link : null;
}
