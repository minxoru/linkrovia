import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { issueClickReference } from '../../src/lib/server/conversions/attribution';
import {
  conversionSummary,
  parseConversionEvent,
  recordConversion,
} from '../../src/lib/server/conversions/events';
import {
  archiveGoal,
  getLinkTracking,
  listGoals,
  parseGoal,
  saveGoal,
  setLinkTracking,
} from '../../src/lib/server/conversions/goals';
import { rollupConversions } from '../../src/lib/server/conversions/rollup';

import { getLink, updateLink } from '../../src/lib/server/links/store';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;
const payload = {
  name: 'Signup',
  eventName: 'signup',
  linkId: 'fixture',
  attributionWindowHours: 24,
  isActive: true,
};
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).sort()) {
    const migration = await readFile(new URL(name, migrations), 'utf8');
    await db.batch(
      unstable_splitSqlQuery(migration).map((sql) => db.prepare(sql)),
    );
  }
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, email, role, password_hash) VALUES ('owner', 'owner@example.org', 'owner', 'fixture')",
    ),
    db.prepare(
      "INSERT INTO domains (id, hostname, is_primary, connection_status) VALUES ('domain', 'go.example.org', 1, 'active')",
    ),
    db.prepare(
      "INSERT INTO links (id, domain_id, slug, destination_url) VALUES ('fixture', 'domain', 'example', 'https://example.org/')",
    ),
    db.prepare(
      "INSERT INTO links (id, domain_id, slug, destination_url) VALUES ('other', 'domain', 'other', 'https://example.org/')",
    ),
  ]);
}, 20_000);

afterAll(async () => platform?.dispose());

async function issue(id: string) {
  const version = (await getLink(db, id))!.updatedAt;
  return issueClickReference(db, id, version);
}

it('requires deliberate opt-in and applies receipt idempotency atomically', async () => {
  const goal = await saveGoal(db, payload);
  if (!goal) throw new Error('Missing goal');
  expect(await saveGoal(db, payload)).toBeNull();
  expect(await issue('fixture')).toBeNull();
  expect(await setLinkTracking(db, 'fixture', true)).toBe(true);
  const clickRef = await issue('fixture');
  expect(clickRef).toMatch(/^[a-f0-9]{48}\.[a-f0-9]{64}$/);
  const input = { goalId: goal.id, occurredAt: now(), clickRef };
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      recordConversion(db, 'owner', input, 'signup-1'),
    ),
  );
  const first = responses.find(
    (result) => 'receipt' in result && !result.duplicate,
  );
  expect(first).toMatchObject({
    receipt: { status: 'accepted', linkId: 'fixture' },
  });
  expect(
    responses.filter((result) => 'receipt' in result && !result.duplicate),
  ).toHaveLength(1);
  expect(
    new Set(responses.map((result) => 'receipt' in result && result.receipt.id))
      .size,
  ).toBe(1);
  expect(await recordConversion(db, 'owner', input, 'signup-second')).toEqual({
    code: 'invalid_reference',
  });
  expect(
    await recordConversion(
      db,
      'owner',
      { ...input, clickRef: null },
      'signup-no-ref',
    ),
  ).toMatchObject({ receipt: { status: 'unattributed', linkId: null } });
  expect(await recordConversion(db, 'owner', input, null)).toEqual({
    code: 'invalid_idempotency_key',
  });
  const stats = {
    goalId: goal.id,
    goalName: goal.name,
    archived: false,
    total: 2,
    attributed: 1,
    unattributed: 1,
    eligibleClicks: 1,
    partialUtcDays: false,
  };
  expect(await conversionSummary(db, now() - 600, now() + 600)).toContainEqual({
    ...stats,
    rate: null,
  });
  await db
    .prepare(
      "UPDATE click_attributions SET eligible_goals_json = json_object(?, unixepoch() - 1) WHERE link_id = 'fixture'",
    )
    .bind(goal.id)
    .run();
  expect(await conversionSummary(db, now() - 600, now() + 600)).toContainEqual({
    ...stats,
    rate: 1,
  });
  expect(
    await db
      .prepare('SELECT COUNT(*) AS total FROM audit_events WHERE action = ?')
      .bind('conversion.received')
      .first('total'),
  ).toBe(2);
});

it('rejects an expired or differently scoped reference and retains prior receipts on archive', async () => {
  const goal = await saveGoal(db, {
    ...payload,
    eventName: 'other_signup',
    linkId: 'other',
  });
  if (!goal) throw new Error('Missing goal');
  const clickRef = await issue('fixture');
  expect(
    await recordConversion(
      db,
      'owner',
      { goalId: goal.id, occurredAt: now(), clickRef },
      'different',
    ),
  ).toEqual({ code: 'invalid_reference' });
  await setLinkTracking(db, 'other', true);
  const expired = await issue('other');
  await db
    .prepare(
      "UPDATE click_attributions SET expires_at = unixepoch() - 1 WHERE link_id = 'other'",
    )
    .run();
  expect(
    await recordConversion(
      db,
      'owner',
      { goalId: goal.id, occurredAt: now(), clickRef: expired },
      'old',
    ),
  ).toEqual({ code: 'invalid_reference' });
  const event = { goalId: goal.id, occurredAt: now(), clickRef: null };
  const first = await recordConversion(db, 'owner', event, 'without-ref');
  expect(await archiveGoal(db, goal.id)).toBe(true);
  expect(await conversionSummary(db, now() - 600, now() + 600)).toContainEqual(
    expect.objectContaining({ goalId: goal.id, archived: true, total: 1 }),
  );
  expect(
    await recordConversion(db, 'owner', event, 'without-ref'),
  ).toMatchObject({ ...first, duplicate: true });
  expect(await recordConversion(db, 'owner', event, 'new')).toEqual({
    code: 'goal_not_found',
  });
});

it('keeps a goal’s event identity and prevents stale updates', async () => {
  const goal = await saveGoal(db, { ...payload, eventName: 'stable' });
  if (!goal) throw new Error('Missing goal');
  const { id, ...current } = goal;
  expect(await saveGoal(db, { ...current, eventName: 'other' }, id)).toBeNull();
  expect(
    await saveGoal(db, { ...current, name: 'Updated' }, id, current),
  ).toMatchObject({ name: 'Updated' });
  expect(
    await saveGoal(db, { ...current, attributionWindowHours: 2 }, id, current),
  ).toBeNull();
});

it('clears privacy opt-in when the destination changes', async () => {
  const link = await getLink(db, 'fixture');
  if (!link) throw new Error('Missing link');
  expect(await getLinkTracking(db, link.id)).toMatchObject({ enabled: true });
  expect(
    await updateLink(db, 'owner', link.id, link.updatedAt, {
      ...link,
      destinationUrl: 'https://example.net/',
    }),
  ).toMatchObject({ ok: true });
  expect(await getLinkTracking(db, link.id)).toMatchObject({ enabled: false });
  expect(await issue(link.id)).toBeNull();
});

it('rejects unknown fields and invalid date ranges in input', () => {
  expect(
    parseConversionEvent({
      goalId: 'goal',
      occurredAt: '2026-02-30T00:00:00Z',
    }),
  ).toBeNull();
  expect(
    parseConversionEvent({
      goalId: 'goal',
      occurredAt: now(),
      email: 'fixture@example.org',
    }),
  ).toBeNull();
  expect(parseGoal({ ...payload, attributionWindowHours: 721 })).toBeNull();
});

it('archives complete UTC aggregates atomically and preserves thirty-day retries', async () => {
  const goal = await saveGoal(db, { ...payload, eventName: 'rollup' });
  if (!goal) throw new Error('Missing goal');
  const day = '2025-01-15';
  const from = Date.parse(day + 'T00:00:00Z') / 1000;
  const to = from + 86400;
  const old = await recordConversion(
    db,
    'owner',
    { goalId: goal.id, occurredAt: now(), clickRef: null },
    'rollup-recent-retry',
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO click_attributions
      (ref_hash, link_id, created_at, expires_at, eligible_goals_json)
      VALUES ('historical-ref', 'fixture', ?, ?, json_object(?, ?))`,
      )
      .bind(from + 60, from + 3600, goal.id, from + 3600),
    db
      .prepare(
        `INSERT INTO conversion_receipts
      (id, goal_id, link_id, click_ref_hash, dedupe_key_hash, occurred_at, status, created_at)
      VALUES ('rollup-attributed', ?, 'fixture', 'historical-ref', 'one', ?, 'accepted', ?),
        ('rollup-unattributed', ?, NULL, NULL, 'two', ?, 'unattributed', ?)`,
      )
      .bind(goal.id, from + 61, from + 61, goal.id, from + 62, from + 62),
  ]);
  await db
    .prepare(
      `CREATE TRIGGER fail_conversion_rollup BEFORE INSERT ON conversion_rollups
    BEGIN SELECT RAISE(ABORT, 'snapshot failed'); END`,
    )
    .run();
  try {
    await expect(rollupConversions(db, new Date())).rejects.toThrow();
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM conversion_receipts WHERE id LIKE 'rollup-%'",
        )
        .first('n'),
    ).toBe(2);
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM click_attributions WHERE ref_hash = 'historical-ref'",
        )
        .first('n'),
    ).toBe(1);
  } finally {
    await db.prepare('DROP TRIGGER fail_conversion_rollup').run();
  }
  const results = await Promise.all([
    rollupConversions(db, new Date()),
    rollupConversions(db, new Date()),
  ]);
  expect(results.reduce((sum, count) => sum + count, 0)).toBe(2);
  expect(
    await db
      .prepare(
        "SELECT count(*) AS n FROM conversion_receipts WHERE id LIKE 'rollup-%'",
      )
      .first('n'),
  ).toBe(0);
  expect(
    await db
      .prepare(
        "SELECT count(*) AS n FROM click_attributions WHERE ref_hash = 'historical-ref'",
      )
      .first('n'),
  ).toBe(0);
  expect(await conversionSummary(db, from, to)).toContainEqual(
    expect.objectContaining({
      goalId: goal.id,
      total: 2,
      attributed: 1,
      unattributed: 1,
      eligibleClicks: 1,
      rate: 1,
      partialUtcDays: false,
    }),
  );
  expect(await conversionSummary(db, from + 3600, to)).toContainEqual(
    expect.objectContaining({
      goalId: goal.id,
      total: 0,
      eligibleClicks: 0,
      rate: null,
      partialUtcDays: true,
    }),
  );
  expect(
    await recordConversion(
      db,
      'owner',
      { goalId: goal.id, occurredAt: now(), clickRef: null },
      'rollup-recent-retry',
    ),
  ).toMatchObject({ ...old, duplicate: true });
});

it('isolates the goals, archived results, and archive action for a link', async () => {
  const goal = await saveGoal(db, { ...payload, eventName: 'scoped_goal' });
  const other = await saveGoal(db, {
    ...payload,
    eventName: 'other_scoped_goal',
    linkId: 'other',
  });
  const shared = await saveGoal(db, {
    ...payload,
    eventName: 'shared_scoped_goal',
    linkId: null,
  });
  if (!goal || !other || !shared) throw new Error('Missing goals');

  expect(await archiveGoal(db, other.id, 'fixture')).toBe(false);
  expect(await archiveGoal(db, shared.id, 'fixture')).toBe(false);
  expect(await listGoals(db, 'fixture')).toContainEqual(goal);
  expect(await listGoals(db, 'fixture')).not.toContainEqual(other);
  expect(await listGoals(db, 'fixture')).toContainEqual(shared);

  await recordConversion(
    db,
    'owner',
    { goalId: goal.id, occurredAt: now(), clickRef: null },
    'scoped-conversion',
  );
  expect(await archiveGoal(db, goal.id, 'fixture')).toBe(true);
  const summary = await conversionSummary(
    db,
    now() - 60,
    now() + 60,
    'fixture',
  );
  expect(summary).toContainEqual(
    expect.objectContaining({ goalId: goal.id, archived: true, total: 1 }),
  );
  expect(summary.map(({ goalId }) => goalId)).not.toContain(other.id);
  expect(summary).toContainEqual(
    expect.objectContaining({ goalId: shared.id, total: 0, eligibleClicks: 0 }),
  );
});

it('isolates shared goal outcomes and eligible cohorts by link before and after rollup', async () => {
  const goal = await saveGoal(db, {
    ...payload,
    eventName: 'shared_cohorts',
    linkId: null,
  });
  if (!goal) throw new Error('Missing shared goal');
  const { id } = goal;
  const from = Date.parse('2025-01-20T00:00:00Z') / 1000;
  const to = from + 86400;
  await db.batch([
    db
      .prepare(
        `INSERT INTO click_attributions
      (ref_hash, link_id, created_at, expires_at, eligible_goals_json)
      VALUES ('shared-fixture', 'fixture', ?1, ?2, json_object(?3, ?2)),
        ('shared-other', 'other', ?1, ?2, json_object(?3, ?2))`,
      )
      .bind(from + 60, from + 3600, id),
    db
      .prepare(
        `INSERT INTO conversion_receipts
      (id, goal_id, link_id, click_ref_hash, dedupe_key_hash, occurred_at, status, created_at)
      VALUES ('shared-attributed', ?1, 'fixture', 'shared-fixture', 'shared-one', ?2, 'accepted', ?2),
        ('shared-unattributed', ?1, NULL, NULL, 'shared-two', ?2, 'unattributed', ?2)`,
      )
      .bind(id, from + 61),
  ]);

  async function verifySummary() {
    const find = async (linkId?: string) =>
      (await conversionSummary(db, from, to, linkId)).find(
        ({ goalId }) => goalId === id,
      );
    expect(await find('fixture')).toMatchObject({
      total: 1,
      attributed: 1,
      unattributed: 0,
      eligibleClicks: 1,
      rate: 1,
      incompleteLinkHistory: false,
    });
    expect(await find('other')).toMatchObject({
      total: 0,
      attributed: 0,
      unattributed: 0,
      eligibleClicks: 1,
      rate: 0,
      incompleteLinkHistory: false,
    });
    expect(await find()).toMatchObject({
      total: 2,
      attributed: 1,
      unattributed: 1,
      eligibleClicks: 2,
      rate: 0.5,
    });
  }

  await verifySummary();
  await rollupConversions(db, new Date());
  await verifySummary();
});

it('discloses legacy shared cohorts with missing link history and leaves their global totals readable', async () => {
  const goal = await saveGoal(db, {
    ...payload,
    linkId: null,
    eventName: 'shared_legacy',
  });
  if (!goal) throw new Error('Missing shared goal');
  const day = '2025-01-21';
  const from = Date.parse(day + 'T00:00:00Z') / 1000;
  const to = from + 86400;
  await db.batch([
    db
      .prepare(
        `INSERT INTO conversion_cohort_rollups
       (day_utc, goal_id, eligible_clicks, converted_clicks) VALUES (?1, ?2, 3, 2)`,
      )
      .bind(day, goal.id),
    db
      .prepare(
        `INSERT INTO conversion_rollups
       (day_utc, goal_id, link_id, conversions, attributed) VALUES (?1, ?2, 'fixture', 1, 0)`,
      )
      .bind(day, goal.id),
  ]);
  expect(await archiveGoal(db, goal.id)).toBe(true);
  expect(await conversionSummary(db, from, to, 'fixture')).toContainEqual(
    expect.objectContaining({
      goalId: goal.id,
      archived: true,
      total: 1,
      attributed: 1,
      eligibleClicks: 0,
      rate: null,
      incompleteLinkHistory: true,
    }),
  );
  expect(await conversionSummary(db, from, to)).toContainEqual(
    expect.objectContaining({
      goalId: goal.id,
      attributed: 0,
      eligibleClicks: 3,
      rate: 2 / 3,
    }),
  );
});
