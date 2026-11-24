import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import {
  beginProviderOperation,
  domainHostname,
  finishProviderOperation,
  managementDomainEnabled,
  readDomainConnection,
  setDomainConnection,
} from '../../src/lib/server/domains/connection';
import { checkPublicDns } from '../../src/lib/server/domains/dns';
import {
  issueDomainTicket,
  respondToDomainProbe,
  verifyDomainProof,
} from '../../src/lib/server/domains/proof';
import { resolveShortLink } from '../../src/lib/server/links/redirect';

let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;
const management = new URL(
  'https://linkrovia.fixture.workers.dev/admin/domains',
);
const hostname = 'go.example.org';
const csrfToken = 'fixture-owner-csrf';

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.jsonc',
    persist: false,
  });
  db = platform.env.DB;
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).sort()) {
    const text = await readFile(new URL(file, directory), 'utf8');
    await db.batch(unstable_splitSqlQuery(text).map((sql) => db.prepare(sql)));
  }
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, role, email, password_hash) VALUES ('owner', 'owner', 'owner@example.org', 'fixture')",
    ),
    db.prepare(
      "INSERT INTO domains (id, hostname, is_primary, is_active, connection_status) VALUES ('primary', 'linkrovia.fixture.workers.dev', 1, 1, 'active')",
    ),
    db.prepare(
      "INSERT INTO domains (id, hostname, is_active) VALUES ('draft', 'go.example.org', 0)",
    ),
    db.prepare(
      "INSERT INTO links (id, domain_id, slug, destination_url) VALUES ('example', 'draft', 'short', 'https://example.org/destination')",
    ),
  ]);
}, 20_000);

afterAll(async () => platform?.dispose());

it('checks public DNS via the fixed resolver and rejects nonpublic answers', async () => {
  expect(domainHostname(' Go.Example.org. ')).toBe(hostname);
  expect(domainHostname('https://example.org')).toBeNull();
  expect(domainHostname('other.fixture.workers.dev')).toBeNull();
  const resolver =
    (a: string[]) => async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        'https://cloudflare-dns.com/dns-query',
      );
      expect(url.searchParams.get('name')).toBe(hostname);
      expect(init?.redirect).toBe('manual');
      const Answer =
        url.searchParams.get('type') === 'A'
          ? a.map((data) => ({ type: 1, data }))
          : [];
      return Response.json({ Status: 0, Answer });
    };
  await expect(checkPublicDns(hostname, resolver(['1.1.1.1']))).resolves.toBe(
    'public_dns',
  );
  await expect(
    checkPublicDns(hostname, resolver(['1.1.1.1', '127.0.0.1'])),
  ).resolves.toBe('dns_unsafe');
  await expect(checkPublicDns(hostname, resolver([]))).resolves.toBe(
    'dns_pending',
  );
  await expect(
    checkPublicDns(hostname, async () => new Response(null, { status: 503 })),
  ).resolves.toBe('dns_unavailable');
  await expect(
    checkPublicDns(hostname, async () =>
      Response.redirect('https://other.example.org/dns-query'),
    ),
  ).resolves.toBe('dns_unavailable');
});

it('serializes provider changes and records which mapping may be removed', async () => {
  await db
    .prepare(
      "INSERT INTO domains(id, hostname, is_active) VALUES ('managed', 'managed.example.org', 0)",
    )
    .run();
  const draft = (await readDomainConnection(db, 'managed'))!;
  const claims = await Promise.all([
    beginProviderOperation(db, draft, 'owner', 'attach'),
    beginProviderOperation(db, draft, 'owner', 'attach'),
  ]);
  const attached = claims.filter((entry) => entry !== null);
  expect(attached).toHaveLength(1);
  const updating = (await readDomainConnection(db, 'managed'))!;
  expect(updating).toMatchObject({ status: 'provisioning', managed: false });
  expect(
    await setDomainConnection(db, updating, 'owner', 'verify', 'too-early'),
  ).toBe(false);
  expect(
    await finishProviderOperation(db, attached[0], {
      code: 'attached',
      mappingId: 'owned-id',
      zoneId: 'some-zone',
    }),
  ).toBe(true);
  const verifying = (await readDomainConnection(db, 'managed'))!;
  expect(verifying).toMatchObject({
    status: 'verifying',
    managed: true,
    mappingId: 'owned-id',
  });
  expect(
    await setDomainConnection(
      db,
      verifying,
      'owner',
      'verify',
      'managed-proof',
    ),
  ).toBe(true);
  const active = (await readDomainConnection(db, 'managed'))!;
  const rejected = await beginProviderOperation(db, active, 'owner', 'detach');
  expect(rejected).not.toBeNull();
  expect(
    await finishProviderOperation(db, rejected!, { code: 'permissions' }),
  ).toBe(true);
  const stillActive = (await readDomainConnection(db, 'managed'))!;
  expect(stillActive).toMatchObject({
    status: 'active',
    verifiedAt: active.verifiedAt,
    managed: true,
  });
  const detach = await beginProviderOperation(
    db,
    stillActive,
    'owner',
    'detach',
  );
  expect(detach).not.toBeNull();
  expect(await finishProviderOperation(db, detach!, { code: 'detached' })).toBe(
    true,
  );
  expect(await readDomainConnection(db, 'managed')).toMatchObject({
    status: 'disconnected',
    managed: false,
    mappingId: null,
  });
});

it('requires HTTPS and a proof from the registered hostname before enabling publication', async () => {
  const draft = (await readDomainConnection(db, 'draft'))!;
  const visit = () =>
    resolveShortLink(
      db,
      hostname,
      'short',
      new Request(`https://${hostname}/short`),
    );
  expect((await visit()).status).toBe(404);
  expect(
    await issueDomainTicket(
      db,
      draft,
      new URL('http://linkrovia.fixture.workers.dev'),
      csrfToken,
    ),
  ).toBeNull();
  expect(
    await issueDomainTicket(
      db,
      (await readDomainConnection(db, 'primary'))!,
      management,
      csrfToken,
    ),
  ).toBeNull();
  const challenge = await issueDomainTicket(db, draft, management, csrfToken);
  if (!challenge) throw new Error('Missing challenge');
  expect(
    await respondToDomainProbe(
      db,
      challenge.ticket,
      new URL('https://other.example.org'),
      management.origin,
    ),
  ).toBeNull();
  expect(
    await respondToDomainProbe(
      db,
      challenge.ticket,
      new URL(challenge.url),
      'https://other.example.org',
    ),
  ).toBeNull();
  const probe = await respondToDomainProbe(
    db,
    challenge.ticket,
    new URL(challenge.url),
    management.origin,
  );
  if (!probe) throw new Error('Missing proof');
  expect(
    await verifyDomainProof(
      db,
      draft,
      management.origin,
      'different',
      challenge.ticket,
      probe.proof,
    ),
  ).toBeNull();
  const operation = await verifyDomainProof(
    db,
    draft,
    management.origin,
    csrfToken,
    challenge.ticket,
    probe.proof,
  );
  if (!operation) throw new Error('Invalid owner proof');
  expect(
    (
      await Promise.all(
        [0, 1].map(() =>
          setDomainConnection(db, draft, 'owner', 'verify', operation),
        ),
      )
    ).filter(Boolean),
  ).toHaveLength(1);
  const active = (await readDomainConnection(db, 'draft'))!;
  expect(active).toMatchObject({
    status: 'active',
    version: draft.version + 1,
  });
  expect(await visit()).toMatchObject({
    status: 302,
    location: 'https://example.org/destination',
  });
  expect(
    await verifyDomainProof(
      db,
      active,
      management.origin,
      csrfToken,
      challenge.ticket,
      probe.proof,
    ),
  ).toBeNull();
  expect(
    await setDomainConnection(
      db,
      active,
      'owner',
      'disconnect',
      'disconnect-test',
    ),
  ).toBe(true);
  expect((await visit()).status).toBe(404);
  expect(
    await db
      .prepare("SELECT COUNT(*) AS total FROM links WHERE domain_id = 'draft'")
      .first('total'),
  ).toBe(1);
});

it('authorizes management only for an enabled, active, verified custom domain', async () => {
  await db
    .prepare(
      `INSERT INTO domains (id, hostname, is_primary, is_active, connection_status, provider_mode, verified_at, management_enabled)
    VALUES ('management-test', 'manage.example.org', 0, 1, 'active', 'cloudflare_custom_domain', unixepoch(), 1)`,
    )
    .run();
  expect(await managementDomainEnabled(db, 'manage.example.org')).toBe(true);
  expect(await managementDomainEnabled(db, 'other.example.org')).toBe(false);
  for (const change of [
    'management_enabled = 0',
    'is_active = 0',
    "connection_status = 'warning'",
    'verified_at = NULL',
    "provider_mode = 'unconfigured'",
    'backup_archived_at = unixepoch()',
  ]) {
    await db
      .prepare(`UPDATE domains SET ${change} WHERE id = 'management-test'`)
      .run();
    expect(await managementDomainEnabled(db, 'manage.example.org')).toBe(false);
    await db
      .prepare(
        `UPDATE domains SET management_enabled = 1, is_active = 1, connection_status = 'active', verified_at = unixepoch(), provider_mode = 'cloudflare_custom_domain', backup_archived_at = NULL, is_primary = 0 WHERE id = 'management-test'`,
      )
      .run();
  }
});
