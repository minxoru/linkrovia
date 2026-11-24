import { describe, expect, it } from 'vitest';
import { CloudflareAnalyticsRepository } from '../../src/lib/server/analytics/cloudflare';
import {
  InMemoryAnalyticsRepository,
  type ClickSample,
} from '../../src/lib/server/analytics/in-memory';
import { MockAnalyticsRepository } from '../../src/lib/server/analytics/mock';
import { FixtureAnalyticsRepository } from '../fixtures/analytics';

const today = Date.parse('2026-11-22T00:00:00Z') / 1000;
const day = 86_400;

describe('development analytics', () => {
  it('covers exactly the 90 preceding UTC days with stable demo data', async () => {
    const query = {
      from: today - 91 * day,
      to: today + day,
      timezone: 'Asia/Tokyo',
    };
    const trend = await new MockAnalyticsRepository(today).getClickTrend(query);

    expect(trend.series).toHaveLength(90);
    expect(trend.series.at(0)?.date).toBe('2026-08-24');
    expect(trend.series.at(-1)?.date).toBe('2026-11-21');
    expect(trend.meta).toEqual({
      ...query,
      granularity: 'day',
      dateBasis: 'local',
      source: 'mock',
      estimated: false,
    });
    expect(
      await new MockAnalyticsRepository(today + 3600).getClickTrend(query),
    ).toEqual(trend);
  });

  it('uses half-open ranges and filters QR traffic and matched rules', async () => {
    const repository = new FixtureAnalyticsRepository();
    const query = {
      from: today - day,
      to: today,
      timezone: 'UTC',
      source: 'qr' as const,
      ruleId: 'seed-rule-ios',
    };

    expect((await repository.getClickTrend(query)).series).toEqual([
      { date: '2026-11-21', clicks: 3 },
    ]);
    expect(await repository.getCountries(query)).toEqual([
      { country: 'JP', clicks: 3 },
    ]);
    expect(await repository.getReferrers(query)).toEqual([
      { host: 'direct', clicks: 3 },
    ]);
    expect(await repository.getDevices(query)).toEqual([
      { device: 'mobile', os: 'ios', browser: 'safari', clicks: 3 },
    ]);
  });
});

it('buckets local days across midnight in an IANA timezone', async () => {
  const result = await new FixtureAnalyticsRepository().getClickTrend({
    from: today - day,
    to: today + day,
    timezone: 'Asia/Tokyo',
  });
  expect(result.series).toEqual([{ date: '2026-11-22', clicks: 34 }]);
});

it('orders tied breakdown keys and limits results after filtering', async () => {
  const samples: ClickSample[] = Array.from({ length: 30 }, (_, index) => ({
    timestamp: today,
    domainId: 'domain',
    linkId: `link-${String(29 - index).padStart(2, '0')}`,
    country: 'JP',
    region: 'Tokyo',
    referrer: 'direct',
    device: 'mobile',
    os: 'ios',
    browser: 'safari',
    ruleId: 'default',
    source: 'link',
    traffic: 'human',
    clicks: 1,
  }));
  samples.push(
    { ...samples[0], linkId: 'wrong-region', region: 'unknown', clicks: 90 },
    { ...samples[0], linkId: 'preview', traffic: 'preview', clicks: 90 },
  );
  const repository = new InMemoryAnalyticsRepository(samples, 'fixture');
  const result = await repository.getBreakdown(
    {
      from: today,
      to: today + day,
      timezone: 'UTC',
      dimension: 'region',
      key: 'Tokyo',
    },
    'link',
  );
  expect(result).toEqual({
    breakdown: Array.from({ length: 25 }, (_, index) => ({
      key: `link-${String(index).padStart(2, '0')}`,
      clicks: 1,
    })),
    estimated: false,
  });
});

describe('Cloudflare analytics', () => {
  it('uses the configured dataset for every query shape', async () => {
    const binding = fakeBinding([]);
    const repository = new CloudflareAnalyticsRepository(
      binding,
      'preview-clicks',
    );
    const query = { from: today, to: today + day, timezone: 'UTC' };

    await repository.getClickTrend(query);
    await repository.getBreakdown(query, 'country');
    await repository.getDevices(query);
    await repository.getDailyClickRollup(query);

    expect(binding.requests.length).toBeGreaterThan(3);
    for (const request of binding.requests) {
      expect(request.query).toContain(
        'FROM events.analyticsEngine."preview-clicks" WHERE ',
      );
    }
  });

  it('rejects invalid SQL dataset names before submitting a query', () => {
    const binding = fakeBinding([]);
    expect(
      () => new CloudflareAnalyticsRepository(binding, 'clicks" WHERE true'),
    ).toThrow('Invalid analytics dataset name');
    expect(binding.requests).toEqual([]);
  });

  it('uses the weighted analytics SQL dataset and binds filter and timezone values', async () => {
    const binding = fakeBinding([{ date: '2026-11-22', clicks: '34' }]);
    const repository = new CloudflareAnalyticsRepository(binding);
    const result = await repository.getClickTrend({
      from: today,
      to: today + day,
      timezone: 'Asia/Tokyo',
      dimension: 'referrer',
      key: "example.com' OR 1=1",
    });

    const request = binding.requests[0];
    expect(request.query).toContain(
      'FROM events.analyticsEngine.linkrovia_clicks',
    );
    expect(request.query).toContain('COUNT(*) AS clicks');
    expect(request.query).not.toContain('_sample_interval');
    expect(request.query).toContain(
      "formatDateTime(timestamp, '%Y-%m-%d', $timezone)",
    );
    expect(request.query).toContain('timestamp >= $from AND timestamp < $to');
    expect(request.query).toContain('blob4 = $key');
    expect(request.query).not.toContain('example.com');
    expect(request.params).toEqual({
      from: '2026-11-22T00:00:00.000Z',
      to: '2026-11-23T00:00:00.000Z',
      timezone: 'Asia/Tokyo',
      key: "example.com' OR 1=1",
    });
    expect(result.meta).toMatchObject({ dateBasis: 'local', estimated: true });
    expect(result.series).toEqual([{ date: '2026-11-22', clicks: 34 }]);
  });

  it('bounds results with ordered SQL and permits an explicit preview filter', async () => {
    const binding = fakeBinding([{ blob10: 'preview', clicks: 2 }]);
    const result = await new CloudflareAnalyticsRepository(
      binding,
    ).getBreakdown(
      {
        from: today,
        to: today + day,
        timezone: 'UTC',
        dimension: 'traffic',
        key: 'preview',
      },
      'traffic',
    );

    expect(binding.requests[0].query).toBe(
      `SELECT blob10, COUNT(*) AS clicks
FROM events.analyticsEngine.linkrovia_clicks WHERE timestamp >= $from AND timestamp < $to AND blob10 = $key
GROUP BY blob10 ORDER BY clicks DESC, blob10 ASC LIMIT 25`,
    );
    expect(result).toEqual({
      breakdown: [{ key: 'preview', clicks: 2 }],
      estimated: true,
    });
  });

  it('uses the physical Analytics Engine columns for device reports', async () => {
    const binding = fakeBinding([
      { blob5: 'mobile', blob6: 'ios', blob7: 'safari', clicks: '3' },
    ]);
    const repository = new CloudflareAnalyticsRepository(binding);
    expect(
      await repository.getDevices({
        from: today,
        to: today + day,
        timezone: 'UTC',
      }),
    ).toEqual([{ device: 'mobile', os: 'ios', browser: 'safari', clicks: 3 }]);
    expect(binding.requests[0].query).toBe(
      `SELECT blob5, blob6, blob7, COUNT(*) AS clicks
FROM events.analyticsEngine.linkrovia_clicks WHERE timestamp >= $from AND timestamp < $to AND blob10 NOT IN ('bot', 'preview')
GROUP BY blob5, blob6, blob7 ORDER BY clicks DESC, blob5 ASC, blob6 ASC, blob7 ASC LIMIT 25`,
    );
  });

  it('rejects invalid click counts returned by the binding', async () => {
    const binding = fakeBinding([{ blob3: 'Tokyo', clicks: -1 }]);
    await expect(
      new CloudflareAnalyticsRepository(binding).getBreakdown(
        {
          from: today,
          to: today + day,
          timezone: 'UTC',
        },
        'region',
      ),
    ).rejects.toThrow('Invalid analytics SQL click count');
  });
});

function fakeBinding(rows: Record<string, unknown>[]) {
  const requests: AnalyticsSQLQuery[] = [];
  return {
    requests,
    async query<T extends Record<string, unknown>>(
      request: AnalyticsSQLQuery,
    ): Promise<AnalyticsSQLResult<T>> {
      requests.push(request);
      return {
        data: rows as T[],
        rows: rows.length,
        statistics: { elapsed_ms: 1, rows_read: rows.length, bytes_read: 100 },
      };
    },
  } satisfies AnalyticsSQLBinding & { requests: AnalyticsSQLQuery[] };
}
