import { expect, it, vi } from 'vitest';
import { CloudflareAnalyticsRepository } from '../../src/lib/server/analytics/cloudflare';
import {
  clickRollupDimensions,
  clickRollupMaxRows,
} from '../../src/lib/server/analytics/repository';

const from = Date.parse('2026-11-21T00:00:00Z') / 1000;
const to = from + 86_400;

it('uses fixed half-open SQL queries and treats sampling-adjusted counts as estimates', async () => {
  const query = vi.fn(async ({ query }: { query: string }) => ({
    rows: 0,
    statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
    data:
      query.includes('AS dimension_key') && query.includes("'all'")
        ? [{ link_id: 'link-1', dimension_key: 'all', clicks: '11' }]
        : [],
  }));
  const repository = new CloudflareAnalyticsRepository({
    query,
  } as AnalyticsSQLBinding);

  expect(await repository.getDailyClickRollup({ from, to })).toEqual([
    {
      linkId: 'link-1',
      dimension: 'total',
      value: 'all',
      clicks: 11,
      estimated: true,
    },
  ]);
  expect(query).toHaveBeenCalledTimes(clickRollupDimensions.length);
  for (const [request] of query.mock.calls) {
    expect(request).toMatchObject({
      params: {
        from: '2026-11-21T00:00:00.000Z',
        to: '2026-11-22T00:00:00.000Z',
      },
    });
    expect(request.query).toContain('timestamp >= $from AND timestamp < $to');
    expect(request.query).toContain('COUNT(*) AS clicks');
    expect(request.query).toContain('GROUP BY index1');
    expect(request.query.includes("blob10 NOT IN ('bot', 'preview')")).toBe(
      !request.query.includes('blob10 AS dimension_key'),
    );
  }
});

it('fails a limited query that would overflow the daily snapshot', async () => {
  const query = vi.fn(async () => ({
    rows: 0,
    statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 },
    data: Array.from({ length: clickRollupMaxRows + 1 }, () => ({})),
  }));
  const repository = new CloudflareAnalyticsRepository({
    query,
  } as AnalyticsSQLBinding);

  await expect(repository.getDailyClickRollup({ from, to })).rejects.toThrow(
    'exceeds storage capacity',
  );
  expect(query).toHaveBeenCalledWith(
    expect.objectContaining({
      query: expect.stringContaining(`LIMIT ${clickRollupMaxRows + 1}`),
    }),
  );
  expect(query).toHaveBeenCalledTimes(1);
});
