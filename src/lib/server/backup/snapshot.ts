import { isLocale } from '../../i18n/locale';
import { resolveTimeZone } from '../../timezone/timezone';
import type { ProtectionMode } from '../links/protection';
import { parseConditions, type TargetingRule } from '../targeting';
import { parseUtmConfig } from '../utm';
import { parseUtmTemplateRow } from '../utm/templates';
import { BackupError, backupMaxRecords, type BackupData } from './format';

type Domain = BackupData['domains'][number];
type DomainRow = Omit<Domain, 'isPrimary' | 'isActive'> & {
  isPrimary: number;
  isActive: number;
  isConnected: number;
  archived: number;
};
type LinkRow = Omit<BackupData['links'][number], 'isActive' | 'utmConfig'> & {
  isActive: number;
  utmConfigJson: string | null;
};
type RuleRow = TargetingRule & { linkId: string };
type GoalRow = Omit<BackupData['conversionGoals'][number], 'isActive'> & {
  isActive: number;
};
type Tombstone = {
  id: string;
  domainId: string;
  slug: string;
  protectionMode: ProtectionMode;
  consumedAt: number | null;
};
type BackupIdentity = { instanceId: string; key: string; revision: number };

export type BackupState = BackupIdentity & {
  data: BackupData;
  domains: (Domain & { isConnected: boolean; archived: boolean })[];
  tombstones: Tombstone[];
  linkSecurity: (Tombstone & { hasPassword: boolean })[];
  archivedGoals: BackupData['conversionGoals'];
};

function parseStoredJson(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function readBackupState(
  db: D1Database,
  incoming?: BackupData,
): Promise<BackupState> {
  const limit = backupMaxRecords + 1;
  const incomingHostnames = new Map(
    incoming?.domains.map(({ id, hostname }) => [id, hostname]),
  );
  const hostnames = JSON.stringify([...incomingHostnames.values()]);
  const pairs = JSON.stringify(
    incoming?.links.map(({ domainId, slug }) => [
      incomingHostnames.get(domainId),
      slug,
    ]) ?? [],
  );
  const sourceLinkIds = JSON.stringify(
    incoming?.links.map(({ id }) => id) ?? [],
  );
  const incomingLinks = new Map(
    incoming?.links.map(({ id, domainId, slug }) => [
      id,
      [incomingHostnames.get(domainId), slug],
    ]),
  );
  const goals = JSON.stringify(
    incoming?.conversionGoals.flatMap<(string | null | undefined)[]>(
      ({ id, linkId, eventName }) => {
        if (linkId === null) return [[id, eventName, null, null]];
        const link = incomingLinks.get(linkId);
        return link?.[0] ? [[id, eventName, ...link]] : [];
      },
    ) ?? [],
  );
  const goalFields = `
    g.id, g.link_id AS linkId, g.name, g.event_name AS eventName,
    g.attribution_window_hours AS attributionWindowHours, g.is_active AS isActive`;
  const domainFields = `
    id, hostname, is_primary AS isPrimary, is_active AS isActive,
    connection_status = 'active' AS isConnected,
    backup_archived_at IS NOT NULL AS archived`;
  const visibleLink = `
    l.deleted_at IS NULL AND (
      d.backup_archived_at IS NULL OR d.hostname IN (SELECT value FROM json_each(?))
    )`;
  const [
    identity,
    settingRows,
    domainRows,
    archivedDomainRows,
    linkRows,
    tagRows,
    linkTagRows,
    ruleRows,
    templateRows,
    goalRows,
    qrRows,
    tombstoneRows,
    linkSecurityRows,
    archivedGoalRows,
  ] = await db.batch([
    db.prepare(
      'SELECT instance_id AS instanceId, signing_key AS key, revision FROM backup_state WHERE singleton = 1',
    ),
    db.prepare(
      "SELECT key, json_value AS value FROM app_settings WHERE key IN ('default_timezone', 'default_locale')",
    ),
    db.prepare(`
      SELECT ${domainFields} FROM domains
      WHERE backup_archived_at IS NULL ORDER BY id LIMIT ${limit}`),
    db
      .prepare(
        `
      SELECT ${domainFields} FROM domains
      WHERE backup_archived_at IS NOT NULL
        AND hostname IN (SELECT value FROM json_each(?))
      ORDER BY id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db
      .prepare(
        `
      SELECT l.id, l.domain_id AS domainId, l.slug, l.destination_url AS destinationUrl,
        l.title, l.description, l.redirect_type AS redirectType, l.is_active AS isActive,
        l.starts_at AS startsAt, l.expires_at AS expiresAt, l.protection_mode AS protectionMode,
        l.consumed_at AS consumedAt, l.utm_config_json AS utmConfigJson
      FROM links l JOIN domains d ON d.id = l.domain_id
      WHERE ${visibleLink} ORDER BY l.id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db.prepare(`SELECT id, name FROM tags ORDER BY id LIMIT ${limit}`),
    db
      .prepare(
        `
      SELECT t.link_id AS linkId, t.tag_id AS tagId
      FROM link_tags t JOIN links l ON l.id = t.link_id JOIN domains d ON d.id = l.domain_id
      WHERE ${visibleLink} ORDER BY t.link_id, t.tag_id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db
      .prepare(
        `
      SELECT r.id, r.link_id AS linkId, r.conditions_json AS conditionsJson, r.rule_type AS ruleType,
        r.operator, r.rule_value AS ruleValue, r.destination_url AS destinationUrl, r.priority,
        r.is_active AS isActive
      FROM redirect_rules r JOIN links l ON l.id = r.link_id JOIN domains d ON d.id = l.domain_id
      WHERE ${visibleLink} ORDER BY r.id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db.prepare(`
      SELECT id, name, values_json AS valuesJson, created_at AS createdAt, updated_at AS updatedAt
      FROM utm_templates ORDER BY id LIMIT ${limit}`),
    db
      .prepare(
        `
      SELECT ${goalFields}
      FROM conversion_goals g LEFT JOIN links l ON l.id = g.link_id
        LEFT JOIN domains d ON d.id = l.domain_id
      WHERE g.backup_archived_at IS NULL AND (g.link_id IS NULL OR (${visibleLink}))
      ORDER BY g.id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db
      .prepare(
        `
      SELECT q.id, q.link_id AS linkId, q.label
      FROM qr_codes q JOIN links l ON l.id = q.link_id JOIN domains d ON d.id = l.domain_id
      WHERE ${visibleLink} ORDER BY q.id LIMIT ${limit}`,
      )
      .bind(hostnames),
    db
      .prepare(
        `
      SELECT l.id, l.domain_id AS domainId, l.slug, l.protection_mode AS protectionMode,
        l.consumed_at AS consumedAt
      FROM json_each(?) AS pair
        JOIN domains d ON d.hostname = json_extract(pair.value, '$[0]')
        JOIN links l ON l.domain_id = d.id AND l.slug = json_extract(pair.value, '$[1]')
      WHERE l.deleted_at IS NOT NULL ORDER BY l.id LIMIT ${limit}`,
      )
      .bind(pairs),
    db
      .prepare(
        `
      WITH requested_links(id) AS (
        SELECT value FROM json_each(?)
        UNION
        SELECT l.id FROM json_each(?) AS pair
        JOIN domains d ON d.hostname = json_extract(pair.value, '$[0]')
        JOIN links l ON l.domain_id = d.id AND l.slug = json_extract(pair.value, '$[1]')
      )
      SELECT l.id, l.domain_id AS domainId, l.slug, l.protection_mode AS protectionMode,
        l.consumed_at AS consumedAt,
        CASE
          -- Match the format accepted by verifyPassword, without returning credentials.
          WHEN length(l.protection_password_hash) = 117
            AND length(CAST(l.protection_password_hash AS BLOB)) = 117
            AND substr(l.protection_password_hash, 1, 20) = 'scrypt-v1$32768$8$3$'
            AND substr(l.protection_password_hash, 21, 32) NOT GLOB '*[^0-9a-f]*'
            AND substr(l.protection_password_hash, 53, 1) = '$'
            AND substr(l.protection_password_hash, 54, 64) NOT GLOB '*[^0-9a-f]*'
          THEN 1 ELSE 0
        END AS hasPassword
      FROM requested_links requested JOIN links l ON l.id = requested.id
      ORDER BY l.id LIMIT ${2 * backupMaxRecords + 1}`,
      )
      .bind(sourceLinkIds, pairs),
    db
      .prepare(
        `
      SELECT DISTINCT ${goalFields}
      FROM json_each(?) AS goal
      LEFT JOIN domains d ON d.hostname = json_extract(goal.value, '$[2]')
      LEFT JOIN links l ON l.domain_id = d.id AND l.slug = json_extract(goal.value, '$[3]')
      JOIN conversion_goals g ON g.id = (
        SELECT candidate.id FROM conversion_goals candidate
        WHERE candidate.event_name = json_extract(goal.value, '$[1]')
          AND candidate.link_id IS l.id
          AND (json_extract(goal.value, '$[2]') IS NULL OR l.id IS NOT NULL)
          AND (candidate.backup_archived_at IS NOT NULL OR l.deleted_at IS NOT NULL)
        ORDER BY (candidate.id = json_extract(goal.value, '$[0]')) DESC,
          COALESCE(candidate.backup_archived_at, l.deleted_at) DESC, candidate.id
        LIMIT 1
      )
      ORDER BY g.id LIMIT ${limit}`,
      )
      .bind(goals),
  ]);

  const count = [
    domainRows,
    linkRows,
    tagRows,
    linkTagRows,
    ruleRows,
    templateRows,
    goalRows,
    qrRows,
  ].reduce((total, result) => total + result.results.length, 0);
  if (
    count > backupMaxRecords ||
    archivedDomainRows.results.length > backupMaxRecords ||
    tombstoneRows.results.length > backupMaxRecords ||
    linkSecurityRows.results.length > 2 * backupMaxRecords ||
    archivedGoalRows.results.length > backupMaxRecords
  ) {
    throw new BackupError('too_large');
  }

  const [instance] = identity.results as BackupIdentity[];
  if (!instance) throw new Error('Backup identity is unavailable');

  const settings = new Map(
    (settingRows.results as { key: string; value: string }[]).map(
      ({ key, value }) => [key, parseStoredJson(value)],
    ),
  );
  const locale = settings.get('default_locale');
  const convertDomain = (row: DomainRow): Domain => ({
    id: row.id,
    hostname: row.hostname,
    isPrimary: row.isPrimary === 1,
    isActive: row.isActive === 1,
  });
  const redirectRules = (ruleRows.results as RuleRow[]).flatMap(
    ({ conditionsJson, ruleType, operator, ruleValue, isActive, ...rule }) => {
      const conditions = parseConditions(
        conditionsJson ?? [{ type: ruleType, operator, value: ruleValue }],
      );
      return conditions
        ? [{ ...rule, conditions, isActive: isActive === 1 }]
        : [];
    },
  );
  const ruleOwners = new Map(
    redirectRules.map(({ id, linkId }) => [id, linkId]),
  );
  const convertGoal = ({
    isActive,
    ...goal
  }: GoalRow): BackupData['conversionGoals'][number] => ({
    ...goal,
    isActive: isActive === 1,
  });
  const data: BackupData = {
    appSettings: {
      defaultTimeZone: resolveTimeZone(null, settings.get('default_timezone')),
      defaultLocale: isLocale(locale) ? locale : 'en',
    },
    domains: (domainRows.results as DomainRow[]).map(convertDomain),
    links: (linkRows.results as LinkRow[]).map(
      ({ isActive, utmConfigJson, ...link }) => {
        const utmConfig = parseUtmConfig(parseStoredJson(utmConfigJson));
        if (utmConfig?.rules) {
          utmConfig.rules = Object.fromEntries(
            Object.entries(utmConfig.rules).filter(
              ([ruleId]) => ruleOwners.get(ruleId) === link.id,
            ),
          );
        }
        return { ...link, isActive: isActive === 1, utmConfig };
      },
    ),
    tags: tagRows.results as BackupData['tags'],
    linkTags: linkTagRows.results as BackupData['linkTags'],
    redirectRules,
    utmTemplates: (
      templateRows.results as Parameters<typeof parseUtmTemplateRow>[0][]
    ).flatMap((row) => {
      const template = parseUtmTemplateRow(row);
      if (!template) return [];
      const { id, name, description, values } = template;
      return [{ id, name, description, values }];
    }),
    conversionGoals: (goalRows.results as GoalRow[]).map(convertGoal),
    qrMetadata: qrRows.results as BackupData['qrMetadata'],
  };

  return {
    ...instance,
    data,
    domains: (
      [...domainRows.results, ...archivedDomainRows.results] as DomainRow[]
    ).map((row) => ({
      ...convertDomain(row),
      isConnected: row.isConnected === 1,
      archived: row.archived === 1,
    })),
    tombstones: tombstoneRows.results as Tombstone[],
    linkSecurity: (
      linkSecurityRows.results as (Tombstone & { hasPassword: number })[]
    ).map(({ hasPassword, ...link }) => ({
      ...link,
      hasPassword: hasPassword === 1,
    })),
    archivedGoals: (archivedGoalRows.results as GoalRow[]).map(convertGoal),
  };
}
