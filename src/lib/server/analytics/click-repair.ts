import {
  clickRollupRetentionSeconds,
  runDailyClickRollup,
} from './click-rollup';
import type { ClickRollupRepository } from './repository';

const daySeconds = 86_400;
const maxAttempts = 3;
const clock = () => Math.floor(Date.now() / 1000);
const utcDay = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

function dayBounds(now: number) {
  return {
    earliest: utcDay(
      Math.ceil((now - clickRollupRetentionSeconds) / daySeconds) * daySeconds,
    ),
    latest: utcDay(now - daySeconds),
  };
}

function validDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const start = Date.parse(date) / 1000;
  return Number.isFinite(start) && utcDay(start) === date;
}

type RepairStatus = 'queued' | 'retrying' | 'restored' | 'failed' | 'expired';

interface RepairState {
  date: string;
  attempts: number;
  nextAttempt: number;
  finished: number;
  completedAt: number | null;
}

export type RepairSubmission =
  'queued' | 'invalid' | 'alreadyStored' | 'limited';

export async function queueClickRepair(
  db: D1Database,
  date: string,
  now = clock(),
): Promise<RepairSubmission> {
  const { earliest, latest } = dayBounds(now);
  if (!validDay(date) || date < earliest || date > latest) return 'invalid';

  // A single row and a 24-hour submission interval bound the number of
  // manual queries even when owners submit requests concurrently.
  const queued = await db
    .prepare(
      `INSERT INTO click_rollup_repair (id, day_utc, requested_at, next_attempt_at)
       SELECT 1, ?1, ?2, ?2
       WHERE NOT EXISTS (
         SELECT 1 FROM rollup_jobs WHERE day_utc = ?1 AND completed_at IS NOT NULL
       )
       ON CONFLICT(id) DO UPDATE SET
         day_utc = excluded.day_utc, requested_at = excluded.requested_at,
         next_attempt_at = excluded.next_attempt_at, attempt_count = 0, finished = 0
       WHERE click_rollup_repair.requested_at <= ?3 AND (
         click_rollup_repair.finished = 1 OR click_rollup_repair.day_utc < ?4
         OR (click_rollup_repair.attempt_count >= ?5 AND click_rollup_repair.next_attempt_at <= ?2)
         OR EXISTS (
           SELECT 1 FROM rollup_jobs
           WHERE day_utc = click_rollup_repair.day_utc AND completed_at IS NOT NULL
         )
       )
       RETURNING id`,
    )
    .bind(date, now, now - daySeconds, earliest, maxAttempts)
    .first<number>('id');
  if (queued !== null) return 'queued';
  const completed = await db
    .prepare('SELECT completed_at FROM rollup_jobs WHERE day_utc = ?')
    .bind(date)
    .first<number>('completed_at');
  return completed !== null ? 'alreadyStored' : 'limited';
}

export async function loadClickRepair(db: D1Database, now = clock()) {
  const { earliest, latest } = dayBounds(now);
  const [repair, missing] = await Promise.all([
    db
      .prepare(
        `SELECT r.day_utc AS date, r.attempt_count AS attempts, r.finished,
           r.next_attempt_at AS nextAttempt, j.completed_at AS completedAt
         FROM click_rollup_repair r LEFT JOIN rollup_jobs j ON j.day_utc = r.day_utc
         WHERE r.id = 1`,
      )
      .first<RepairState>(),
    db
      .prepare(
        `WITH RECURSIVE days(day) AS (
           SELECT MAX(?, MIN(day_utc)) FROM rollup_jobs
           UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < ?
         )
         SELECT day FROM days LEFT JOIN rollup_jobs j ON j.day_utc = days.day
         WHERE day <= ? AND j.completed_at IS NULL
         ORDER BY day LIMIT 7`,
      )
      .bind(earliest, latest, latest)
      .all<{ day: string }>(),
  ]);
  let status: RepairStatus = 'queued';
  if (repair) {
    if (repair.completedAt !== null) status = 'restored';
    else if (repair.date < earliest) status = 'expired';
    else if (
      repair.finished ||
      (repair.attempts >= maxAttempts && repair.nextAttempt <= now)
    )
      status = 'failed';
    else if (repair.attempts > 0) status = 'retrying';
  }

  return {
    earliest,
    latest,
    missingDates: missing.results.map(({ day }) => day),
    latestRequest: repair
      ? { date: repair.date, status, attempts: repair.attempts }
      : null,
  };
}

export async function processClickRepair(
  db: D1Database,
  analyticsRepository: ClickRollupRepository,
  now = clock(),
) {
  const { earliest, latest } = dayBounds(now);
  const claimed = await db
    .prepare(
      `UPDATE click_rollup_repair
       SET attempt_count = attempt_count + 1,
           next_attempt_at = ?1 + CASE attempt_count WHEN 0 THEN 7200 WHEN 1 THEN 14400 ELSE 3600 END
       WHERE id = 1 AND finished = 0 AND next_attempt_at <= ?1
         AND attempt_count < ?2 AND day_utc BETWEEN ?3 AND ?4
         AND NOT EXISTS (
           SELECT 1 FROM rollup_jobs
           WHERE day_utc = click_rollup_repair.day_utc AND completed_at IS NOT NULL
         )
       RETURNING day_utc AS date, requested_at AS requestedAt, attempt_count AS attempts`,
    )
    .bind(now, maxAttempts, earliest, latest)
    .first<{ date: string; requestedAt: number; attempts: number }>();
  if (!claimed) return null;

  const result = await runDailyClickRollup({
    db,
    date: claimed.date,
    analyticsRepository,
  });
  if (result.status === 'completed' || claimed.attempts === maxAttempts) {
    await db
      .prepare(
        `UPDATE click_rollup_repair SET finished = 1
         WHERE id = 1 AND requested_at = ? AND attempt_count = ?`,
      )
      .bind(claimed.requestedAt, claimed.attempts)
      .run();
  }
  return result;
}
