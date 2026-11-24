const daySeconds = 86400;
const retentionSeconds = 30 * daySeconds;
const batchSize = 500;

const dueReferences = `created_at <= ? AND expires_at <= ?`;
const dueReceipts = `created_at < ? AND occurred_at < ?
  AND (click_ref_hash IS NULL OR NOT EXISTS (
    SELECT 1 FROM click_attributions ref WHERE ref.ref_hash = conversion_receipts.click_ref_hash
  ))`;

const expiredReferences = `SELECT ref_hash FROM click_attributions
  WHERE ${dueReferences}
  ORDER BY created_at, ref_hash LIMIT ${batchSize}`;

const oldReceipts = `SELECT id FROM conversion_receipts
  WHERE ${dueReceipts}
  ORDER BY created_at, id LIMIT ${batchSize}`;

function cutoffs(now: number) {
  const createdBefore = now - retentionSeconds;
  return {
    createdBefore,
    occurredBefore: Math.floor(createdBefore / daySeconds) * daySeconds,
  };
}

export async function oldestDueConversionAt(db: D1Database, now: number) {
  const { createdBefore, occurredBefore } = cutoffs(now);
  // Receipts qualify only after their UTC day closes and the retention period
  // passes. The cutoff on receipt creation is strict, unlike references.
  return db
    .prepare(
      `SELECT MIN(due_at) AS due_at FROM (
       SELECT MIN(MAX(created_at + ${retentionSeconds}, expires_at)) AS due_at
       FROM click_attributions WHERE ${dueReferences}
       UNION ALL
       SELECT MIN(MAX(
         created_at + ${retentionSeconds} + 1,
         (occurred_at / ${daySeconds} + 1) * ${daySeconds} + ${retentionSeconds}
       )) AS due_at
       FROM conversion_receipts WHERE ${dueReceipts}
     )`,
    )
    .bind(createdBefore, now, createdBefore, occurredBefore)
    .first<number>('due_at');
}

export async function rollupConversions(
  db: D1Database,
  scheduledAt: Date,
): Promise<number> {
  const now = Math.floor(Math.min(scheduledAt.getTime(), Date.now()) / 1000);
  if (!Number.isSafeInteger(now))
    throw new RangeError('Invalid conversion rollup date');
  const { createdBefore, occurredBefore } = cutoffs(now);

  // D1 executes this batch in a single transaction. Both DELETE statements use
  // the same bounded selections as their preceding snapshots.
  const [, , , , deleted] = await db.batch([
    db
      .prepare(
        `INSERT INTO conversion_cohort_rollups
      (day_utc, goal_id, eligible_clicks, converted_clicks)
      SELECT date(ref.created_at, 'unixepoch'), eligibility.key, COUNT(*), COUNT(r.id)
      FROM click_attributions ref JOIN json_each(ref.eligible_goals_json) eligibility
      LEFT JOIN conversion_receipts r ON r.goal_id = eligibility.key AND r.click_ref_hash = ref.ref_hash
      WHERE ref.ref_hash IN (${expiredReferences})
      GROUP BY 1, 2
      ON CONFLICT(day_utc, goal_id) DO UPDATE SET
        eligible_clicks = eligible_clicks + excluded.eligible_clicks,
        converted_clicks = converted_clicks + excluded.converted_clicks`,
      )
      .bind(createdBefore, now),
    db
      .prepare(
        `INSERT INTO conversion_link_cohort_rollups
      (day_utc, goal_id, link_id, eligible_clicks, converted_clicks)
      SELECT date(ref.created_at, 'unixepoch'), eligibility.key, ref.link_id, COUNT(*), COUNT(r.id)
      FROM click_attributions ref JOIN json_each(ref.eligible_goals_json) eligibility
      JOIN conversion_goals g ON g.id = eligibility.key AND g.link_id IS NULL
      LEFT JOIN conversion_receipts r ON r.goal_id = eligibility.key AND r.click_ref_hash = ref.ref_hash
      WHERE ref.ref_hash IN (${expiredReferences})
      GROUP BY 1, 2, 3
      ON CONFLICT(day_utc, goal_id, link_id) DO UPDATE SET
        eligible_clicks = eligible_clicks + excluded.eligible_clicks,
        converted_clicks = converted_clicks + excluded.converted_clicks`,
      )
      .bind(createdBefore, now),
    db
      .prepare(
        `DELETE FROM click_attributions WHERE ref_hash IN (${expiredReferences})`,
      )
      .bind(createdBefore, now),
    db
      .prepare(
        `INSERT INTO conversion_rollups (day_utc, goal_id, link_id, conversions, attributed)
      SELECT date(occurred_at, 'unixepoch'), goal_id, COALESCE(link_id, ''), COUNT(*), SUM(status = 'accepted')
      FROM conversion_receipts WHERE id IN (${oldReceipts})
      GROUP BY 1, 2, 3
      ON CONFLICT(day_utc, goal_id, link_id) DO UPDATE SET
        conversions = conversions + excluded.conversions,
        attributed = attributed + excluded.attributed`,
      )
      .bind(createdBefore, occurredBefore),
    db
      .prepare(`DELETE FROM conversion_receipts WHERE id IN (${oldReceipts})`)
      .bind(createdBefore, occurredBefore),
  ]);
  return deleted.meta.changes;
}
