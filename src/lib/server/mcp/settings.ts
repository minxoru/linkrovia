import { uuidV7 } from '../auth/crypto';

export async function isMcpEnabled(db: D1Database): Promise<boolean> {
  return (
    (await db
      .prepare("SELECT json_value FROM app_settings WHERE key = 'mcp_enabled'")
      .first<string>('json_value')) === 'true'
  );
}

export async function setMcpEnabled(
  db: D1Database,
  actorId: string,
  enabled: boolean,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO app_settings (key, json_value) VALUES ('mcp_enabled', ?)
         ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value`,
      )
      .bind(JSON.stringify(enabled)),
    db
      .prepare(
        `INSERT INTO audit_events (id, user_id, action, entity_type)
         VALUES (?, ?, ?, 'integration')`,
      )
      .bind(uuidV7(), actorId, enabled ? 'mcp.enabled' : 'mcp.disabled'),
  ]);
}
