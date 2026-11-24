import { dev } from '$app/env';
import { passkeyRp } from '$lib/server/auth/passkeys';
import type { PageServerLoad } from './$types';

export const load = (({ locals, url }) => ({
  locale: locals.locale,
  signedIn: locals.session !== null,
  available: !!locals.env.DB && passkeyRp(url, { development: dev }) !== null,
})) satisfies PageServerLoad;
