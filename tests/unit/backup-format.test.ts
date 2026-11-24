import { describe, expect, it } from 'vitest';
import {
  backupMaxBytes,
  backupMaxRecords,
  createBackup,
  parseBackup,
  readBackup,
  recordCounts,
  type BackupData,
} from '../../src/lib/server/backup/format';

const data: BackupData = {
  appSettings: { defaultTimeZone: 'Asia/Tokyo', defaultLocale: 'fr' },
  domains: [
    {
      id: 'domain-1',
      hostname: 'short.example.com',
      isPrimary: true,
      isActive: true,
    },
  ],
  links: [
    {
      id: 'link-1',
      domainId: 'domain-1',
      slug: 'launch',
      destinationUrl: 'https://example.com/welcome',
      title: 'Welcome',
      description: null,
      redirectType: 302,
      isActive: true,
      startsAt: 1_700_000_000,
      expiresAt: null,
      protectionMode: 'none',
      consumedAt: null,
      utmConfig: { rules: { 'rule-1': { utm_source: 'mobile' } } },
    },
  ],
  tags: [{ id: 'tag-1', name: 'Launch' }],
  linkTags: [{ linkId: 'link-1', tagId: 'tag-1' }],
  redirectRules: [
    {
      id: 'rule-1',
      linkId: 'link-1',
      conditions: [{ type: 'device', operator: 'eq', value: 'mobile' }],
      destinationUrl: 'https://example.com/mobile',
      priority: 1,
      isActive: true,
    },
  ],
  utmTemplates: [
    {
      id: 'template-1',
      name: 'Campaign',
      description: 'Welcome campaign',
      values: { utm_campaign: 'launch' },
    },
  ],
  conversionGoals: [
    {
      id: 'goal-1',
      linkId: null,
      name: 'Sign up',
      eventName: 'signup',
      attributionWindowHours: 24,
      isActive: true,
    },
  ],
  qrMetadata: [{ id: 'default:link-1', linkId: 'link-1', label: null }],
};

function jsonRequest(body: string, contentType = 'application/json') {
  return new Request('https://short.example.com', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('backup format', () => {
  it('round trips configuration and verifies checksum with reordered object keys', async () => {
    const document = await createBackup(
      structuredClone(data),
      '1234567890abcdef1234567890abcdef',
    );
    const reordered = Object.fromEntries(Object.entries(document).reverse());
    await expect(
      readBackup(jsonRequest(JSON.stringify(reordered))),
    ).resolves.toMatchObject({
      ...data,
      schemaVersion: 1,
      sourceInstanceId: '1234567890abcdef1234567890abcdef',
      recordCounts: {
        domains: 1,
        links: 1,
        tags: 1,
        linkTags: 1,
        redirectRules: 1,
        utmTemplates: 1,
        conversionGoals: 1,
        qrMetadata: 1,
      },
    });
  });

  it('rejects a changed destination despite valid fields', async () => {
    const document = await createBackup(
      structuredClone(data),
      '1234567890abcdef1234567890abcdef',
    );
    document.links[0].destinationUrl = 'https://example.org/';
    await expect(parseBackup(document)).rejects.toMatchObject({
      code: 'checksum_mismatch',
    });
  });

  it('rejects a future schema version', async () => {
    const document = await createBackup(
      structuredClone(data),
      '1234567890abcdef1234567890abcdef',
    );
    await expect(
      parseBackup({ ...document, schemaVersion: 2 }),
    ).rejects.toMatchObject({
      code: 'unsupported_version',
    });
  });

  it.each<[string, (input: BackupData) => void]>([
    [
      'password hash',
      (d) => {
        Object.assign(d.links[0], { passwordHash: 'secret' });
      },
    ],
    [
      'hidden condition field',
      (d) => {
        Object.assign(d.redirectRules[0].conditions[0], { token: 'secret' });
      },
    ],
    [
      'unsupported locale',
      (d) => {
        d.appSettings.defaultLocale = 'de';
      },
    ],
    [
      'invalid timezone',
      (d) => {
        d.appSettings.defaultTimeZone = '+01:00';
      },
    ],
    [
      'unsafe destination',
      (d) => {
        d.links[0].destinationUrl = 'https://127.0.0.1/';
      },
    ],
    [
      'reserved slug',
      (d) => {
        d.links[0].slug = 'admin';
      },
    ],
    [
      'invalid time window',
      (d) => {
        d.links[0].expiresAt = 1;
      },
    ],
    [
      'invalid consumption state',
      (d) => {
        d.links[0].consumedAt = 1;
      },
    ],
    [
      'orphaned UTM rule ID',
      (d) => {
        d.links[0].utmConfig = { rules: { missing: {} } };
      },
    ],
    [
      'orphaned QR metadata',
      (d) => {
        d.qrMetadata[0].linkId = 'missing';
        d.qrMetadata[0].id = 'default:missing';
      },
    ],
    [
      'duplicate hostname',
      (d) => {
        d.domains.push({ ...d.domains[0], id: 'different' });
      },
    ],
    [
      'duplicate tag assignment',
      (d) => {
        d.linkTags.push({ ...d.linkTags[0] });
      },
    ],
  ])('rejects %s', async (_reason, mutate) => {
    const input = structuredClone(data);
    mutate(input);
    await expect(
      createBackup(input, '1234567890abcdef1234567890abcdef'),
    ).rejects.toMatchObject({ code: 'invalid_document' });
  });

  it('enforces the record cap across tables', async () => {
    const input = structuredClone(data);
    const count = Object.values(recordCounts(input)).reduce((a, b) => a + b, 0);
    input.tags.push(
      ...Array.from({ length: backupMaxRecords - count }, (_, i) => ({
        id: `tag-${i + 2}`,
        name: `Tag ${i + 2}`,
      })),
    );
    const instanceId = '1234567890abcdef1234567890abcdef';
    await expect(createBackup(input, instanceId)).resolves.toMatchObject({
      schemaVersion: 1,
    });
    input.tags.push({ id: 'one-more', name: 'One more' });
    await expect(createBackup(input, instanceId)).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('enforces the byte cap without Content-Length', async () => {
    await expect(
      readBackup(jsonRequest(' '.repeat(backupMaxBytes + 1))),
    ).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('rejects malformed JSON', async () => {
    await expect(readBackup(jsonRequest('{'))).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });

  it('rejects unsupported content types', async () => {
    await expect(
      readBackup(jsonRequest('{}', 'text/plain')),
    ).rejects.toMatchObject({
      code: 'unsupported_content_type',
    });
  });
});
