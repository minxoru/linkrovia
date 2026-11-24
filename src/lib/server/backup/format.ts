import { version } from '../../../../package.json';
import { isLocale } from '../../i18n/locale';
import { isTimeZone } from '../../timezone/timezone';
import { encode, hex, sha256 } from '../auth/crypto';
import { isEpochSecond, isObject, readApiJson } from '../links/api-input';
import { isOneTime, type ProtectionMode } from '../links/protection';
import type { RedirectType } from '../links/store';
import { isValidSlug } from '../security/slug';
import { normalizeHostname, parseDestinationUrl } from '../security/url-policy';
import { parseConditions, type TargetingCondition } from '../targeting';
import { parseUtmConfig, type UtmConfig } from '../utm';
import { parseUtmTemplateInput, type UtmTemplateInput } from '../utm/templates';

export const backupMaxBytes = 128 * 1024;
export const backupMaxRecords = 250;
const schemaVersion = 1;

export const backupDataKeys = [
  'domains',
  'links',
  'tags',
  'linkTags',
  'redirectRules',
  'utmTemplates',
  'conversionGoals',
  'qrMetadata',
] as const;

type RecordCounts = Record<(typeof backupDataKeys)[number], number>;

export type BackupData = {
  appSettings: { defaultTimeZone: string; defaultLocale: string };
  domains: {
    id: string;
    hostname: string;
    isPrimary: boolean;
    isActive: boolean;
  }[];
  links: {
    id: string;
    domainId: string;
    slug: string;
    destinationUrl: string;
    title: string | null;
    description: string | null;
    redirectType: RedirectType;
    isActive: boolean;
    startsAt: number | null;
    expiresAt: number | null;
    protectionMode: ProtectionMode;
    consumedAt: number | null;
    utmConfig: UtmConfig | null;
  }[];
  tags: { id: string; name: string }[];
  linkTags: { linkId: string; tagId: string }[];
  redirectRules: {
    id: string;
    linkId: string;
    conditions: TargetingCondition[];
    destinationUrl: string;
    priority: number;
    isActive: boolean;
  }[];
  utmTemplates: (UtmTemplateInput & { id: string })[];
  conversionGoals: {
    id: string;
    linkId: string | null;
    name: string;
    eventName: string;
    attributionWindowHours: number;
    isActive: boolean;
  }[];
  qrMetadata: { id: string; linkId: string; label: string | null }[];
};

export type BackupDocument = BackupData & {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  sourceInstanceId: string;
  integrityChecksum: string;
  recordCounts: RecordCounts;
};

export class BackupError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BackupError';
  }
}

const dataFields = ['appSettings', ...backupDataKeys];
const metadataFields = [
  'schemaVersion',
  'appVersion',
  'exportedAt',
  'sourceInstanceId',
  'integrityChecksum',
  'recordCounts',
];

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new BackupError('invalid_document');
}

function exactObject(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    value.isWellFormed() &&
    !/\p{Cc}/u.test(value)
  );
}

function validName(value: unknown, max: number): value is string {
  return validText(value, max) && !!value && value.trim() === value;
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) &&
    !Object.hasOwn(Object.prototype, value)
  );
}

function validSourceId(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

function validIsoDate(value: unknown) {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

export function recordCounts(data: BackupData): RecordCounts {
  return Object.fromEntries(
    backupDataKeys.map((key) => [key, data[key].length]),
  ) as RecordCounts;
}

function duplicateKeys<T>(rows: T[], key: (row: T) => string) {
  return new Set(rows.map(key)).size !== rows.length;
}

function validDomain(value: unknown) {
  return (
    exactObject(value, ['id', 'hostname', 'isPrimary', 'isActive']) &&
    validId(value.id) &&
    typeof value.hostname === 'string' &&
    normalizeHostname(value.hostname, { allowLoopback: true }) ===
      value.hostname &&
    typeof value.isPrimary === 'boolean' &&
    typeof value.isActive === 'boolean'
  );
}

function validUtmConfig(value: unknown) {
  if (value === null) return true;
  const config = parseUtmConfig(value);
  return (
    config !== null &&
    sameJson(value, config) &&
    Object.keys(config.rules ?? {}).every(validId)
  );
}

function validLink(value: unknown) {
  if (
    !exactObject(value, [
      'id',
      'domainId',
      'slug',
      'destinationUrl',
      'title',
      'description',
      'redirectType',
      'isActive',
      'startsAt',
      'expiresAt',
      'protectionMode',
      'consumedAt',
      'utmConfig',
    ])
  )
    return false;
  const { startsAt, expiresAt, consumedAt, protectionMode, redirectType } =
    value;
  if (
    protectionMode !== 'none' &&
    protectionMode !== 'password' &&
    protectionMode !== 'one_time' &&
    protectionMode !== 'password_one_time'
  )
    return false;
  return (
    validId(value.id) &&
    validId(value.domainId) &&
    isValidSlug(value.slug) &&
    validText(value.destinationUrl, 8192) &&
    !!parseDestinationUrl(value.destinationUrl) &&
    (value.title === null || validText(value.title, 200)) &&
    (value.description === null || validText(value.description, 8192)) &&
    (redirectType === 301 ||
      redirectType === 302 ||
      redirectType === 307 ||
      redirectType === 308) &&
    (protectionMode === 'none' ||
      redirectType === 302 ||
      redirectType === 307) &&
    typeof value.isActive === 'boolean' &&
    (startsAt === null || isEpochSecond(startsAt)) &&
    (expiresAt === null || isEpochSecond(expiresAt)) &&
    (startsAt === null || expiresAt === null || expiresAt > startsAt) &&
    (consumedAt === null ||
      (isEpochSecond(consumedAt) &&
        consumedAt >= 0 &&
        isOneTime(protectionMode))) &&
    validUtmConfig(value.utmConfig)
  );
}

function validRule(value: unknown) {
  if (
    !exactObject(value, [
      'id',
      'linkId',
      'conditions',
      'destinationUrl',
      'priority',
      'isActive',
    ]) ||
    !Array.isArray(value.conditions) ||
    value.conditions.length > 5 ||
    ![...value.conditions].every((condition: unknown) =>
      exactObject(condition, ['type', 'operator', 'value']),
    )
  )
    return false;
  const conditions = parseConditions(value.conditions);
  return (
    validId(value.id) &&
    validId(value.linkId) &&
    conditions !== null &&
    sameJson(value.conditions, conditions) &&
    validText(value.destinationUrl, 8192) &&
    !!parseDestinationUrl(value.destinationUrl) &&
    Number.isSafeInteger(value.priority) &&
    typeof value.isActive === 'boolean'
  );
}

function validUtmTemplate(value: unknown) {
  if (
    !exactObject(value, ['id', 'name', 'description', 'values']) ||
    !validId(value.id)
  )
    return false;
  const { name, description, values } = value;
  const template = parseUtmTemplateInput({ name, description, values });
  return template !== null && sameJson({ name, description, values }, template);
}

function validGoal(value: unknown) {
  return (
    exactObject(value, [
      'id',
      'linkId',
      'name',
      'eventName',
      'attributionWindowHours',
      'isActive',
    ]) &&
    validId(value.id) &&
    (value.linkId === null || validId(value.linkId)) &&
    validName(value.name, 200) &&
    validName(value.eventName, 100) &&
    typeof value.attributionWindowHours === 'number' &&
    Number.isSafeInteger(value.attributionWindowHours) &&
    value.attributionWindowHours > 0 &&
    typeof value.isActive === 'boolean'
  );
}

function validateReferences(data: BackupData) {
  const domains = new Set(data.domains.map(({ id }) => id));
  const links = new Set(data.links.map(({ id }) => id));
  const tags = new Set(data.tags.map(({ id }) => id));
  const rules = new Map(
    data.redirectRules.map(({ id, linkId }) => [id, linkId]),
  );
  requireValid(
    data.links.every(
      (link) =>
        domains.has(link.domainId) &&
        Object.keys(link.utmConfig?.rules ?? {}).every(
          (id) => rules.get(id) === link.id,
        ),
    ),
  );
  requireValid(
    data.linkTags.every(
      ({ linkId, tagId }) => links.has(linkId) && tags.has(tagId),
    ),
  );
  requireValid(data.redirectRules.every(({ linkId }) => links.has(linkId)));
  requireValid(
    data.conversionGoals.every(
      ({ linkId }) => linkId === null || links.has(linkId),
    ),
  );
  requireValid(data.qrMetadata.every(({ linkId }) => links.has(linkId)));
}

function validateUnique(data: BackupData) {
  for (const key of backupDataKeys) {
    if (key !== 'linkTags')
      requireValid(!duplicateKeys<{ id: string }>(data[key], (row) => row.id));
  }
  requireValid(!duplicateKeys(data.domains, ({ hostname }) => hostname));
  requireValid(data.domains.filter(({ isPrimary }) => isPrimary).length <= 1);
  requireValid(
    !duplicateKeys(data.links, ({ domainId, slug }) => `${domainId}/${slug}`),
  );
  requireValid(
    !duplicateKeys(data.tags, ({ name }) =>
      name.replace(/[A-Z]/g, (char) => char.toLowerCase()),
    ),
  );
  requireValid(
    !duplicateKeys(data.linkTags, ({ linkId, tagId }) => `${linkId}/${tagId}`),
  );
  requireValid(!duplicateKeys(data.utmTemplates, ({ name }) => name));
  requireValid(
    !duplicateKeys(data.conversionGoals, ({ linkId, eventName }) =>
      JSON.stringify([linkId, eventName]),
    ),
  );
}

function validateData(input: Record<string, unknown>): BackupData {
  const validators = {
    domains: validDomain,
    links: validLink,
    tags: (value: unknown) =>
      exactObject(value, ['id', 'name']) &&
      validId(value.id) &&
      validName(value.name, 50),
    linkTags: (value: unknown) =>
      exactObject(value, ['linkId', 'tagId']) &&
      validId(value.linkId) &&
      validId(value.tagId),
    redirectRules: validRule,
    utmTemplates: validUtmTemplate,
    conversionGoals: validGoal,
    qrMetadata: (value: unknown) =>
      exactObject(value, ['id', 'linkId', 'label']) &&
      validId(value.linkId) &&
      (validId(value.id) || value.id === `default:${value.linkId}`) &&
      (value.label === null || validText(value.label, 512)),
  };
  let count = 0;
  for (const key of backupDataKeys) {
    const rows = input[key];
    requireValid(Array.isArray(rows));
    count += rows.length;
  }
  if (count > backupMaxRecords) throw new BackupError('too_large');

  const settings = input.appSettings;
  requireValid(
    exactObject(settings, ['defaultTimeZone', 'defaultLocale']) &&
      isTimeZone(settings.defaultTimeZone) &&
      isLocale(settings.defaultLocale),
  );
  for (const key of backupDataKeys) {
    const rows = input[key] as unknown[];
    // Iterating explicitly rejects sparse arrays supplied by internal callers.
    for (const row of rows) requireValid(validators[key](row));
  }

  const data = input as BackupData;
  validateUnique(data);
  validateReferences(data);
  return data;
}

function checkSize(json: string) {
  if (encode.encode(json).byteLength > backupMaxBytes)
    throw new BackupError('too_large');
}

function checkedPayload(data: BackupData, sourceInstanceId: string) {
  requireValid(
    exactObject(data, dataFields) && validSourceId(sourceInstanceId),
  );
  validateData(data);
  const payload = {
    ...data,
    schemaVersion,
    appVersion: version,
    exportedAt: new Date().toISOString(),
    sourceInstanceId,
    recordCounts: recordCounts(data),
  };
  checkSize(JSON.stringify({ ...payload, integrityChecksum: '0'.repeat(64) }));
  return payload;
}

export function checkBackupData(data: BackupData, sourceInstanceId: string) {
  checkedPayload(data, sourceInstanceId);
}

export async function createBackup(
  data: BackupData,
  sourceInstanceId: string,
): Promise<BackupDocument> {
  const payload = checkedPayload(data, sourceInstanceId);
  return {
    ...payload,
    integrityChecksum: hex(await sha256(canonicalJson(payload))),
  };
}

export async function parseBackup(input: unknown): Promise<BackupDocument> {
  requireValid(isObject(input) && Number.isSafeInteger(input.schemaVersion));
  if (input.schemaVersion !== schemaVersion)
    throw new BackupError('unsupported_version');
  requireValid(exactObject(input, [...dataFields, ...metadataFields]));
  const { integrityChecksum, ...payload } = input;
  const { appVersion, exportedAt, sourceInstanceId } = payload;
  requireValid(
    validName(appVersion, 100) &&
      validIsoDate(exportedAt) &&
      validSourceId(sourceInstanceId) &&
      typeof integrityChecksum === 'string' &&
      /^[a-f0-9]{64}$/.test(integrityChecksum),
  );
  const data = validateData(input);
  requireValid(
    exactObject(input.recordCounts, backupDataKeys) &&
      sameJson(recordCounts(data), input.recordCounts),
  );
  const json = canonicalJson(payload);
  checkSize(JSON.stringify(input));
  if (integrityChecksum !== hex(await sha256(json)))
    throw new BackupError('checksum_mismatch');
  return input as BackupDocument;
}

export async function readBackup(request: Request): Promise<BackupDocument> {
  const result = await readApiJson(request, backupMaxBytes);
  if ('body' in result) return parseBackup(result.body);
  if (result.status === 413) throw new BackupError('too_large');
  if (result.status === 415) throw new BackupError('unsupported_content_type');
  throw new BackupError('invalid_json');
}
