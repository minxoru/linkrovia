import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import {
  createLink,
  getLink,
  listDomains,
  listLinks,
  listLinkRules,
  updateLink,
  updateLinkRules,
} from '../../src/lib/server/links/store';
import {
  loadLinkGate,
  resolveQrLink,
  resolveShortLink,
  unlockLinkGate,
} from '../../src/lib/server/links/redirect';
import { setLinkProtection } from '../../src/lib/server/links/protection';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
const draft = {
  domainId: 'a',
  slug: 'AbC',
  destinationUrl: 'https://example.com/a?selected=1#more',
  title: null,
  redirectType: 302 as const,
  isActive: true,
  startsAt: null,
  expiresAt: null,
  tags: ['demo', 'release'],
};

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  for (const name of [
    '0001_initial.sql',
    '0002_domain_connections.sql',
    '0004_link_protection.sql',
    '0006_backup.sql',
    '0007_conversions.sql',
  ]) {
    const sql = await readFile(
      new URL('../../migrations/' + name, import.meta.url),
      'utf8',
    );
    const statements = unstable_splitSqlQuery(sql);
    await platform.env.DB.batch(
      statements.map((statement) => platform.env.DB.prepare(statement)),
    );
  }
  await platform.env.DB.batch([
    platform.env.DB.prepare(
      "INSERT INTO domains(id,hostname,connection_status) VALUES('a','go.example.com','active')",
    ),
    platform.env.DB.prepare(
      "INSERT INTO domains(id,hostname,connection_status) VALUES('b','links.example.org','active')",
    ),
    platform.env.DB.prepare(
      "INSERT INTO domains(id,hostname,connection_status) VALUES('draft','draft.example.net','draft')",
    ),
  ]);
}, 15_000);

afterAll(async () => platform?.dispose());

describe('link management and delivery', () => {
  it('hides archived domains and rejects new or edited links on those domains', async () => {
    const db = platform.env.DB;
    await db
      .prepare(
        "INSERT INTO domains (id, hostname, is_active, backup_archived_at) VALUES ('archived', 'old.example.org', 0, 100)",
      )
      .run();

    expect((await listDomains(db)).map(({ id }) => id)).not.toContain(
      'archived',
    );
    const archivedLink = {
      ...draft,
      slug: 'archive-check',
      domainId: 'archived',
    };
    expect(await createLink(db, null, archivedLink)).toEqual({
      ok: false,
      code: 'missing_domain',
    });
    const created = await createLink(db, null, {
      ...draft,
      slug: 'archive-check',
    });
    if (!created.ok) throw new Error(created.code);
    const link = await getLink(db, created.id);
    if (!link) throw new Error('missing link');
    expect(
      await updateLink(db, null, link.id, link.updatedAt, archivedLink),
    ).toEqual({
      ok: false,
      code: 'missing_domain',
    });
  });

  it('enforces domain-scoped uniqueness and case-sensitive lookup', async () => {
    const db = platform.env.DB;
    const first = await createLink(db, null, draft);
    expect(first).toMatchObject({ ok: true });
    expect(await createLink(db, null, draft)).toEqual({
      ok: false,
      code: 'slug_conflict',
    });
    expect(
      await createLink(db, null, { ...draft, domainId: 'b' }),
    ).toMatchObject({ ok: true });
    expect(
      await resolveShortLink(
        db,
        'go.example.com',
        'abc',
        new Request('https://go.example.com/abc'),
      ),
    ).toEqual({ status: 404 });
    expect(
      await resolveShortLink(
        db,
        'go.example.com',
        'AbC',
        new Request('https://go.example.com/AbC?private=1'),
      ),
    ).toMatchObject({
      status: 302,
      location: draft.destinationUrl,
    });
  });

  it('rejects concurrent stale edits without replacing their tags', async () => {
    const db = platform.env.DB;
    const created = await createLink(db, null, { ...draft, slug: 'edit-me' });
    if (!created.ok) throw new Error(created.code);
    const link = await getLink(db, created.id);
    if (!link) throw new Error('missing link');
    const edited = {
      ...draft,
      slug: 'edit-me',
      tags: ['latest'],
      redirectType: 307 as const,
    };
    expect(
      await updateLink(db, null, link.id, link.updatedAt, edited),
    ).toMatchObject({ ok: true });
    expect(
      await updateLink(db, null, link.id, link.updatedAt, {
        ...edited,
        tags: ['stale'],
      }),
    ).toEqual({ ok: false, code: 'stale_link' });
    expect(await getLink(db, link.id)).toMatchObject({
      tags: ['latest'],
      redirectType: 307,
    });
    expect(
      (await listLinks(db, { tag: 'latest' })).links.map(({ id }) => id),
    ).toEqual([link.id]);
  });

  it('paginates each supported link order with stable cursors and keeps legacy default cursors', async () => {
    const db = platform.env.DB;
    const fixtures = [
      { slug: 'sort-one', createdAt: 1000, updatedAt: 3000 },
      { slug: 'sort-two', createdAt: 2000, updatedAt: 1000 },
      { slug: 'sort-three', createdAt: 3000, updatedAt: 2000 },
    ];
    for (const fixture of fixtures) {
      const created = await createLink(db, null, {
        ...draft,
        slug: fixture.slug,
        tags: ['sorting'],
      });
      if (!created.ok) throw new Error(created.code);
      await db
        .prepare('UPDATE links SET created_at = ?, updated_at = ? WHERE id = ?')
        .bind(fixture.createdAt, fixture.updatedAt, created.id)
        .run();
    }

    async function readAll(
      sort: 'created_desc' | 'created_asc' | 'updated_desc',
    ) {
      const slugs: string[] = [];
      let cursor = '';
      do {
        const page = await listLinks(db, {
          tag: 'sorting',
          sort,
          limit: 2,
          cursor,
        });
        slugs.push(...page.links.map(({ slug }) => slug));
        cursor = page.nextCursor ?? '';
      } while (cursor);
      return slugs;
    }

    expect(await readAll('created_desc')).toEqual([
      'sort-three',
      'sort-two',
      'sort-one',
    ]);
    expect(await readAll('created_asc')).toEqual([
      'sort-one',
      'sort-two',
      'sort-three',
    ]);
    expect(await readAll('updated_desc')).toEqual([
      'sort-one',
      'sort-three',
      'sort-two',
    ]);

    const first = await listLinks(db, { tag: 'sorting', limit: 1 });
    const legacy = await listLinks(db, {
      tag: 'sorting',
      limit: 1,
      cursor: `${first.links[0].createdAt}:${first.links[0].id}`,
    });
    expect(legacy.links.map(({ slug }) => slug)).toEqual(['sort-two']);
  });

  it('applies snapshotted UTM values to the selected destination without forwarding visitor query parameters', async () => {
    const db = platform.env.DB;
    const created = await createLink(db, null, {
      ...draft,
      slug: 'utm-snapshot',
      utmConfigJson: JSON.stringify({ default: { utm_source: 'original' } }),
      rules: [
        {
          priority: 0,
          isActive: true,
          conditions: [{ type: 'country', operator: 'eq', value: 'JP' }],
          destinationUrl: 'https://example.org/jp?label=a%20b#section',
        },
      ],
    });
    if (!created.ok) throw new Error(created.code);
    const [rule] = await listLinkRules(db, created.id);
    const link = await getLink(db, created.id);
    if (!link || !rule) throw new Error('Missing test link or rule');
    expect(
      await updateLink(db, null, link.id, link.updatedAt, {
        ...draft,
        slug: 'utm-snapshot',
        utmConfigJson: JSON.stringify({
          default: { utm_source: 'release' },
          rules: { [rule.id]: { utm_source: 'japan' } },
        }),
      }),
    ).toMatchObject({ ok: true });

    const request = new Request(
      'https://go.example.com/utm-snapshot?utm_source=visitor&other=private',
    );
    expect(
      await resolveShortLink(db, 'go.example.com', 'utm-snapshot', request),
    ).toMatchObject({
      status: 302,
      location: 'https://example.com/a?selected=1&utm_source=release#more',
    });
    expect(
      await resolveShortLink(db, 'go.example.com', 'utm-snapshot', request, {
        country: 'JP',
      }),
    ).toMatchObject({
      status: 302,
      location: 'https://example.org/jp?label=a%20b&utm_source=japan#section',
      matchedRuleId: rule.id,
    });
  });

  it('serves expired links as 410 and keeps draft domains and protected links private', async () => {
    const db = platform.env.DB;
    const now = Math.floor(Date.now() / 1000);
    await createLink(db, null, { ...draft, slug: 'expired', expiresAt: now });
    await createLink(db, null, {
      ...draft,
      domainId: 'draft',
      slug: 'pending',
    });
    expect(
      await resolveShortLink(
        db,
        'go.example.com',
        'expired',
        new Request('https://go.example.com/expired'),
      ),
    ).toEqual({ status: 410 });
    expect(
      await resolveShortLink(
        db,
        'draft.example.net',
        'pending',
        new Request('https://draft.example.net/pending'),
      ),
    ).toEqual({ status: 404 });
  });

  it('redeems a one-time link only once across its short URL and QR code', async () => {
    const db = platform.env.DB;
    const hostname = 'go.example.com';
    const slug = 'once';
    const qr = 'a'.repeat(64);
    const created = await createLink(db, null, { ...draft, slug });
    if (!created.ok) throw new Error(created.code);
    const link = (await getLink(db, created.id))!;
    expect(
      await setLinkProtection(
        db,
        null,
        link.id,
        link.updatedAt,
        'one_time',
        '',
      ),
    ).toEqual({ ok: true });
    await db
      .prepare("INSERT INTO qr_codes(id,link_id,token) VALUES('once-qr',?,?)")
      .bind(link.id, qr)
      .run();

    const points: AnalyticsEngineDataPoint[] = [];
    const clicks: AnalyticsEngineDataset = {
      writeDataPoint(point) {
        if (point) points.push(point);
      },
    };
    const shortRequest = new Request(`https://${hostname}/${slug}`);
    const qrRequest = new Request(`https://${hostname}/q/${qr}`);
    const short = await resolveShortLink(
      db,
      hostname,
      slug,
      shortRequest,
      undefined,
      undefined,
      clicks,
    );
    const fromQr = await resolveQrLink(
      db,
      hostname,
      qr,
      qrRequest,
      undefined,
      undefined,
      clicks,
    );
    expect(short).toMatchObject({
      status: 302,
      location: expect.stringContaining('/gate/'),
    });
    expect(fromQr).toMatchObject({ status: 302, location: `/gate/q-${qr}` });
    if (!('location' in short) || !('location' in fromQr))
      throw new Error('Missing gate');
    const tokens = [short.location, fromQr.location].map((path) =>
      path.slice('/gate/'.length),
    );
    const unlocks = await Promise.all(
      tokens.map(async (token) => {
        const gate = await loadLinkGate(db, hostname, token);
        if (!('link' in gate)) throw new Error('Missing link gate');
        return unlockLinkGate(db, gate, '');
      }),
    );
    const [first, second] = unlocks;
    if (!first || !second) throw new Error('Missing unlock');
    const head = await resolveShortLink(
      db,
      hostname,
      slug,
      new Request(shortRequest, { method: 'HEAD' }),
      undefined,
      first.token,
      clicks,
    );
    expect(head).toEqual(short);
    const prefetch = new Request(shortRequest, {
      headers: { 'sec-purpose': 'prefetch;prerender' },
    });
    expect(
      await resolveShortLink(
        db,
        hostname,
        slug,
        prefetch,
        undefined,
        first.token,
        clicks,
      ),
    ).toEqual(short);
    expect(await resolveQrLink(db, 'links.example.org', qr, qrRequest)).toEqual(
      { status: 404 },
    );

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0
          ? resolveShortLink(
              db,
              hostname,
              slug,
              shortRequest,
              undefined,
              first.token,
              clicks,
            )
          : resolveQrLink(
              db,
              hostname,
              qr,
              qrRequest,
              undefined,
              second.token,
              clicks,
            ),
      ),
    );
    expect(results.filter(({ status }) => status === 410)).toHaveLength(9);
    expect(results.filter((result) => 'location' in result)).toMatchObject([
      { status: 302, location: draft.destinationUrl, linkId: link.id },
    ]);
    expect(points).toEqual([
      {
        indexes: [link.id],
        blobs: [
          draft.domainId,
          'XX',
          'unknown',
          'direct',
          'other',
          'other',
          'unknown',
          'default',
          expect.stringMatching(/^(link|qr)$/),
          'unknown',
          'none',
        ],
        doubles: [1],
      },
    ]);
    expect(await getLink(db, link.id)).toMatchObject({
      consumedAt: expect.any(Number),
    });
  });

  it('binds password unlocks to a live link revision and expiry', async () => {
    const db = platform.env.DB;
    const hostname = 'go.example.com';
    const slug = 'locked';
    const request = new Request(`https://${hostname}/${slug}`);
    const input = { ...draft, slug };
    const created = await createLink(db, null, input);
    if (!created.ok) throw new Error(created.code);
    const initial = (await getLink(db, created.id))!;
    const password = 'a strong test password';
    expect(
      await setLinkProtection(
        db,
        null,
        created.id,
        initial.updatedAt,
        'password',
        password,
      ),
    ).toEqual({ ok: true });
    expect(
      await updateLink(
        db,
        null,
        created.id,
        (await getLink(db, created.id))!.updatedAt,
        {
          ...input,
          redirectType: 308,
        },
      ),
    ).toEqual({ ok: false, code: 'temporary_redirect' });

    const gated = await resolveShortLink(db, hostname, slug, request);
    if (!('location' in gated)) throw new Error('Missing gate');
    const gate = await loadLinkGate(
      db,
      hostname,
      gated.location.slice('/gate/'.length),
    );
    if (!('link' in gate)) throw new Error('Missing link gate');
    expect(await unlockLinkGate(db, gate, 'a different test password')).toBe(
      null,
    );
    const unlocked = await unlockLinkGate(db, gate, password);
    if (!unlocked) throw new Error('Missing unlock');
    expect(
      await resolveShortLink(
        db,
        hostname,
        slug,
        request,
        undefined,
        unlocked.token,
      ),
    ).toMatchObject({ status: 302, location: input.destinationUrl });
    await db
      .prepare(
        'UPDATE link_unlocks SET expires_at = unixepoch() WHERE link_id = ?',
      )
      .bind(created.id)
      .run();
    expect(
      await resolveShortLink(
        db,
        hostname,
        slug,
        request,
        undefined,
        unlocked.token,
      ),
    ).toEqual(gated);

    const fresh = await unlockLinkGate(db, gate, password);
    if (!fresh) throw new Error('Missing fresh unlock');
    const link = (await getLink(db, created.id))!;
    expect(link).not.toHaveProperty('passwordHash');
    expect(link).not.toHaveProperty('gateToken');
    await setLinkProtection(
      db,
      null,
      created.id,
      link.updatedAt,
      'password',
      'a rotated test password',
    );
    const rotated = await resolveShortLink(
      db,
      hostname,
      slug,
      request,
      undefined,
      fresh.token,
    );
    expect(rotated).toMatchObject({
      status: 302,
      location: expect.stringContaining('/gate/'),
    });
    expect(rotated).not.toEqual(gated);
    expect(
      await loadLinkGate(db, hostname, gated.location.slice('/gate/'.length)),
    ).toEqual({ status: 404 });
  });

  it('records classified GET traffic while skipping speculative and unsuccessful requests', async () => {
    const db = platform.env.DB;
    const hostname = 'go.example.com';
    const slug = 'analytics-click';
    const input = new Request(
      `https://${hostname}/${slug}?qr=1&cl_ref=private`,
    );
    const created = await createLink(db, null, { ...draft, slug });
    if (!created.ok) throw new Error(created.code);
    const kinds: Array<string | ArrayBuffer | null> = [];
    const clicks: AnalyticsEngineDataset = {
      writeDataPoint(point) {
        const blobs = point?.blobs;
        if (blobs) kinds.push(blobs[8], blobs[9], blobs[10]);
      },
    };
    const resolve = (request: Request, path = slug) =>
      resolveShortLink(
        db,
        hostname,
        path,
        request,
        undefined,
        undefined,
        clicks,
      );

    await resolve(new Request(input, { method: 'HEAD' }));
    await resolve(
      new Request(input, { headers: { 'sec-purpose': 'prerender' } }),
    );
    await resolve(input, 'missing-analytics-link');
    await resolve(
      new Request(input, { headers: { 'user-agent': 'Googlebot' } }),
    );
    await resolve(
      new Request(input, { headers: { 'user-agent': 'Twitterbot/1.0' } }),
    );
    expect(kinds).toEqual(['link', 'bot', 'none', 'link', 'preview', 'none']);
  });

  it('adds an opaque reference only to eligible temporary redirects after opt-in', async () => {
    const db = platform.env.DB;
    const hostname = 'go.example.com';
    const destinationUrl = 'https://example.com/a?q=a%20b&cl_ref=previous#keep';
    const created = await createLink(db, null, {
      ...draft,
      slug: 'conversion-click',
      destinationUrl,
    });
    if (!created.ok) throw new Error(created.code);
    const request = new Request(`https://${hostname}/conversion-click`);
    const resolve = (input: Request) =>
      resolveShortLink(db, hostname, 'conversion-click', input);
    expect(await resolve(request)).toMatchObject({ location: destinationUrl });

    await db
      .prepare('UPDATE links SET conversion_tracking = 1 WHERE id = ?')
      .bind(created.id)
      .run();
    await db
      .prepare(
        "INSERT INTO conversion_goals (id, name, event_name, link_id) VALUES ('signup-goal', 'Signup', 'signup', ?)",
      )
      .bind(created.id)
      .run();
    expect(
      await resolve(new Request(request, { method: 'HEAD' })),
    ).toMatchObject({ location: destinationUrl });
    expect(
      await resolve(
        new Request(request, { headers: { 'user-agent': 'Googlebot' } }),
      ),
    ).toMatchObject({ location: destinationUrl });
    expect(
      await resolve(
        new Request(request, { headers: { 'sec-purpose': 'prerender' } }),
      ),
    ).toMatchObject({ location: destinationUrl });
    const result = await resolve(request);
    if (!('location' in result)) throw new Error('Missing redirect');
    const location = new URL(result.location);
    const references = location.searchParams.getAll('cl_ref');
    expect(references).toHaveLength(1);
    expect(references[0]).toMatch(/^[a-f0-9]{48}\.[a-f0-9]{64}$/);
    expect(location.searchParams.get('q')).toBe('a b');
    expect(location.hash).toBe('#keep');

    await db
      .prepare(
        `CREATE TRIGGER reject_test_click BEFORE INSERT ON click_attributions
         BEGIN SELECT RAISE(ABORT, 'Attribution unavailable'); END`,
      )
      .run();
    try {
      expect(await resolve(request)).toMatchObject({
        status: 302,
        location: destinationUrl,
      });
    } finally {
      await db.prepare('DROP TRIGGER reject_test_click').run();
    }

    await db
      .prepare('UPDATE links SET redirect_type = 301 WHERE id = ?')
      .bind(created.id)
      .run();
    expect(await resolve(request)).toMatchObject({
      status: 301,
      location: destinationUrl,
    });
  });
});

it('preserves retained rule IDs and tracking when replacing admin rules', async () => {
  const db = platform.env.DB;
  const rule = {
    conditions: [{ type: 'os', operator: 'eq', value: 'ios' }] as const,
    priority: 0,
    destinationUrl: 'https://example.com/ios',
    isActive: true,
  };
  const retainedRule = { ...rule, conditions: [...rule.conditions] };
  const created = await createLink(db, null, {
    ...draft,
    slug: 'admin-rules',
    rules: [retainedRule, { ...retainedRule, priority: 1 }],
  });
  if (!created.ok) throw new Error(created.code);
  const id = created.id;
  const [removed, retained] = await listLinkRules(db, id);
  const utm = {
    default: { utm_source: 'default' },
    rules: {
      [removed.id]: { utm_campaign: 'removed' },
      [retained.id]: { utm_campaign: 'retained' },
    },
  };
  await db
    .prepare('UPDATE links SET utm_config_json = ? WHERE id = ?')
    .bind(JSON.stringify(utm), id)
    .run();
  const before = await getLink(db, id);
  if (!before) throw new Error('Missing link');
  const input = [
    {
      ...retainedRule,
      id: retained.id,
      destinationUrl: 'https://example.com/new',
    },
    {
      ...retainedRule,
      id: null,
      priority: 1,
    },
  ];
  expect(await updateLinkRules(db, null, id, before.updatedAt, input)).toEqual({
    ok: true,
    id,
  });
  expect(await listLinkRules(db, id)).toMatchObject([
    { id: retained.id, destinationUrl: 'https://example.com/new', priority: 0 },
    { destinationUrl: 'https://example.com/ios', priority: 1 },
  ]);
  const after = await getLink(db, id);
  expect(JSON.parse(after!.utmConfigJson!)).toEqual({
    default: { utm_source: 'default' },
    rules: { [retained.id]: { utm_campaign: 'retained' } },
  });
  expect(await updateLinkRules(db, null, id, before.updatedAt, [])).toEqual({
    ok: false,
    code: 'stale_link',
  });
  expect(await listLinkRules(db, id)).toHaveLength(2);
  expect(
    await updateLinkRules(db, null, id, after!.updatedAt, [input[0], input[0]]),
  ).toEqual({ ok: false, code: 'invalid_input' });
  expect(
    await updateLinkRules(db, null, id, after!.updatedAt, [
      { ...input[0], id: 'foreign-rule' },
    ]),
  ).toEqual({ ok: false, code: 'invalid_input' });
  expect(await listLinkRules(db, id)).toHaveLength(2);
});
