import {
  clickRollupDimensions,
  clickRollupMaxRows,
  type ClickRollupRepository,
  type ClickRollupRow,
} from './repository';

const daySeconds = 86_400;
const leaseSeconds = 15 * 60;
export const clickRollupRetentionSeconds = 90 * daySeconds;

export type ClickRollupResult =
  | { status: 'completed'; date: string; rows: number; estimated: boolean }
  | { status: 'failed'; date: string; code: RollupError }
  | { status: 'unavailable' | 'busy' | 'superseded'; date: string };

type RollupError = 'analytics_query' | 'storage_write';

interface ClickRollupOptions {
  /** A completed UTC day in YYYY-MM-DD format. */
  date: string;
  analyticsRepository: ClickRollupRepository;
  db: D1Database;
  /** Optional fixed clock in Unix seconds for manual runs and tests. */
  now?: number;
}

const runningAttempt = `
  SELECT 1 FROM rollup_jobs
  WHERE day_utc = ?1 AND attempt_count = ?2 AND status = 'running'
`;

function validRow(row: ClickRollupRow) {
  return (
    clickRollupDimensions.includes(row.dimension) &&
    typeof row.linkId === 'string' &&
    row.linkId.length > 0 &&
    row.linkId.length <= 128 &&
    typeof row.value === 'string' &&
    row.value.length <= 255 &&
    (row.dimension !== 'total' || row.value === 'all') &&
    Number.isSafeInteger(row.clicks) &&
    row.clicks >= 0 &&
    typeof row.estimated === 'boolean'
  );
}

export async function runDailyClickRollup({
  date,
  analyticsRepository,
  db,
  now,
}: ClickRollupOptions): Promise<ClickRollupResult> {
  const clock = () => now ?? Math.floor(Date.now() / 1000);
  const started = clock();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(`${date}T00:00:00.000Z`) / 1000
    : NaN;
  const to = from + daySeconds;
  if (
    !Number.isFinite(from) ||
    new Date(from * 1000).toISOString().slice(0, 10) !== date ||
    to > started ||
    from < started - clickRollupRetentionSeconds
  ) {
    return { status: 'unavailable', date };
  }

  const attempt = await db
    .prepare(
      `INSERT INTO rollup_jobs (day_utc, status, started_at, attempt_count)
       VALUES (?1, 'running', ?2, 1)
       ON CONFLICT(day_utc) DO UPDATE SET
         status = 'running',
         started_at = excluded.started_at,
         error_code = NULL,
         attempt_count = rollup_jobs.attempt_count + 1
       WHERE rollup_jobs.status != 'running' OR
         rollup_jobs.started_at IS NULL OR rollup_jobs.started_at <= ?3
       RETURNING attempt_count`,
    )
    .bind(date, started, started - leaseSeconds)
    .first<number>('attempt_count');
  if (attempt === null) return { status: 'busy', date };

  let errorCode: RollupError = 'analytics_query';
  try {
    const rows = await analyticsRepository.getDailyClickRollup({ from, to });
    if (rows.length > clickRollupMaxRows || !rows.every(validRow))
      throw new Error('Invalid daily click rollup rows');

    errorCode = 'storage_write';
    const completed = clock();
    const estimated = rows.some((row) => row.estimated);
    const statements = [
      db
        .prepare(
          `DELETE FROM analytics_rollups WHERE day_utc = ?1
           AND EXISTS (${runningAttempt})`,
        )
        .bind(date, attempt),
    ];

    // Each JSON parameter stays under D1's 2 MB string limit even with escaping.
    const rowsPerStatement = 500;
    for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
      const json = JSON.stringify(
        rows
          .slice(offset, offset + rowsPerStatement)
          .map((row) => [
            row.linkId,
            row.dimension,
            row.value,
            row.clicks,
            Number(row.estimated),
          ]),
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO analytics_rollups
               (day_utc, link_id, dimension, dimension_value, click_count, estimated, calculated_at)
             SELECT ?1, value ->> 0, value ->> 1, value ->> 2, value ->> 3, value ->> 4, ?4
             FROM json_each(?3) WHERE EXISTS (${runningAttempt})`,
          )
          .bind(date, attempt, json, completed),
      );
    }

    // Replace the day and mark completion in one transaction. Every write is
    // fenced so an expired attempt cannot overwrite the current attempt's rows.
    statements.push(
      db
        .prepare(
          `UPDATE rollup_jobs SET status = 'completed', completed_at = ?3, estimated = ?4
           WHERE day_utc = ?1 AND attempt_count = ?2 AND status = 'running'`,
        )
        .bind(date, attempt, completed, Number(estimated)),
    );
    const result = (await db.batch(statements)).at(-1);
    if (!result?.meta.changes) return { status: 'superseded', date };
    return { status: 'completed', date, rows: rows.length, estimated };
  } catch {
    const result = await db
      .prepare(
        `UPDATE rollup_jobs SET status = 'failed', error_code = ?3
         WHERE day_utc = ?1 AND attempt_count = ?2 AND status = 'running'`,
      )
      .bind(date, attempt, errorCode)
      .run();
    return result.meta.changes
      ? { status: 'failed', date, code: errorCode }
      : { status: 'superseded', date };
  }
}
