import {
  InMemoryAnalyticsRepository,
  type ClickSample,
} from '../../src/lib/server/analytics/in-memory';

const beforeMidnight: ClickSample = {
  timestamp: Date.parse('2026-11-21T23:59:59Z') / 1000,
  domainId: 'seed-domain-com',
  linkId: 'seed-link-001',
  country: 'JP',
  region: 'Tokyo',
  referrer: 'direct',
  device: 'mobile',
  os: 'ios',
  browser: 'safari',
  ruleId: 'seed-rule-ios',
  source: 'qr',
  traffic: 'human',
  clicks: 3,
};

const samples: readonly ClickSample[] = [
  beforeMidnight,
  { ...beforeMidnight, timestamp: beforeMidnight.timestamp + 1, clicks: 7 },
  { ...beforeMidnight, source: 'link', clicks: 11 },
  { ...beforeMidnight, ruleId: 'default', clicks: 13 },
];

export class FixtureAnalyticsRepository extends InMemoryAnalyticsRepository {
  constructor() {
    super(samples, 'fixture');
  }
}
