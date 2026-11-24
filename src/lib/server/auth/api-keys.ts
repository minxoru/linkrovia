import { hex, randomHex, sha256, uuidV7 } from './crypto';
import type { SessionUser } from './session';

export const apiKeyScopes = [
  'links:read',
  'links:write',
  'domains:write',
  'analytics:read',
  'conversions:write',
  'conversions:manage',
  'mcp:connect',
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

interface ApiKeyPrincipal {
  id: string;
  userId: string;
  role: SessionUser['role'];
  scopes: ApiKeyScope[];
}

function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return apiKeyScopes.some((scope) => scope === value);
}

function parseScopes(json: string): ApiKeyScope[] {
  try {
    const scopes: unknown = JSON.parse(json);
    if (Array.isArray(scopes) && scopes.every(isApiKeyScope)) return scopes;
  } catch {
    // A malformed stored scope set cannot authorize a request.
  }
  return [];
}

export async function createApiKey(
  db: D1Database,
  userId: string,
  input: { name: string; scopes: readonly string[]; expiresAt?: number | null },
): Promise<(ApiKey & { token: string }) | null> {
  const name = input.name.trim();
  const scopes = [...new Set(input.scopes)];
  const expiresAt = input.expiresAt ?? null;
  if (
    !name ||
    name.length > 80 ||
    !name.isWellFormed() ||
    /\p{Cc}/u.test(name) ||
    scopes.length === 0 ||
    !scopes.every(isApiKeyScope) ||
    (expiresAt !== null && !Number.isSafeInteger(expiresAt))
  ) {
    return null;
  }

  const id = uuidV7();
  const prefix = `lrk_${randomHex(6)}`;
  const token = `${prefix}_${randomHex(32)}`;
  const createdAt = await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, expires_at)
       SELECT ?, id, ?, ?, ?, ?, ?
       FROM users
       WHERE id = ? AND disabled_at IS NULL AND (? IS NULL OR ? > unixepoch())
       RETURNING created_at`,
    )
    .bind(
      id,
      name,
      prefix,
      hex(await sha256(token)),
      JSON.stringify(scopes),
      expiresAt,
      userId,
      expiresAt,
      expiresAt,
    )
    .first<number>('created_at');
  if (createdAt === null) return null;
  return {
    id,
    name,
    prefix,
    scopes,
    createdAt,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    token,
  };
}

export async function listApiKeys(
  db: D1Database,
  userId: string,
): Promise<ApiKey[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, prefix, scopes, created_at AS createdAt,
              expires_at AS expiresAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
       FROM api_keys WHERE user_id = ?
       ORDER BY revoked_at IS NOT NULL, created_at DESC, id DESC`,
    )
    .bind(userId)
    .all<Omit<ApiKey, 'scopes'> & { scopes: string }>();
  return results.map((row) => ({ ...row, scopes: parseScopes(row.scopes) }));
}

export async function revokeApiKey(
  db: D1Database,
  userId: string,
  keyId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `UPDATE api_keys SET revoked_at = unixepoch()
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(keyId, userId)
    .run();
  return meta.changes === 1;
}

export async function authorizeApiKey(
  db: D1Database,
  authorization: string | null,
  required?: ApiKeyScope,
  { recordUse = true }: { recordUse?: boolean } = {},
): Promise<ApiKeyPrincipal | null> {
  if (!authorization || authorization.length !== 88) return null;
  const match = /^Bearer (lrk_[0-9a-f]{12}_[0-9a-f]{64})$/i.exec(authorization);
  if (!match || match[0] !== authorization) return null;

  const key = await db
    .prepare(
      `SELECT api_keys.id, users.id AS userId, users.role, api_keys.scopes,
              unixepoch('now', 'start of day') AS today, api_keys.last_used_at AS lastUsedAt
       FROM api_keys JOIN users ON users.id = api_keys.user_id
       WHERE api_keys.key_hash = ? AND api_keys.revoked_at IS NULL
         AND (api_keys.expires_at IS NULL OR api_keys.expires_at > unixepoch())
         AND users.disabled_at IS NULL`,
    )
    .bind(hex(await sha256(match[1])))
    .first<
      Omit<ApiKeyPrincipal, 'scopes'> & {
        scopes: string;
        today: number;
        lastUsedAt: number | null;
      }
    >();
  if (!key) return null;
  const scopes = parseScopes(key.scopes);
  if (scopes.length === 0 || (required && !scopes.includes(required))) {
    return null;
  }

  if (recordUse && (key.lastUsedAt === null || key.lastUsedAt < key.today)) {
    // The condition also suppresses overlapping updates across Workers.
    await db
      .prepare(
        `UPDATE api_keys SET last_used_at = unixepoch()
         WHERE id = ? AND revoked_at IS NULL
           AND (last_used_at IS NULL OR last_used_at < unixepoch('now', 'start of day'))`,
      )
      .bind(key.id)
      .run();
  }

  return { id: key.id, userId: key.userId, role: key.role, scopes };
}
