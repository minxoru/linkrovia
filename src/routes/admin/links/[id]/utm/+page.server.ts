import { error, fail } from '@sveltejs/kit';
import { uuidV7 } from '$lib/server/auth/crypto';
import { requireForm, requireSession } from '$lib/server/links/form';
import { getLink, listLinkRules } from '$lib/server/links/store';
import {
  parseUtmConfig,
  parseUtmValues,
  previewUtm,
  utmKeys,
  type UtmConfig,
} from '$lib/server/utm';
import { getUtmTemplate, listUtmTemplates } from '$lib/server/utm/templates';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function storedConfig(json: string | null): UtmConfig {
  try {
    return json ? (parseUtmConfig(JSON.parse(json)) ?? {}) : {};
  } catch {
    return {};
  }
}

async function input(event: RequestEvent) {
  const { db, session, form } = await requireForm(event, 32 * 1024);
  const link = await getLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  const rules = await listLinkRules(db, link.id);
  const target = form.get('target') ?? '';
  const rule = rules.find((item) => item.id === target);
  if (target !== 'default' && !rule) return { issue: 'invalid' as const };
  const stamp = form.get('updatedAt') ?? '';
  const values = Object.fromEntries(
    utmKeys.map((key) => [key, form.get(key) ?? '']),
  );
  const draft = {
    target,
    values,
    templateId: form.get('templateId') ?? '',
    updatedAt: stamp,
  };
  if (!/^\d{1,12}$/.test(stamp)) return { issue: 'invalid' as const, draft };
  const overrides = parseUtmValues(values);
  if (!overrides) return { issue: 'invalid' as const, draft };
  const template = draft.templateId
    ? await getUtmTemplate(db, draft.templateId)
    : null;
  if (draft.templateId && !template)
    return { issue: 'missingTemplate' as const, draft };
  return {
    db,
    session,
    link,
    target,
    stamp: Number(stamp),
    draft,
    values: { ...template?.values, ...overrides },
    destination: rule?.destinationUrl ?? link.destinationUrl,
  };
}

export const load = (async (event) => {
  const { db } = requireSession(event);
  const link = await getLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  event.setHeaders({ 'cache-control': 'private, no-store' });
  return {
    link,
    rules: await listLinkRules(db, link.id),
    templates: await listUtmTemplates(db),
    config: storedConfig(link.utmConfigJson),
    utmKeys,
  };
}) satisfies PageServerLoad;

export const actions = {
  preview: async (event) => {
    const result = await input(event);
    if ('issue' in result) return fail(400, result);
    const preview = previewUtm(result.destination, result.values);
    if (!preview)
      return fail(400, { issue: 'invalid' as const, draft: result.draft });
    return { preview, draft: result.draft };
  },
  save: async (event) => {
    const result = await input(event);
    if ('issue' in result) return fail(400, result);
    const config = storedConfig(result.link.utmConfigJson);
    if (result.target === 'default') {
      if (Object.keys(result.values).length) config.default = result.values;
      else delete config.default;
    } else {
      const rules = { ...config.rules };
      if (Object.keys(result.values).length)
        rules[result.target] = result.values;
      else delete rules[result.target];
      if (Object.keys(rules).length) config.rules = rules;
      else delete config.rules;
    }
    const json = Object.keys(config).length ? JSON.stringify(config) : null;
    const [updated] = await result.db.batch([
      result.db
        .prepare(
          'UPDATE links SET utm_config_json = ?, updated_at = MAX(unixepoch(), updated_at + 1) WHERE id = ? AND updated_at = ? AND deleted_at IS NULL',
        )
        .bind(json, result.link.id, result.stamp),
      result.db
        .prepare(
          "INSERT INTO audit_events (id, user_id, action, entity_type, entity_id) SELECT ?, ?, 'link.updated', 'link', ? WHERE changes() = 1",
        )
        .bind(uuidV7(), result.session.user.id, result.link.id),
    ]);
    if (!updated.meta.changes)
      return fail(409, { issue: 'conflict' as const, draft: result.draft });
    return { saved: true, target: result.target };
  },
} satisfies Actions;
