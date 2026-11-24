import { checkCsrfToken } from '$lib/server/auth/session';
import { requireSession } from '$lib/server/links/form';
import { readSmallForm, requireSameOrigin } from '$lib/server/security/request';
import { parseUtmValues, previewUtm, utmKeys } from '$lib/server/utm';
import {
  createUtmTemplate,
  deleteUtmTemplate,
  getUtmTemplate,
  listUtmTemplates,
  updateUtmTemplate,
} from '$lib/server/utm/templates';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function requireUtmForm(event: RequestEvent, maxBytes = 32 * 1024) {
  const { db, session } = requireSession(event);
  if (!requireSameOrigin(event.request, event.url)) error(403, 'Forbidden');
  const form = await readSmallForm(event.request, maxBytes);
  if (!form) error(400, 'Invalid form');
  if (!checkCsrfToken(form.get('csrfToken'), session.csrfToken))
    error(403, 'Forbidden');
  return { db, session, form };
}

function valuesFrom(form: URLSearchParams) {
  return Object.fromEntries(utmKeys.map((key) => [key, form.get(key) ?? '']));
}

function templateVersion(form: URLSearchParams) {
  const raw = form.get('updatedAt') ?? '';
  return /^\d{1,13}$/.test(raw) ? Number(raw) : null;
}

const status = {
  invalid_template: 400,
  name_conflict: 409,
  stale_template: 409,
  not_found: 404,
} as const;

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  const templates = await listUtmTemplates(db);
  const id = event.url.searchParams.get('edit');
  return {
    locale: event.locals.locale,
    csrfToken: session.csrfToken,
    utmKeys,
    templates,
    editing: templates.find((template) => template.id === id) ?? null,
  };
}) satisfies PageServerLoad;

export const actions = {
  save: async (event) => {
    const { db, session, form } = await requireUtmForm(event);
    const id = form.get('id');
    const draft = {
      name: form.get('name') ?? '',
      description: form.get('description') ?? '',
      values: valuesFrom(form),
    };
    const expected = templateVersion(form);
    if (id && expected === null)
      return fail(400, { issue: 'invalid_template' as const, draft });
    const result =
      id && expected !== null
        ? await updateUtmTemplate(db, id, expected, draft)
        : await createUtmTemplate(db, session.user.id, draft);

    if ('code' in result)
      return fail(status[result.code], { issue: result.code, draft });
    return { saved: true as const };
  },

  remove: async (event) => {
    const { db, form } = await requireUtmForm(event);
    const id = form.get('id');
    const expected = templateVersion(form);
    if (!id || expected === null)
      return fail(400, { issue: 'invalid_template' as const });
    const template = await getUtmTemplate(db, id);
    if (!template) return fail(404, { issue: 'not_found' as const });
    if (
      template.updatedAt !== expected ||
      !(await deleteUtmTemplate(db, id, expected))
    )
      return fail(409, { issue: 'stale_template' as const });
    return { deleted: true as const };
  },

  preview: async (event) => {
    const { db, form } = await requireUtmForm(event, 128 * 1024);
    const previewInput = {
      destinationUrl: form.get('destinationUrl')?.trim() ?? '',
      templateId: form.get('templateId') ?? '',
      values: valuesFrom(form),
    };
    const overrides = parseUtmValues(previewInput.values);
    if (!overrides)
      return fail(400, { issue: 'invalid_preview' as const, previewInput });

    const template = previewInput.templateId
      ? await getUtmTemplate(db, previewInput.templateId)
      : null;
    if (previewInput.templateId && !template)
      return fail(404, { issue: 'not_found' as const, previewInput });

    const preview = previewUtm(previewInput.destinationUrl, {
      ...template?.values,
      ...overrides,
    });
    if (!preview)
      return fail(400, { issue: 'invalid_preview' as const, previewInput });
    return { preview, previewInput };
  },
} satisfies Actions;
