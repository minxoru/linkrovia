import { uuidV7 } from '../auth/crypto';
import { isObject } from '../links/api-input';

export type GoalInput = {
  name: string;
  eventName: string;
  linkId: string | null;
  attributionWindowHours: number;
  isActive: boolean;
};

export type ConversionGoal = GoalInput & { id: string };

const fields =
  'id, name, link_id AS linkId, event_name AS eventName, attribution_window_hours AS attributionWindowHours, is_active AS isActive';
type GoalRow = Omit<ConversionGoal, 'isActive'> & { isActive: number };
const asGoal = (row: GoalRow): ConversionGoal => ({
  ...row,
  isActive: row.isActive === 1,
});

export function parseGoal(value: unknown): GoalInput | null {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'name',
          'eventName',
          'linkId',
          'attributionWindowHours',
          'isActive',
        ].includes(key),
    )
  )
    return null;
  const {
    name,
    eventName,
    linkId = null,
    attributionWindowHours = 24,
    isActive = true,
  } = value;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 120 ||
    !name.isWellFormed() ||
    /\p{Cc}/u.test(name) ||
    typeof eventName !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(eventName) ||
    (linkId !== null &&
      (typeof linkId !== 'string' ||
        !/^[a-z0-9][a-z0-9_-]{0,95}$/i.test(linkId))) ||
    typeof attributionWindowHours !== 'number' ||
    !Number.isInteger(attributionWindowHours) ||
    attributionWindowHours < 1 ||
    attributionWindowHours > 720 ||
    typeof isActive !== 'boolean'
  )
    return null;
  return {
    name: name.trim(),
    eventName,
    linkId,
    attributionWindowHours,
    isActive,
  };
}

export async function listGoals(db: D1Database, linkId?: string) {
  const { results } = await db
    .prepare(
      `SELECT ${fields} FROM conversion_goals
    WHERE backup_archived_at IS NULL AND (?1 IS NULL OR link_id IS NULL OR link_id = ?1)
    ORDER BY name COLLATE NOCASE, id LIMIT 100`,
    )
    .bind(linkId ?? null)
    .all<GoalRow>();
  return results.map(asGoal);
}

export async function getGoal(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT ${fields} FROM conversion_goals WHERE id = ? AND backup_archived_at IS NULL`,
    )
    .bind(id)
    .first<GoalRow>();
  return row ? asGoal(row) : null;
}

const validLink =
  'EXISTS (SELECT 1 FROM links WHERE id = ? AND deleted_at IS NULL)';

export async function saveGoal(
  db: D1Database,
  input: GoalInput,
  id?: string,
  expected?: GoalInput,
) {
  const { name, eventName, linkId, attributionWindowHours, isActive } = input;
  const goalId = id ?? uuidV7();
  const statement =
    id === undefined
      ? db
          .prepare(
            `INSERT INTO conversion_goals (id, name, event_name, link_id, attribution_window_hours, is_active)
          SELECT ?, ?, ?, ?, ?, ? WHERE (? IS NULL OR ${validLink})
          AND (SELECT COUNT(*) FROM conversion_goals WHERE backup_archived_at IS NULL) < 100
          ON CONFLICT DO NOTHING RETURNING ${fields}`,
          )
          .bind(
            goalId,
            name,
            eventName,
            linkId,
            attributionWindowHours,
            Number(isActive),
            linkId,
            linkId,
          )
      : db
          .prepare(
            `UPDATE conversion_goals SET name = ?, attribution_window_hours = ?, is_active = ?
          WHERE id = ? AND backup_archived_at IS NULL AND event_name = ? AND link_id IS ?
          AND (? = 0 OR (name = ? AND attribution_window_hours = ? AND is_active = ?))
          RETURNING ${fields}`,
          )
          .bind(
            name,
            attributionWindowHours,
            Number(isActive),
            id,
            eventName,
            linkId,
            Number(expected !== undefined),
            expected?.name ?? null,
            expected?.attributionWindowHours ?? null,
            expected ? Number(expected.isActive) : null,
          );
  const row = await statement.first<GoalRow>();
  return row ? asGoal(row) : null;
}

export async function archiveGoal(db: D1Database, id: string, linkId?: string) {
  return (
    (await db
      .prepare(
        `UPDATE conversion_goals SET backup_archived_at = unixepoch(), is_active = 0
    WHERE id = ?1 AND backup_archived_at IS NULL AND (?2 IS NULL OR link_id = ?2) RETURNING id`,
      )
      .bind(id, linkId ?? null)
      .first('id')) !== null
  );
}

export async function setLinkTracking(
  db: D1Database,
  id: string,
  enabled: boolean,
) {
  return (
    (await db
      .prepare(
        `UPDATE links SET conversion_tracking = ?, updated_at = MAX(unixepoch(), updated_at + 1)
    WHERE id = ? AND deleted_at IS NULL AND (? = 0 OR redirect_type IN (302, 307)) RETURNING id`,
      )
      .bind(Number(enabled), id, Number(enabled))
      .first('id')) !== null
  );
}

export async function getLinkTracking(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT l.id, l.slug, d.hostname, l.conversion_tracking AS enabled,
    l.redirect_type IN (302, 307) AS eligible FROM links l JOIN domains d ON d.id = l.domain_id
    WHERE l.id = ? AND l.deleted_at IS NULL`,
    )
    .bind(id)
    .first<{
      id: string;
      slug: string;
      hostname: string;
      enabled: number;
      eligible: number;
    }>();
  return row
    ? { ...row, enabled: row.enabled === 1, eligible: row.eligible === 1 }
    : null;
}
