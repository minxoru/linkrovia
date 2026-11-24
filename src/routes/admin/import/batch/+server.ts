import { json } from '@sveltejs/kit';
import { checkCsrfToken } from '$lib/server/auth/session';
import { CsvInputError } from '$lib/csv';
import { runCsvRequest } from '$lib/server/links/csv-request';
import { effectiveTimeZone } from '$lib/server/links/form';
import { requireSameOrigin } from '$lib/server/security/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const { session, env } = event.locals;
  const { request, url } = event;
  if (!session) return json({ code: 'sign_in' }, { status: 401 });
  if (!env.DB) return json({ code: 'request_failed' }, { status: 503 });
  if (
    !requireSameOrigin(request, url) ||
    !checkCsrfToken(request.headers.get('x-csrf-token'), session.csrfToken)
  ) {
    return json({ code: 'request_failed' }, { status: 403 });
  }

  try {
    const mode = request.headers.get('x-import-mode');
    if (mode !== 'preview' && mode !== 'commit')
      throw new CsvInputError('invalid_options');
    return json(
      await runCsvRequest(
        request,
        env.DB,
        session.user.id,
        mode,
        await effectiveTimeZone(env.DB, session.user.timezone),
      ),
    );
  } catch (cause) {
    return cause instanceof CsvInputError
      ? json({ code: cause.code }, { status: 400 })
      : json({ code: 'request_failed' }, { status: 503 });
  }
};
