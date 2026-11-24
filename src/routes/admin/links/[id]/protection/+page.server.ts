import { error, fail } from '@sveltejs/kit';
import { requireForm, requireSession } from '$lib/server/links/form';
import { setLinkProtection } from '$lib/server/links/protection';
import { getLink } from '$lib/server/links/store';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db } = requireSession(event);
  const link = await getLink(db, event.params.id);
  if (!link) error(404, 'Not found');
  return { link, locale: event.locals.locale };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const { db, session, form } = await requireForm(event);
    const stamp = form.get('updatedAt');
    if (!stamp || !/^\d{1,12}$/.test(stamp))
      return fail(400, { code: 'invalid_input' });
    const password = form.get('password') ?? '';
    if (
      password &&
      !(await allowAuthAttempt(event, `link-protection:${session.user.id}`))
    )
      return fail(429, { code: 'rate_limit' });
    const result = await setLinkProtection(
      db,
      session.user.id,
      event.params.id,
      Number(stamp),
      form.get('mode'),
      password,
    );
    return result.ok
      ? { saved: true }
      : fail(result.code === 'stale_link' ? 409 : 400, { code: result.code });
  },
} satisfies Actions;
