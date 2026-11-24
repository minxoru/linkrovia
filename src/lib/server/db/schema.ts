import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { Theme } from '../../theme/theme';

// The D1 migrations are the schema authority. Apply them through Wrangler.
// The tags.name NOCASE collation is defined in SQL.

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    locale: text('locale').notNull().default('en'),
    timezone: text('timezone'),
    theme: text('theme').$type<Theme>().notNull().default('system'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
    disabledAt: integer('disabled_at'),
  },
  () => [
    check('users_role_check', sql`role IN ('owner','admin')`),
    check('users_theme_check', sql`theme IN ('system', 'light', 'dark')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfTokenHash: text('csrf_token_hash'),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    revokedAt: integer('revoked_at'),
  },
  (table) => [index('sessions_user').on(table.userId, table.expiresAt)],
);

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scopes: text('scopes').notNull(),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  lastUsedAt: integer('last_used_at'),
  expiresAt: integer('expires_at'),
  revokedAt: integer('revoked_at'),
});

export const domains = sqliteTable(
  'domains',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull().unique(),
    isPrimary: integer('is_primary').notNull().default(0),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
    providerMode: text('provider_mode').notNull().default('unconfigured'),
    connectionStatus: text('connection_status').notNull().default('draft'),
    cloudflareZoneId: text('cloudflare_zone_id'),
    cloudflareDomainId: text('cloudflare_domain_id'),
    dnsInstructionsJson: text('dns_instructions_json'),
    lastCheckedAt: integer('last_checked_at'),
    verifiedAt: integer('verified_at'),
    connectionErrorCode: text('connection_error_code'),
    connectionVersion: integer('connection_version').notNull().default(0),
    backupArchivedAt: integer('backup_archived_at'),
    managementEnabled: integer('management_enabled').notNull().default(0),
  },
  (table) => [
    check('domains_management_enabled_check', sql`management_enabled IN (0,1)`),
    check(
      'domains_provider_mode_check',
      sql`provider_mode IN ('unconfigured','cloudflare_custom_domain','external_dns_guided')`,
    ),
    check(
      'domains_connection_status_check',
      sql`connection_status IN ('draft','checking','awaiting_authorization','awaiting_dns','provisioning','verifying','active','warning','failed','disconnected')`,
    ),
    uniqueIndex('domains_single_primary')
      .on(table.isPrimary)
      .where(sql`is_primary = 1`),
    uniqueIndex('domains_one_management')
      .on(table.managementEnabled)
      .where(sql`management_enabled = 1`),
    index('domains_connection_status').on(
      table.connectionStatus,
      table.lastCheckedAt,
    ),
  ],
);

export const links = sqliteTable(
  'links',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id),
    slug: text('slug').notNull(),
    destinationUrl: text('destination_url').notNull(),
    title: text('title'),
    description: text('description'),
    protectionMode: text('protection_mode').notNull().default('none'),
    protectionPasswordHash: text('protection_password_hash'),
    gateToken: text('gate_token'),
    consumedAt: integer('consumed_at'),
    utmConfigJson: text('utm_config_json'),
    redirectType: integer('redirect_type').notNull().default(302),
    conversionTracking: integer('conversion_tracking').notNull().default(0),
    isActive: integer('is_active').notNull().default(1),
    startsAt: integer('starts_at'),
    expiresAt: integer('expires_at'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    check(
      'links_protection_mode_check',
      sql`protection_mode IN ('none','password','one_time','password_one_time')`,
    ),
    check('links_redirect_type_check', sql`redirect_type IN (301,302,307,308)`),
    check(
      'links_conversion_tracking_check',
      sql`conversion_tracking IN (0, 1)`,
    ),
    unique().on(table.domainId, table.slug),
    uniqueIndex('links_gate_token')
      .on(table.gateToken)
      .where(sql`gate_token IS NOT NULL`),
    check(
      'links_active_window_check',
      sql`expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at`,
    ),
    check(
      'links_protection_password_check',
      sql`(protection_mode IN ('password', 'password_one_time')) = (protection_password_hash IS NOT NULL)`,
    ),
    check(
      'links_consumption_check',
      sql`consumed_at IS NULL OR protection_mode IN ('one_time', 'password_one_time')`,
    ),
    index('links_domain_created').on(
      table.domainId,
      sql`${table.createdAt} DESC`,
    ),
    index('links_status').on(table.domainId, table.isActive, table.deletedAt),
  ],
);

export const linkUnlocks = sqliteTable(
  'link_unlocks',
  {
    tokenHash: text('token_hash').primaryKey(),
    linkId: text('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    linkVersion: integer('link_version').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    index('link_unlocks_expiry').on(table.expiresAt),
    index('link_unlocks_link').on(table.linkId),
  ],
);

export const redirectRules = sqliteTable(
  'redirect_rules',
  {
    id: text('id').primaryKey(),
    linkId: text('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    ruleType: text('rule_type').notNull(),
    operator: text('operator').notNull().default('eq'),
    ruleValue: text('rule_value').notNull(),
    conditionsJson: text('conditions_json'),
    destinationUrl: text('destination_url').notNull(),
    priority: integer('priority').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'redirect_rules_rule_type_check',
      sql`rule_type IN ('os','device','country','region','language')`,
    ),
    check(
      'redirect_rules_operator_check',
      sql`operator IN ('eq','base_language')`,
    ),
    index('redirect_rules_lookup').on(
      table.linkId,
      table.isActive,
      table.priority,
      table.id,
    ),
  ],
);

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const linkTags = sqliteTable(
  'link_tags',
  {
    linkId: text('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.linkId, table.tagId] }),
    index('link_tags_tag').on(table.tagId, table.linkId),
  ],
);

export const qrCodes = sqliteTable('qr_codes', {
  id: text('id').primaryKey(),
  linkId: text('link_id')
    .notNull()
    .references(() => links.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  label: text('label'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  jsonValue: text('json_value').notNull(),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const backupState = sqliteTable(
  'backup_state',
  {
    singleton: integer('singleton').primaryKey(),
    instanceId: text('instance_id').notNull(),
    signingKey: text('signing_key').notNull(),
    revision: integer('revision').notNull().default(0),
  },
  () => [check('backup_state_singleton_check', sql`singleton = 1`)],
);

export const setupState = sqliteTable(
  'setup_state',
  {
    singleton: integer('singleton').primaryKey(),
    completedAt: integer('completed_at'),
    ownerUserId: text('owner_user_id'),
    tokenConsumedAt: integer('token_consumed_at'),
    deploymentHostname: text('deployment_hostname'),
    managementHostname: text('management_hostname'),
    managementOperationId: text('management_operation_id'),
    managementOperationExpiresAt: integer('management_operation_expires_at'),
  },
  (table) => [check('setup_state_singleton_check', sql`singleton=1`)],
);

export const analyticsRollups = sqliteTable(
  'analytics_rollups',
  {
    dayUtc: text('day_utc').notNull(),
    linkId: text('link_id').notNull(),
    dimension: text('dimension').notNull(),
    dimensionValue: text('dimension_value').notNull(),
    clickCount: real('click_count').notNull().default(0),
    estimated: integer('estimated').notNull().default(0),
    calculatedAt: integer('calculated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({
      columns: [
        table.dayUtc,
        table.linkId,
        table.dimension,
        table.dimensionValue,
      ],
    }),
    index('analytics_rollups_link_day').on(table.linkId, table.dayUtc),
    index('analytics_rollups_dim_day').on(table.dimension, table.dayUtc),
  ],
);

export const rollupJobs = sqliteTable(
  'rollup_jobs',
  {
    dayUtc: text('day_utc').primaryKey(),
    status: text('status').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    errorCode: text('error_code'),
    attemptCount: integer('attempt_count').notNull().default(0),
    estimated: integer('estimated').notNull().default(0),
  },
  (table) => [
    check(
      'rollup_jobs_status_check',
      sql`status IN ('running','completed','failed')`,
    ),
  ],
);

export const clickRollupRepair = sqliteTable(
  'click_rollup_repair',
  {
    id: integer('id').primaryKey(),
    dayUtc: text('day_utc').notNull(),
    requestedAt: integer('requested_at').notNull(),
    nextAttemptAt: integer('next_attempt_at').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    finished: integer('finished').notNull().default(0),
  },
  () => [
    check('click_rollup_repair_singleton', sql`id = 1`),
    check('click_rollup_repair_finished_check', sql`finished IN (0, 1)`),
  ],
);

export const utmTemplates = sqliteTable('utm_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  valuesJson: text('values_json').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const conversionGoals = sqliteTable(
  'conversion_goals',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    linkId: text('link_id').references(() => links.id),
    eventName: text('event_name').notNull(),
    backupArchivedAt: integer('backup_archived_at'),
    attributionWindowHours: integer('attribution_window_hours')
      .notNull()
      .default(24),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('conversion_goals_backup_lookup').on(
      table.linkId,
      table.eventName,
      table.backupArchivedAt,
    ),
    uniqueIndex('conversion_goals_live_event')
      .on(sql`coalesce(${table.linkId}, '')`, table.eventName)
      .where(sql`${table.backupArchivedAt} IS NULL`),
  ],
);

export const clickAttributions = sqliteTable(
  'click_attributions',
  {
    refHash: text('ref_hash').primaryKey(),
    linkId: text('link_id')
      .notNull()
      .references(() => links.id),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at').notNull(),
    eligibleGoalsJson: text('eligible_goals_json').notNull().default('{}'),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    index('click_attributions_expires').on(table.expiresAt),
    index('click_attributions_cohort').on(table.createdAt, table.linkId),
    check(
      'click_attributions_eligible_goals_check',
      sql`json_valid(${table.eligibleGoalsJson})`,
    ),
  ],
);

export const conversionReceipts = sqliteTable(
  'conversion_receipts',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => conversionGoals.id),
    clickRefHash: text('click_ref_hash'),
    dedupeKeyHash: text('dedupe_key_hash').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    linkId: text('link_id').references(() => links.id),
    status: text('status').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'conversion_receipts_status_check',
      sql`status IN ('accepted','unattributed')`,
    ),
    unique().on(table.goalId, table.dedupeKeyHash),
    index('conversion_receipts_link_time').on(table.linkId, table.occurredAt),
    index('conversion_receipts_goal_time').on(table.goalId, table.occurredAt),
    index('conversion_receipts_retention').on(table.createdAt, table.id),
    uniqueIndex('conversion_receipts_goal_click')
      .on(table.goalId, table.clickRefHash)
      .where(sql`${table.clickRefHash} IS NOT NULL`),
  ],
);

export const conversionRollups = sqliteTable(
  'conversion_rollups',
  {
    dayUtc: text('day_utc').notNull(),
    goalId: text('goal_id').notNull(),
    linkId: text('link_id').notNull(),
    conversions: integer('conversions').notNull().default(0),
    attributed: integer('attributed').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.dayUtc, table.goalId, table.linkId] }),
    check(
      'conversion_rollup_attributed_check',
      sql`${table.attributed} BETWEEN 0 AND ${table.conversions}`,
    ),
  ],
);

export const conversionCohortRollups = sqliteTable(
  'conversion_cohort_rollups',
  {
    dayUtc: text('day_utc').notNull(),
    goalId: text('goal_id').notNull(),
    eligibleClicks: integer('eligible_clicks').notNull(),
    convertedClicks: integer('converted_clicks').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dayUtc, table.goalId] }),
    check('conversion_cohort_eligible_check', sql`${table.eligibleClicks} > 0`),
    check(
      'conversion_cohort_converted_check',
      sql`${table.convertedClicks} BETWEEN 0 AND ${table.eligibleClicks}`,
    ),
  ],
);

export const linkHealth = sqliteTable(
  'link_health',
  {
    linkId: text('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    destinationFingerprint: text('destination_fingerprint').notNull(),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    failureCode: text('failure_code'),
    lastCheckedAt: integer('last_checked_at'),
    nextCheckAt: integer('next_check_at'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  },
  (table) => [
    check(
      'link_health_status_check',
      sql`status IN ('pending','healthy','broken','blocked','unknown')`,
    ),
    primaryKey({ columns: [table.linkId, table.destinationFingerprint] }),
    index('link_health_due').on(table.nextCheckAt, table.status),
  ],
);

export const maintenanceJobs = sqliteTable(
  'maintenance_jobs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    cursorValue: text('cursor_value'),
    attemptCount: integer('attempt_count').notNull().default(0),
    errorCode: text('error_code'),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'maintenance_jobs_status_check',
      sql`status IN ('pending','running','completed','failed')`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('audit_events_created').on(table.createdAt)],
);

export const importJobs = sqliteTable(
  'import_jobs',
  {
    id: text('id').primaryKey(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    checkpointJson: text('checkpoint_json'),
    reportJson: text('report_json'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'import_jobs_kind_check',
      sql`kind IN ('links_csv','backup_restore')`,
    ),
  ],
);

export const schemaMeta = sqliteTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const domainConnectionOperations = sqliteTable(
  'domain_connection_operations',
  {
    id: text('id').primaryKey(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    operationType: text('operation_type').notNull(),
    status: text('status').notNull(),
    attempt: integer('attempt').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    errorCode: text('error_code'),
    sanitizedResultJson: text('sanitized_result_json'),
    startedAt: integer('started_at')
      .notNull()
      .default(sql`(unixepoch())`),
    finishedAt: integer('finished_at'),
  },
  (table) => [
    check(
      'domain_connection_operations_operation_type_check',
      sql`operation_type IN ('preflight','connect','verify','disconnect')`,
    ),
    check(
      'domain_connection_operations_status_check',
      sql`status IN ('pending','running','succeeded','failed','needs_user_action')`,
    ),
    index('domain_connection_operations_domain').on(
      table.domainId,
      sql`${table.startedAt} DESC`,
    ),
  ],
);

export const managementSignins = sqliteTable(
  'management_signins',
  {
    stateHash: text('state_hash').primaryKey(),
    verifierHash: text('verifier_hash').notNull(),
    targetOrigin: text('target_origin').notNull(),
    codeHash: text('code_hash').unique(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    check(
      'management_signins_user_check',
      sql`code_hash IS NULL OR user_id IS NOT NULL`,
    ),
    index('management_signins_expiry_idx').on(table.expiresAt),
  ],
);

export const passkeyCredentials = sqliteTable(
  'passkey_credentials',
  {
    credentialId: text('credential_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rpId: text('rp_id').notNull(),
    origin: text('origin').notNull(),
    publicKey: text('public_key').notNull(),
    signCount: integer('sign_count').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'passkey_sign_count_range',
      sql`${table.signCount} BETWEEN 0 AND 4294967295`,
    ),
    index('passkey_credentials_user').on(table.userId),
  ],
);

export const passkeyChallenges = sqliteTable(
  'passkey_challenges',
  {
    tokenHash: text('token_hash').primaryKey(),
    challenge: text('challenge').notNull().unique(),
    flow: text('flow', { enum: ['owner', 'login'] }).notNull(),
    rpId: text('rp_id').notNull(),
    origin: text('origin').notNull(),
    proofHash: text('proof_hash'),
    ownerId: text('owner_id'),
    ownerEmail: text('owner_email'),
    ownerLocale: text('owner_locale'),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    check('passkey_challenges_flow', sql`${table.flow} IN ('owner', 'login')`),
    check(
      'passkey_challenges_owner_binding',
      sql`
      (${table.flow} = 'owner' AND ${table.proofHash} IS NOT NULL
        AND ${table.ownerId} IS NOT NULL AND ${table.ownerEmail} IS NOT NULL AND ${table.ownerLocale} IS NOT NULL)
      OR
      (${table.flow} = 'login' AND ${table.proofHash} IS NULL
        AND ${table.ownerId} IS NULL AND ${table.ownerEmail} IS NULL AND ${table.ownerLocale} IS NULL)
    `,
    ),
    index('passkey_challenges_expiry').on(table.expiresAt),
  ],
);

export const conversionLinkCohortRollups = sqliteTable(
  'conversion_link_cohort_rollups',
  {
    dayUtc: text('day_utc').notNull(),
    goalId: text('goal_id').notNull(),
    linkId: text('link_id').notNull(),
    eligibleClicks: integer('eligible_clicks').notNull(),
    convertedClicks: integer('converted_clicks').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dayUtc, table.goalId, table.linkId] }),
    check(
      'conversion_link_cohort_eligible_check',
      sql`${table.eligibleClicks} > 0`,
    ),
    check(
      'conversion_link_cohort_converted_check',
      sql`${table.convertedClicks} BETWEEN 0 AND ${table.eligibleClicks}`,
    ),
  ],
);

export const adminInvites = sqliteTable(
  'admin_invites',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    acceptedBy: text('accepted_by').references(() => users.id),
    acceptedAt: integer('accepted_at'),
  },
  (table) => [
    check(
      'admin_invites_acceptance',
      sql`(${table.acceptedBy} IS NULL) = (${table.acceptedAt} IS NULL)`,
    ),
    check(
      'admin_invites_not_revoked',
      sql`${table.acceptedBy} IS NULL OR ${table.revokedAt} IS NULL`,
    ),
    uniqueIndex('admin_invites_pending_email')
      .on(table.email)
      .where(sql`${table.revokedAt} IS NULL AND ${table.acceptedBy} IS NULL`),
  ],
);
