import { CloudflareAnalyticsRepository } from '../analytics/cloudflare';
import { clickRollupRetentionSeconds } from '../analytics/click-rollup';
import { oldestDueConversionAt } from '../conversions/rollup';

const hour = 3600;
const day = 24 * hour;
const dailyRun = 3 * hour + 15 * 60;

type HealthEnv = {
  DB?: D1Database;
  ANALYTICS_SQL?: AnalyticsSQLBinding;
  LINKROVIA_CLICKS_DATASET?: string;
  CF_VERSION_METADATA?: { id: string; timestamp: string };
};

type ClickHealth = {
  latestDay: string | null;
  completedAt: number | null;
  status:
    'waiting' | 'current' | 'pending' | 'failed' | 'overdue' | 'unavailable';
  missingDays: string[];
};

type ConversionHealth = {
  oldestDueAt: number | null;
  status: 'current' | 'pending' | 'unavailable';
};

type AnalyticsHealth = 'available' | 'unavailable' | 'local' | 'unconfigured';

const utcDay = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

async function databaseHealth(db: D1Database | undefined) {
  try {
    const result = await db
      ?.prepare('SELECT completed_at FROM setup_state WHERE singleton = 1')
      .all<{ completed_at: number | null }>();
    if (result?.success && result.results.length === 1) {
      const size = result.meta.size_after;
      return {
        health: {
          status: 'available' as const,
          sizeBytes: Number.isSafeInteger(size) && size > 0 ? size : null,
        },
        setupAt: result.results[0].completed_at,
      };
    }
  } catch {
    // The dashboard exposes only availability.
  }
  return {
    health: { status: 'unavailable' as const, sizeBytes: null },
    setupAt: null,
  };
}

async function clickHealth(
  db: D1Database,
  setupAt: number | null,
  now: number,
): Promise<ClickHealth> {
  const today = Math.floor(now / day) * day;
  const dueAt =
    today + dailyRun > now ? today + dailyRun - day : today + dailyRun;
  const dueDayStart = dueAt - dailyRun - day;
  const dueDay = utcDay(dueDayStart);
  const retainedStart =
    Math.ceil((now - clickRollupRetentionSeconds) / day) * day;
  const results = await db.batch<{
    day_utc: string;
    status: 'running' | 'completed' | 'failed';
    completed_at: number | null;
  }>([
    db
      .prepare(
        `SELECT day_utc, completed_at FROM rollup_jobs
       WHERE day_utc <= ? AND completed_at IS NOT NULL
       ORDER BY day_utc DESC LIMIT 1`,
      )
      .bind(utcDay(today - day)),
    db
      .prepare(
        `SELECT day_utc, status, completed_at FROM rollup_jobs
       WHERE day_utc BETWEEN ? AND ?`,
      )
      .bind(utcDay(retainedStart), dueDay),
  ]);
  const latest = results[0].results[0];
  const jobs = new Map(results[1].results.map((row) => [row.day_utc, row]));
  const due = jobs.get(dueDay);
  let status: ClickHealth['status'] = 'waiting';
  if (due?.completed_at != null) status = 'current';
  else if (due?.status === 'failed') status = 'failed';
  else if (due || (setupAt !== null && utcDay(setupAt) <= dueDay)) {
    status = now < dueAt + hour ? 'pending' : 'overdue';
  }

  const missingDays: string[] = [];
  const firstExpected =
    setupAt === null
      ? dueAt
      : Math.max(retainedStart, Math.floor(setupAt / day) * day);
  for (
    let start = dueDayStart;
    start >= firstExpected && missingDays.length < 7;
    start -= day
  ) {
    const date = utcDay(start);
    if (jobs.get(date)?.completed_at != null) continue;
    if (date === dueDay && status === 'pending') continue;
    missingDays.push(date);
  }
  return {
    latestDay: latest?.day_utc ?? null,
    completedAt: latest?.completed_at ?? null,
    status,
    missingDays,
  };
}

async function conversionHealth(
  db: D1Database,
  now: number,
): Promise<ConversionHealth> {
  const oldestDueAt = await oldestDueConversionAt(db, now);
  return { oldestDueAt, status: oldestDueAt === null ? 'current' : 'pending' };
}

async function analyticsHealth(
  env: HealthEnv,
  development: boolean,
  now: number,
): Promise<AnalyticsHealth> {
  if (development) return 'local';
  if (!env.ANALYTICS_SQL) return 'unconfigured';
  try {
    await new CloudflareAnalyticsRepository(
      env.ANALYTICS_SQL,
      env.LINKROVIA_CLICKS_DATASET,
    ).checkAvailability({ from: now - hour, to: now });
    return 'available';
  } catch {
    return 'unavailable';
  }
}

export async function loadOperationsHealth(
  env: HealthEnv,
  {
    development,
    now = Math.floor(Date.now() / 1000),
  }: { development: boolean; now?: number },
) {
  const [database, analytics] = await Promise.all([
    databaseHealth(env.DB),
    analyticsHealth(env, development, now),
  ]);
  const unavailableClicks: ClickHealth = {
    latestDay: null,
    completedAt: null,
    status: 'unavailable',
    missingDays: [],
  };
  const unavailableConversions: ConversionHealth = {
    oldestDueAt: null,
    status: 'unavailable',
  };
  const [clicks, conversions] =
    env.DB && database.health.status === 'available'
      ? await Promise.all([
          clickHealth(env.DB, database.setupAt, now).catch(
            () => unavailableClicks,
          ),
          conversionHealth(env.DB, now).catch(() => unavailableConversions),
        ])
      : [unavailableClicks, unavailableConversions];

  const version = env.CF_VERSION_METADATA;
  return {
    database: database.health,
    analytics,
    clicks,
    conversions,
    version:
      version?.id && version.timestamp
        ? { id: version.id, timestamp: version.timestamp }
        : null,
  };
}
