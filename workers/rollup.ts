import { processClickRepair } from '../src/lib/server/analytics/click-repair';
import { runDailyClickRollup } from '../src/lib/server/analytics/click-rollup';
import {
  CloudflareAnalyticsRepository,
  type ClickAnalyticsEnv,
} from '../src/lib/server/analytics/cloudflare';
import { rollupConversions } from '../src/lib/server/conversions/rollup';

const daySeconds = 86_400;
const schedule = '15,45 * * * *';

type RollupEnv = Pick<Cloudflare.Env, 'DB'> & ClickAnalyticsEnv;
type ClickRollupJob = 'daily' | 'reconcile';

async function reconciliationDate(
  db: D1Database,
  yesterday: string,
  now: number,
) {
  return db
    .prepare(
      `WITH RECURSIVE days(day, offset) AS (
         SELECT ?, 0
         UNION ALL SELECT date(day, '-1 day'), offset + 1 FROM days WHERE offset < 6
       )
       SELECT day FROM days LEFT JOIN rollup_jobs jobs ON jobs.day_utc = days.day
       WHERE (jobs.started_at IS NULL OR jobs.started_at <= ?)
         AND (jobs.completed_at IS NULL OR jobs.completed_at < ?)
       ORDER BY jobs.completed_at NULLS FIRST, jobs.started_at NULLS FIRST, days.offset
       LIMIT 1`,
    )
    .bind(yesterday, now - 3600, now - daySeconds)
    .first<string>('day');
}

async function rollupClicks(job: ClickRollupJob, env: RollupEnv, now: number) {
  if (!env.ANALYTICS_SQL) return;
  const analyticsRepository = new CloudflareAnalyticsRepository(
    env.ANALYTICS_SQL,
    env.LINKROVIA_CLICKS_DATASET,
  );
  if (job === 'reconcile') {
    const repair = await processClickRepair(env.DB, analyticsRepository);
    if (repair?.status === 'failed')
      throw new Error(`Click rollup repair: ${repair.code}`);
    if (repair) return;
  }

  const yesterday = new Date((now - daySeconds) * 1000)
    .toISOString()
    .slice(0, 10);
  const date =
    job === 'daily'
      ? yesterday
      : await reconciliationDate(env.DB, yesterday, now);
  if (!date) return;
  const result = await runDailyClickRollup({
    date,
    analyticsRepository,
    db: env.DB,
  });
  if (result.status === 'failed')
    throw new Error(`Click rollup: ${result.code}`);
}

export default {
  async scheduled(controller, env) {
    const { cron, scheduledTime } = controller;
    if (cron !== schedule) return;
    const scheduledAt = new Date(scheduledTime);
    const minute = scheduledAt.getUTCMinutes();
    const daily = minute === 15 && scheduledAt.getUTCHours() === 3;
    if (!daily && minute !== 45) return;
    const now = Math.floor(scheduledTime / 1000);

    // Wait for both jobs even when one fails, then report the failed invocation.
    const failed = (
      await Promise.allSettled([
        rollupClicks(daily ? 'daily' : 'reconcile', env, now),
        rollupConversions(env.DB, scheduledAt),
      ])
    ).find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  },
} satisfies ExportedHandler<RollupEnv>;
