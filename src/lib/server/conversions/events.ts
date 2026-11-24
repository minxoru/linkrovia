import { hex, sha256, uuidV7 } from '../auth/crypto';
import { isObject } from '../links/api-input';
import { verifyClickReference } from './attribution';

type ConversionEvent = {
  goalId: string;
  occurredAt: number;
  clickRef: string | null;
};

type Receipt = {
  id: string;
  goalId: string;
  occurredAt: number;
  linkId: string | null;
  status: 'accepted' | 'unattributed';
};

const receiptFields =
  'id, goal_id AS goalId, occurred_at AS occurredAt, link_id AS linkId, status';
const retentionSeconds = 30 * 86400;

export function parseConversionEvent(value: unknown): ConversionEvent | null {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) => !['goalId', 'occurredAt', 'clickRef'].includes(key),
    )
  )
    return null;
  const { goalId, occurredAt: valueAt, clickRef = null } = value;
  if (
    typeof goalId !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,95}$/i.test(goalId) ||
    (clickRef !== null &&
      (typeof clickRef !== 'string' || clickRef.length > 113))
  )
    return null;
  const occurredAt =
    typeof valueAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(valueAt)
      ? Math.floor(Date.parse(valueAt) / 1000)
      : valueAt;
  if (
    typeof occurredAt !== 'number' ||
    !Number.isSafeInteger(occurredAt) ||
    occurredAt < 0
  )
    return null;
  if (
    typeof valueAt === 'string' &&
    new Date(occurredAt * 1000).toISOString().slice(0, 19) !==
      valueAt.slice(0, 19)
  )
    return null;
  return { goalId, occurredAt, clickRef };
}

async function priorReceipt(db: D1Database, goalId: string, key: string) {
  return db
    .prepare(
      `SELECT ${receiptFields} FROM conversion_receipts WHERE goal_id = ? AND dedupe_key_hash = ?`,
    )
    .bind(goalId, key)
    .first<Receipt>();
}

type EventResult =
  | { receipt: Receipt; duplicate: boolean }
  | {
      code:
        | 'invalid_idempotency_key'
        | 'invalid_time'
        | 'invalid_reference'
        | 'goal_not_found';
    };

export async function recordConversion(
  db: D1Database,
  actor: string,
  event: ConversionEvent,
  idempotencyKey: string | null,
): Promise<EventResult> {
  if (!idempotencyKey || !/^[!-~]{1,128}$/.test(idempotencyKey))
    return { code: 'invalid_idempotency_key' };
  const key = hex(await sha256(idempotencyKey));
  const prior = await priorReceipt(db, event.goalId, key);
  if (prior) return { receipt: prior, duplicate: true };
  const now = Math.floor(Date.now() / 1000);
  if (event.occurredAt < now - retentionSeconds || event.occurredAt > now + 300)
    return { code: 'invalid_time' };
  const reference =
    event.clickRef === null
      ? null
      : await verifyClickReference(db, event.clickRef);
  if (event.clickRef !== null && !reference)
    return { code: 'invalid_reference' };

  const id = uuidV7();
  const [inserted] = await db.batch<Receipt>([
    db
      .prepare(
        `INSERT INTO conversion_receipts (id, goal_id, click_ref_hash, dedupe_key_hash, occurred_at, link_id, status)
      SELECT ?, g.id, ref.ref_hash, ?, ?, ref.link_id, CASE WHEN ref.ref_hash IS NULL THEN 'unattributed' ELSE 'accepted' END
      FROM conversion_goals g
      LEFT JOIN (click_attributions ref
        JOIN links l ON l.id = ref.link_id AND l.conversion_tracking = 1 AND l.deleted_at IS NULL
        JOIN json_each(ref.eligible_goals_json) eligibility)
        ON ref.ref_hash = ? AND ref.expires_at > unixepoch()
        AND eligibility.key = g.id AND eligibility.value > unixepoch()
        AND ? >= ref.created_at AND ? < eligibility.value
        AND (g.link_id IS NULL OR g.link_id = ref.link_id)
      WHERE g.id = ? AND g.is_active = 1 AND g.backup_archived_at IS NULL
        AND (g.link_id IS NULL OR EXISTS (SELECT 1 FROM links WHERE id = g.link_id AND deleted_at IS NULL))
        AND (? IS NULL OR ref.ref_hash IS NOT NULL)
        AND ? BETWEEN unixepoch() - ${retentionSeconds} AND unixepoch() + 300
      ON CONFLICT DO NOTHING RETURNING ${receiptFields}`,
      )
      .bind(
        id,
        key,
        event.occurredAt,
        reference,
        event.occurredAt,
        event.occurredAt,
        event.goalId,
        reference,
        event.occurredAt,
      ),
    db
      .prepare(
        `INSERT INTO audit_events (id, user_id, action, entity_type, entity_id)
      SELECT ?, ?, 'conversion.received', 'conversion_receipt', ? WHERE changes() = 1`,
      )
      .bind(uuidV7(), actor, id),
  ]);
  if (inserted.results[0])
    return { receipt: inserted.results[0], duplicate: false };
  const duplicate = await priorReceipt(db, event.goalId, key);
  if (duplicate) return { receipt: duplicate, duplicate: true };
  if (event.occurredAt < Math.floor(Date.now() / 1000) - retentionSeconds)
    return { code: 'invalid_time' };
  const activeGoal = await db
    .prepare(
      `SELECT 1 FROM conversion_goals g WHERE g.id = ? AND g.is_active = 1 AND g.backup_archived_at IS NULL
    AND (g.link_id IS NULL OR EXISTS (SELECT 1 FROM links WHERE id = g.link_id AND deleted_at IS NULL))`,
    )
    .bind(event.goalId)
    .first();
  return { code: activeGoal ? 'invalid_reference' : 'goal_not_found' };
}

export async function conversionSummary(
  db: D1Database,
  from: number,
  to: number,
  linkId?: string,
) {
  const { results } = await db
    .prepare(
      `WITH bounds AS (
      SELECT ?1 AS start_at, ?2 AS end_at, date(?1, 'unixepoch') AS start_day,
        date(?2 - 1, 'unixepoch') AS end_day
    ), event_counts AS (
      SELECT r.goal_id, COUNT(*) AS total, SUM(r.status = 'accepted') AS attributed, 0 AS partial
      FROM conversion_receipts r JOIN conversion_goals g ON g.id = r.goal_id
      WHERE r.occurred_at >= ?1 AND r.occurred_at < ?2
        AND (?3 IS NULL OR g.link_id = ?3
          OR (g.link_id IS NULL AND r.link_id = ?3 AND r.status = 'accepted'))
      GROUP BY r.goal_id
      UNION ALL
      SELECT goal_id, SUM(conversions) FILTER (WHERE complete), SUM(attributed) FILTER (WHERE complete),
        MAX(NOT complete)
      FROM (
        SELECT r.goal_id, r.conversions,
          -- Older rollups may lack the attributed count, but their link ID records attribution.
          CASE WHEN ?3 IS NOT NULL AND g.link_id IS NULL THEN r.conversions ELSE r.attributed END AS attributed,
          unixepoch(r.day_utc) >= start_at AND unixepoch(r.day_utc) + 86400 <= end_at AS complete
        FROM conversion_rollups r JOIN conversion_goals g ON g.id = r.goal_id CROSS JOIN bounds
        WHERE r.day_utc BETWEEN start_day AND end_day
          AND (?3 IS NULL OR g.link_id = ?3 OR (g.link_id IS NULL AND r.link_id = ?3))
      ) GROUP BY goal_id
    ), events AS (
      SELECT goal_id, SUM(total) AS total, SUM(attributed) AS attributed, MAX(partial) AS partial
      FROM event_counts GROUP BY goal_id
    ), archived_cohorts AS (
      SELECT r.day_utc, r.goal_id, r.eligible_clicks, r.converted_clicks
      FROM conversion_cohort_rollups r JOIN conversion_goals g ON g.id = r.goal_id CROSS JOIN bounds
      WHERE r.day_utc BETWEEN start_day AND end_day AND (?3 IS NULL OR g.link_id = ?3)
      UNION ALL
      SELECT r.day_utc, r.goal_id, r.eligible_clicks, r.converted_clicks
      FROM conversion_link_cohort_rollups r CROSS JOIN bounds
      WHERE r.day_utc BETWEEN start_day AND end_day AND r.link_id = ?3
    ), link_history_gaps AS (
      -- Older cohort rollups retain global counts without the original link IDs.
      SELECT DISTINCT r.goal_id
      FROM conversion_cohort_rollups r JOIN conversion_goals g ON g.id = r.goal_id CROSS JOIN bounds
      WHERE ?3 IS NOT NULL AND g.link_id IS NULL AND r.day_utc BETWEEN start_day AND end_day
        AND r.eligible_clicks > COALESCE((
          SELECT SUM(scoped.eligible_clicks) FROM conversion_link_cohort_rollups scoped
          WHERE scoped.day_utc = r.day_utc AND scoped.goal_id = r.goal_id
        ), 0)
    ), cohort_counts AS (
      SELECT eligibility.key AS id, COUNT(*) AS eligible_clicks, COUNT(r.id) AS converted_clicks,
        MAX(eligibility.value) AS closes_at, 0 AS partial
      FROM click_attributions ref JOIN json_each(ref.eligible_goals_json) eligibility
      LEFT JOIN conversion_receipts r ON r.goal_id = eligibility.key AND r.click_ref_hash = ref.ref_hash
      WHERE ref.created_at >= ?1 AND ref.created_at < ?2
        AND (?3 IS NULL OR ref.link_id = ?3)
      GROUP BY eligibility.key
      UNION ALL
      SELECT goal_id, SUM(eligible_clicks) FILTER (WHERE complete),
        SUM(converted_clicks) FILTER (WHERE complete), 0, MAX(NOT complete)
      FROM (
        SELECT r.*, unixepoch(r.day_utc) >= start_at AND unixepoch(r.day_utc) + 86400 <= end_at AS complete
        FROM archived_cohorts r CROSS JOIN bounds
      ) GROUP BY goal_id
    ), cohort AS (
      SELECT id, SUM(eligible_clicks) AS eligible_clicks, SUM(converted_clicks) AS converted_clicks,
        MAX(closes_at) AS closes_at, MAX(partial) AS partial
      FROM cohort_counts GROUP BY id
    )
    SELECT g.id AS goalId, g.name AS goalName, g.backup_archived_at IS NOT NULL AS archived,
      COALESCE(e.total, 0) AS total, COALESCE(e.attributed, 0) AS attributed,
      COALESCE(e.total - e.attributed, 0) AS unattributed, COALESCE(c.eligible_clicks, 0) AS eligibleClicks,
      CASE WHEN c.closes_at <= unixepoch() AND c.partial = 0 AND h.goal_id IS NULL
        THEN 1.0 * c.converted_clicks / c.eligible_clicks END AS rate,
      COALESCE(e.partial, 0) OR COALESCE(c.partial, 0) AS partialUtcDays,
      h.goal_id IS NOT NULL AS incompleteLinkHistory
    FROM conversion_goals g LEFT JOIN events e ON e.goal_id = g.id LEFT JOIN cohort c ON c.id = g.id
      LEFT JOIN link_history_gaps h ON h.goal_id = g.id
    WHERE (?3 IS NULL OR g.link_id = ?3 OR g.link_id IS NULL)
      AND (g.backup_archived_at IS NULL OR e.goal_id IS NOT NULL OR c.id IS NOT NULL OR h.goal_id IS NOT NULL)
    ORDER BY archived, g.name COLLATE NOCASE, g.id LIMIT 200`,
    )
    .bind(from, to, linkId ?? null)
    .all<{
      goalId: string;
      goalName: string;
      archived: number;
      total: number;
      attributed: number;
      unattributed: number;
      eligibleClicks: number;
      rate: number | null;
      partialUtcDays: number;
      incompleteLinkHistory: number;
    }>();
  return results.map(({ incompleteLinkHistory, ...row }) => ({
    ...row,
    archived: row.archived === 1,
    partialUtcDays: row.partialUtcDays === 1,
    ...(linkId === undefined
      ? {}
      : { incompleteLinkHistory: incompleteLinkHistory === 1 }),
  }));
}
