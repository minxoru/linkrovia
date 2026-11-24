import { error, fail } from '@sveltejs/kit';
import { parseRule } from '$lib/server/links/api-input';
import { requireForm, requireSession } from '$lib/server/links/form';
import {
  getLink,
  listLinkRules,
  updateLinkRules,
} from '$lib/server/links/store';
import { parseConditions } from '$lib/server/targeting';
import { deviceTypes, operatingSystems } from '$lib/server/targeting/visitor';
import type { Actions, PageServerLoad } from './$types';

const maxRules = 20;
const maxConditions = 5;
// Each rule can have an 8,192-character URL and five conditions. The form
// transport can percent-encode each UTF-8 byte and escape JSON punctuation.
const maxFormBytes = 1_600_000;

export const load = (async (event) => {
  const { db } = requireSession(event);
  const link = await getLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  const rules = await listLinkRules(db, link.id);
  return {
    locale: event.locals.locale,
    linkId: link.id,
    updatedAt: link.updatedAt,
    destinationUrl: link.destinationUrl,
    limits: { maxRules, maxConditions },
    options: { os: operatingSystems, device: deviceTypes },
    rules: rules.map((rule) => ({
      id: rule.id,
      priority: rule.priority,
      destinationUrl: rule.destinationUrl,
      active: rule.isActive === 1,
      conditions:
        parseConditions(
          rule.conditionsJson ?? [
            {
              type: rule.ruleType,
              operator: rule.operator,
              value: rule.ruleValue,
            },
          ],
        ) ?? [],
    })),
  };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { db, session, form } = await requireForm(event, maxFormBytes);
    const stamp = form.get('updatedAt');
    if (!stamp || !/^\d{1,12}$/.test(stamp))
      return fail(400, { code: 'invalid_input' as const });
    let draft: unknown;
    try {
      draft = JSON.parse(form.get('rules') ?? '');
    } catch {
      return fail(400, { code: 'invalid_input' as const });
    }
    if (!Array.isArray(draft) || draft.length > maxRules)
      return fail(400, { code: 'invalid_input' as const });

    const rules = [];
    for (const [index, candidate] of draft.entries()) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      )
        return fail(400, { code: 'invalid_rule' as const, index });

      const { id, ...fields } = candidate;
      const rule = parseRule(fields);
      if (
        (id !== null &&
          (typeof id !== 'string' ||
            !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id))) ||
        !rule
      )
        return fail(400, { code: 'invalid_rule' as const, index });
      rules.push({ ...rule, id: id as string | null });
    }

    const result = await updateLinkRules(
      db,
      session.user.id,
      event.params.id,
      Number(stamp),
      rules,
    );
    if (!result.ok)
      return fail(result.code === 'stale_link' ? 409 : 400, {
        code: result.code,
      });
    return { saved: true };
  },
} satisfies Actions;
