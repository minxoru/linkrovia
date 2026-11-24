import { randomHex, uuidV7 } from '../auth/crypto';
import {
  isOneTime,
  needsPassword,
  type ProtectionMode,
} from '../links/protection';
import {
  checkBackupData,
  type BackupData,
  type BackupDocument,
} from './format';
import type { RestoreOptions } from './manifest';
import type { BackupState } from './snapshot';

const by = <T>(rows: readonly T[], key: (row: T) => string) =>
  new Map(rows.map((row) => [key(row), row]));
const linkKey = (row: { domainId: string; slug: string }) =>
  `${row.domainId}/${row.slug}`;
const goalKey = (row: { linkId: string | null; eventName: string }) =>
  `${row.linkId ?? ''}/${row.eventName}`;
const tagKey = (row: { name: string }) =>
  row.name.replace(/[A-Z]/g, (c) => c.toLowerCase());
const linkTagKey = (row: BackupData['linkTags'][number]) =>
  `${row.linkId}/${row.tagId}`;
const byId = <T extends { id: string }>(rows: readonly T[]) =>
  by(rows, (row) => row.id);

function group<T extends { linkId: string }>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const items = groups.get(row.linkId);
    if (items) items.push(row);
    else groups.set(row.linkId, [row]);
  }
  return groups;
}

function combinedProtection(
  incoming: ProtectionMode,
  current: ProtectionMode,
): ProtectionMode {
  const password = needsPassword(incoming) || needsPassword(current);
  const oneTime = isOneTime(incoming) || isOneTime(current);
  if (password) return oneTime ? 'password_one_time' : 'password';
  return oneTime ? 'one_time' : 'none';
}

type RestorePreview = {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
  locked: number;
  qrRegenerated: number;
  domainsToConnect: number;
};
export type RestoreResult = {
  status: 'completed';
  preview: RestorePreview;
  linkIds: Record<string, string>;
  qrIds: Record<string, string>;
};

export function planRestore(
  db: D1Database,
  actor: string,
  state: BackupState,
  backup: BackupDocument,
  options: RestoreOptions,
) {
  const replace = options.mode === 'replace';
  const overwrite = options.conflict === 'overwrite';
  const sameInstance = backup.sourceInstanceId === state.instanceId;
  const preview: RestorePreview = {
    added: 0,
    updated: 0,
    skipped: 0,
    removed: 0,
    locked: 0,
    qrRegenerated: 0,
    domainsToConnect: 0,
  };
  const linkIds: Record<string, string> = Object.create(null);
  const qrIds: Record<string, string> = Object.create(null);
  const statements: D1PreparedStatement[] = [];
  const pending = {
    domains: byId(state.data.domains),
    tags: byId(state.data.tags),
    links: byId(state.data.links),
    linkTags: by(state.data.linkTags, linkTagKey),
    redirectRules: byId(state.data.redirectRules),
    qrMetadata: byId(state.data.qrMetadata),
    utmTemplates: byId(state.data.utmTemplates),
    conversionGoals: byId(state.data.conversionGoals),
  };
  const write = (sql: string, ...values: (string | number | null)[]) => {
    statements.push(db.prepare(sql).bind(...values));
  };

  function removeAbsent<T extends { id: string }>(
    rows: readonly T[],
    projected: Map<string, T>,
    retained: ReadonlySet<string>,
    sql: string,
  ) {
    const ids = rows.filter((row) => !retained.has(row.id)).map(({ id }) => id);
    if (ids.length) write(sql, JSON.stringify(ids));
    for (const id of ids) projected.delete(id);
    preview.removed += ids.length;
    return ids;
  }

  const currentDomains = by(state.domains, (domain) => domain.hostname);
  const domainIds = new Map<string, string>();
  for (const domain of backup.domains) {
    const existing = currentDomains.get(domain.hostname);
    const id = existing?.id ?? uuidV7();
    const desiredActive =
      !!existing &&
      (existing.isPrimary || (!overwrite && !existing.archived)
        ? existing.isActive
        : existing.isConnected && domain.isActive);
    domainIds.set(domain.id, id);
    if (!existing) {
      preview.added++;
      write(
        'INSERT INTO domains (id, hostname, is_active) VALUES (?, ?, 0)',
        id,
        domain.hostname,
      );
    } else if (existing.archived || existing.isActive !== desiredActive) {
      if (existing.archived) preview.added++;
      else preview.updated++;
      write(
        `UPDATE domains SET is_active = ?1, backup_archived_at = NULL, updated_at = unixepoch(),
          management_enabled = CASE WHEN ?1 = 0 THEN 0 ELSE management_enabled END WHERE id = ?2`,
        Number(desiredActive),
        id,
      );
    } else {
      preview.skipped++;
    }
    pending.domains.set(id, {
      id,
      hostname: domain.hostname,
      isPrimary: existing?.isPrimary ?? false,
      isActive: desiredActive,
    });
    if (!existing?.isConnected) preview.domainsToConnect++;
  }

  const oldTags = by(state.data.tags, tagKey);
  const tagIds = new Map<string, string>();
  for (const tag of backup.tags) {
    const existing = oldTags.get(tagKey(tag));
    const id = existing?.id ?? uuidV7();
    tagIds.set(tag.id, id);
    if (existing) preview.skipped++;
    else {
      preview.added++;
      write('INSERT INTO tags (id, name) VALUES (?, ?)', id, tag.name);
      pending.tags.set(id, { ...tag, id });
    }
  }

  const oldLinks = by(state.data.links, linkKey);
  const tombstones = by(state.tombstones, linkKey);
  const security = byId(state.linkSecurity);
  const requestedKeys = new Set(
    backup.links.map((link) =>
      linkKey({ domainId: domainIds.get(link.domainId)!, slug: link.slug }),
    ),
  );
  const oldRules = group(state.data.redirectRules);
  const oldTagsByLink = group(state.data.linkTags);
  const oldQr = group(state.data.qrMetadata);
  const rules = group(backup.redirectRules);
  const tags = group(backup.linkTags);
  const codes = group(backup.qrMetadata);
  const availableLinkIds = new Set<string>();
  const retainedLinks = new Set<string>();

  for (const link of backup.links) {
    const domainId = domainIds.get(link.domainId)!;
    const key = linkKey({ domainId, slug: link.slug });
    const source = sameInstance ? security.get(link.id) : undefined;
    const naturalMatch = oldLinks.get(key) ?? tombstones.get(key);
    // A renamed link can move back to its old address without creating a second identity.
    const match =
      naturalMatch ??
      (source && !requestedKeys.has(linkKey(source)) ? source : undefined);
    const id = match?.id ?? uuidV7();
    const live = pending.links.get(id);
    linkIds[link.id] = id;
    retainedLinks.add(id);
    const incomingQr = codes.get(link.id) ?? [];
    const previousQr = by(oldQr.get(id) ?? [], (qr) => qr.id);
    const defaultQrId = `default:${id}`;
    const knownQrId = (qr: BackupData['qrMetadata'][number]) =>
      qr.id === `default:${link.id}`
        ? defaultQrId
        : sameInstance && link.id === id
          ? qr.id
          : '';

    if (match && !overwrite) {
      if (live) availableLinkIds.add(link.id);
      for (const qr of incomingQr) {
        const known = knownQrId(qr);
        if (previousQr.has(known)) qrIds[qr.id] = known;
      }
      preview.skipped +=
        1 +
        (rules.get(link.id)?.length ?? 0) +
        (tags.get(link.id)?.length ?? 0) +
        incomingQr.length;
      continue;
    }

    availableLinkIds.add(link.id);
    if (live) preview.updated++;
    else preview.added++;
    const previousMode = match?.protectionMode ?? 'none';
    const sourceMode = combinedProtection(
      link.protectionMode,
      source?.protectionMode ?? 'none',
    );
    const mode = combinedProtection(sourceMode, previousMode);
    // A password is usable only when it belongs to this very link on this instance.
    const retainPassword =
      sameInstance && link.id === id && !!security.get(id)?.hasPassword;
    const locked = needsPassword(mode) && !retainPassword;
    const consumedAt = isOneTime(mode)
      ? (match?.consumedAt ?? source?.consumedAt ?? link.consumedAt)
      : null;
    const duplicateRedemption =
      !!source && source.id !== id && isOneTime(sourceMode);
    if (locked || duplicateRedemption) preview.locked++;
    const type =
      mode === 'none'
        ? link.redirectType
        : link.redirectType === 308
          ? 307
          : link.redirectType === 301
            ? 302
            : link.redirectType;
    const gate = mode === 'none' ? null : randomHex(32);
    const incomingRules = (rules.get(link.id) ?? []).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    // Redirect ties are evaluated by rule ID, so retain the source ordering after remapping.
    const rulePrefix = incomingRules.length ? `r-${randomHex(12)}-` : '';
    const ruleIds = new Map(
      incomingRules.map((rule, i) => [
        rule.id,
        `${rulePrefix}${String(i).padStart(3, '0')}`,
      ]),
    );
    const utm =
      link.utmConfig === null
        ? null
        : {
            ...link.utmConfig,
            ...(link.utmConfig.rules && {
              rules: Object.fromEntries(
                Object.entries(link.utmConfig.rules).map(([ruleId, values]) => [
                  ruleIds.get(ruleId)!,
                  values,
                ]),
              ),
            }),
          };

    const isActive = link.isActive && !locked && !duplicateRedemption;
    pending.links.set(id, {
      ...link,
      id,
      domainId,
      redirectType: type,
      isActive,
      protectionMode: mode,
      consumedAt,
      utmConfig: utm,
    });

    const fields = [
      link.destinationUrl,
      link.title,
      link.description,
      type,
      Number(isActive),
      link.startsAt,
      link.expiresAt,
      utm === null ? null : JSON.stringify(utm),
      mode,
      consumedAt,
      gate,
    ] as const;
    if (match) {
      write(
        `UPDATE links SET domain_id = ?, slug = ?, destination_url = ?, title = ?, description = ?, redirect_type = ?,
        is_active = ?, starts_at = ?, expires_at = ?, utm_config_json = ?, protection_mode = ?, conversion_tracking = 0,
        consumed_at = ?, gate_token = ?, protection_password_hash = CASE
          WHEN ? THEN protection_password_hash WHEN ? THEN '!backup-locked' END,
        deleted_at = NULL, updated_at = MAX(unixepoch(), updated_at + 1) WHERE id = ?`,
        domainId,
        link.slug,
        ...fields,
        Number(retainPassword),
        Number(locked),
        id,
      );
      write('DELETE FROM redirect_rules WHERE link_id = ?', id);
      write('DELETE FROM link_tags WHERE link_id = ?', id);
      write('DELETE FROM link_unlocks WHERE link_id = ?', id);
      write('DELETE FROM link_health WHERE link_id = ?', id);
      for (const rule of oldRules.get(id) ?? [])
        pending.redirectRules.delete(rule.id);
      for (const tag of oldTagsByLink.get(id) ?? [])
        pending.linkTags.delete(linkTagKey(tag));
      preview.removed +=
        (oldRules.get(id)?.length ?? 0) + (oldTagsByLink.get(id)?.length ?? 0);
    } else {
      write(
        `INSERT INTO links (id, domain_id, slug, destination_url, title, description, redirect_type,
        is_active, starts_at, expires_at, utm_config_json, protection_mode, consumed_at, gate_token,
        protection_password_hash, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        domainId,
        link.slug,
        ...fields,
        locked ? '!backup-locked' : null,
        actor,
      );
    }
    for (const rule of incomingRules) {
      const [first] = rule.conditions;
      const ruleId = ruleIds.get(rule.id)!;
      pending.redirectRules.set(ruleId, { ...rule, id: ruleId, linkId: id });
      write(
        `INSERT INTO redirect_rules (id, link_id, rule_type, operator, rule_value,
        conditions_json, destination_url, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ruleId,
        id,
        first.type,
        first.operator,
        first.value,
        JSON.stringify(rule.conditions),
        rule.destinationUrl,
        rule.priority,
        Number(rule.isActive),
      );
      preview.added++;
    }
    for (const tag of tags.get(link.id) ?? []) {
      const row = { linkId: id, tagId: tagIds.get(tag.tagId)! };
      pending.linkTags.set(linkTagKey(row), row);
      write(
        'INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)',
        id,
        row.tagId,
      );
      preview.added++;
    }
    const retainedQr = new Set<string>();
    for (const qr of incomingQr) {
      const known = knownQrId(qr);
      const previous = previousQr.get(known);
      const qrId =
        known === defaultQrId ? defaultQrId : (previous?.id ?? uuidV7());
      qrIds[qr.id] = qrId;
      retainedQr.add(qrId);
      pending.qrMetadata.set(qrId, { ...qr, id: qrId, linkId: id });
      if (previous) {
        write('UPDATE qr_codes SET label = ? WHERE id = ?', qr.label, qrId);
        preview.updated++;
      } else {
        // A revived link may still have an old default QR row outside the snapshot.
        write(
          `INSERT INTO qr_codes (id, link_id, token, label) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET token = excluded.token, label = excluded.label`,
          qrId,
          id,
          randomHex(32),
          qr.label,
        );
        preview.added++;
        preview.qrRegenerated++;
      }
    }
    if (replace) {
      removeAbsent(
        oldQr.get(id) ?? [],
        pending.qrMetadata,
        retainedQr,
        'DELETE FROM qr_codes WHERE id IN (SELECT value FROM json_each(?))',
      );
      if (match && !live)
        write(
          'DELETE FROM qr_codes WHERE link_id = ? AND id NOT IN (SELECT value FROM json_each(?))',
          id,
          JSON.stringify([...retainedQr]),
        );
    }
  }

  const templates = by(state.data.utmTemplates, (template) => template.name);
  const retainedTemplates = new Set<string>();
  for (const template of backup.utmTemplates) {
    const existing = templates.get(template.name);
    const id = existing?.id ?? uuidV7();
    retainedTemplates.add(id);
    const values = JSON.stringify({
      values: template.values,
      description: template.description,
    });
    if (!existing) {
      write(
        'INSERT INTO utm_templates (id, name, values_json, created_by) VALUES (?, ?, ?, ?)',
        id,
        template.name,
        values,
        actor,
      );
      preview.added++;
    } else if (overwrite) {
      write(
        'UPDATE utm_templates SET values_json = ?, updated_at = MAX(unixepoch(), updated_at + 1) WHERE id = ?',
        values,
        id,
      );
      preview.updated++;
    } else preview.skipped++;
    if (!existing || overwrite)
      pending.utmTemplates.set(id, { ...template, id });
  }

  const goals = by(state.data.conversionGoals, goalKey);
  const archivedGoals = by(state.archivedGoals, goalKey);
  const retainedGoals = new Set<string>();
  for (const goal of backup.conversionGoals) {
    if (goal.linkId !== null && !availableLinkIds.has(goal.linkId)) {
      preview.skipped++;
      continue;
    }
    const linkId = goal.linkId === null ? null : linkIds[goal.linkId];
    const key = goalKey({ ...goal, linkId });
    const existing = goals.get(key);
    const archived = archivedGoals.get(key);
    const id = existing?.id ?? archived?.id ?? uuidV7();
    retainedGoals.add(id);
    if (!existing && !archived) {
      write(
        `INSERT INTO conversion_goals (id, link_id, name, event_name, attribution_window_hours, is_active)
        VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        linkId,
        goal.name,
        goal.eventName,
        goal.attributionWindowHours,
        Number(goal.isActive),
      );
      preview.added++;
    } else if (overwrite || !existing) {
      write(
        'UPDATE conversion_goals SET name = ?, attribution_window_hours = ?, is_active = ?, backup_archived_at = NULL WHERE id = ?',
        goal.name,
        goal.attributionWindowHours,
        Number(goal.isActive),
        id,
      );
      if (existing) preview.updated++;
      else preview.added++;
    } else preview.skipped++;
    if (!existing || overwrite)
      pending.conversionGoals.set(id, { ...goal, id, linkId });
  }

  if (replace) {
    removeAbsent(
      state.data.domains.filter((domain) => !domain.isPrimary),
      pending.domains,
      new Set(domainIds.values()),
      'UPDATE domains SET is_active = 0, management_enabled = 0, backup_archived_at = unixepoch(), updated_at = unixepoch() WHERE id IN (SELECT value FROM json_each(?))',
    );
    const removedLinks = removeAbsent(
      state.data.links,
      pending.links,
      retainedLinks,
      'UPDATE links SET is_active = 0, conversion_tracking = 0, deleted_at = unixepoch(), updated_at = MAX(unixepoch(), updated_at + 1) WHERE id IN (SELECT value FROM json_each(?))',
    );
    if (removedLinks.length) {
      const removed = new Set(removedLinks);
      for (const [table, rows] of [
        ['redirect_rules', state.data.redirectRules],
        ['link_tags', state.data.linkTags],
        ['qr_codes', state.data.qrMetadata],
      ] as const) {
        write(
          `DELETE FROM ${table} WHERE link_id IN (SELECT value FROM json_each(?))`,
          JSON.stringify(removedLinks),
        );
        preview.removed += rows.filter((row) => removed.has(row.linkId)).length;
      }
      for (const id of removedLinks) {
        for (const rule of oldRules.get(id) ?? [])
          pending.redirectRules.delete(rule.id);
        for (const tag of oldTagsByLink.get(id) ?? [])
          pending.linkTags.delete(linkTagKey(tag));
        for (const qr of oldQr.get(id) ?? []) pending.qrMetadata.delete(qr.id);
      }
      write(
        'DELETE FROM link_unlocks WHERE link_id IN (SELECT value FROM json_each(?))',
        JSON.stringify(removedLinks),
      );
      write(
        'DELETE FROM link_health WHERE link_id IN (SELECT value FROM json_each(?))',
        JSON.stringify(removedLinks),
      );
    }
    removeAbsent(
      state.data.tags,
      pending.tags,
      new Set(tagIds.values()),
      'DELETE FROM tags WHERE id IN (SELECT value FROM json_each(?))',
    );
    removeAbsent(
      state.data.utmTemplates,
      pending.utmTemplates,
      retainedTemplates,
      'DELETE FROM utm_templates WHERE id IN (SELECT value FROM json_each(?))',
    );
    removeAbsent(
      state.data.conversionGoals,
      pending.conversionGoals,
      retainedGoals,
      'UPDATE conversion_goals SET is_active = 0, backup_archived_at = unixepoch() WHERE id IN (SELECT value FROM json_each(?))',
    );
    write(
      `INSERT INTO app_settings (key, json_value) VALUES ('default_timezone', ?), ('default_locale', ?)
      ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value, updated_at = unixepoch()`,
      JSON.stringify(backup.appSettings.defaultTimeZone),
      JSON.stringify(backup.appSettings.defaultLocale),
    );
  }

  checkBackupData(
    {
      appSettings: replace ? backup.appSettings : state.data.appSettings,
      domains: [...pending.domains.values()],
      tags: [...pending.tags.values()],
      links: [...pending.links.values()],
      linkTags: [...pending.linkTags.values()],
      redirectRules: [...pending.redirectRules.values()],
      qrMetadata: [...pending.qrMetadata.values()],
      utmTemplates: [...pending.utmTemplates.values()],
      conversionGoals: [...pending.conversionGoals.values()],
    },
    state.instanceId,
  );
  return {
    statements,
    result: {
      status: 'completed',
      preview,
      linkIds,
      qrIds,
    } satisfies RestoreResult,
  };
}
