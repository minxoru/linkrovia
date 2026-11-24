import type { RequestEvent } from '@sveltejs/kit';
import { checkCsrfToken, type Session } from '$lib/server/auth/session';
import { readApiJson } from '$lib/server/links/api-input';
import { requireSameOrigin } from '$lib/server/security/request';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import { problem } from '../http';

export async function withDomainOwner(
  event: RequestEvent,
  handler: (
    db: D1Database,
    session: Session,
    body: unknown,
  ) => Promise<Response>,
) {
  const session = event.locals.session;
  if (!session)
    return problem(401, 'unauthorized', 'Sign in to an owner account.');
  if (session.user.role !== 'owner')
    return problem(403, 'forbidden', 'This action requires the owner.');
  const db = event.locals.env?.DB;
  if (!db)
    return problem(
      503,
      'service_unavailable',
      'Domain settings are temporarily unavailable.',
    );
  let body: unknown;
  try {
    if (event.request.method === 'POST') {
      if (
        !requireSameOrigin(event.request, event.url) ||
        !checkCsrfToken(
          event.request.headers.get('x-csrf-token'),
          session.csrfToken,
        )
      )
        return problem(403, 'forbidden', 'The request could not be verified.');
      if (
        !(await allowAuthAttempt(
          event,
          `domains:${session.user.id}:${event.route.id}`,
          { byAddress: false },
        ))
      )
        return problem(
          429,
          'rate_limited',
          'Wait a minute and try again.',
          {},
          { 'retry-after': '60' },
        );
      const input = await readApiJson(event.request, 4096);
      if (!('body' in input))
        return problem(
          input.status,
          'invalid_input',
          'Send the request as JSON within 4 KiB.',
        );
      body = input.body;
    }
    return await handler(db, session, body);
  } catch {
    return problem(
      503,
      'service_unavailable',
      'Domain settings are temporarily unavailable.',
    );
  }
}

export const domainMissing = () =>
  problem(
    404,
    'domain_not_found',
    'The domain is unavailable for this operation.',
  );
export const domainChanged = () =>
  problem(
    409,
    'domain_changed',
    'The domain changed. Reload the page and try again.',
  );
