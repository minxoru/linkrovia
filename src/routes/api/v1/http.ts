import { authorizeApiKey, type ApiKeyScope } from '$lib/server/auth/api-keys';
import { readApiJson, type FieldErrors } from '$lib/server/links/api-input';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import type { RequestEvent } from '@sveltejs/kit';

const titles = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};
type ProblemStatus = keyof typeof titles;

export function problem(
  status: ProblemStatus,
  code: string,
  detail: string,
  fieldErrors: FieldErrors = {},
  headers?: HeadersInit,
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/problem+json');
  responseHeaders.set('cache-control', 'no-store');
  return Response.json(
    {
      type: 'about:blank',
      title: titles[status],
      status,
      detail,
      code,
      requestId: crypto.randomUUID(),
      fieldErrors,
    },
    { status, headers: responseHeaders },
  );
}

export function payload(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(data, { ...init, headers });
}

export function invalidFields(fieldErrors: FieldErrors) {
  return problem(
    400,
    'invalid_input',
    'Check the request fields.',
    fieldErrors,
  );
}

export function missingLink() {
  return problem(404, 'link_not_found', 'The link could not be found.');
}

export function staleLink() {
  return problem(
    409,
    'stale_link',
    'The link changed. Get its latest updatedAt value and retry.',
  );
}

export function linkConflict(
  code:
    'slug_conflict' | 'missing_domain' | 'stale_link' | 'temporary_redirect',
) {
  if (code === 'stale_link') return staleLink();
  if (code === 'temporary_redirect')
    return invalidFields({
      redirectType: ['Protected links require 302 or 307.'],
    });
  if (code === 'missing_domain')
    return invalidFields({ domainId: ['Select an existing active domain.'] });
  return problem(
    409,
    'slug_conflict',
    'The requested slug is already in use on the selected domain.',
  );
}

export function bodyProblem(status: 400 | 413 | 415) {
  if (status === 413)
    return problem(
      status,
      'body_too_large',
      'The JSON body must be at most 256 KiB.',
    );
  if (status === 415)
    return problem(
      status,
      'unsupported_content_type',
      'Send the body as application/json.',
    );
  return problem(
    status,
    'invalid_json',
    'The body must contain valid UTF-8 JSON.',
  );
}

export async function withJson(
  event: RequestEvent,
  handler: (body: unknown) => Response | Promise<Response>,
) {
  const result = await readApiJson(event.request);
  return 'body' in result ? handler(result.body) : bodyProblem(result.status);
}

type ApiPrincipal = NonNullable<Awaited<ReturnType<typeof authorizeApiKey>>>;

export async function withScope(
  event: RequestEvent,
  scope: ApiKeyScope,
  handler: (
    db: D1Database,
    principal: ApiPrincipal,
  ) => Response | Promise<Response>,
  { recordUse = true, limitByKey = false } = {},
) {
  const db = event.locals.env?.DB;
  if (!db)
    return problem(
      503,
      'service_unavailable',
      'The API is temporarily unavailable.',
    );

  try {
    const principal = await authorizeApiKey(
      db,
      event.request.headers.get('authorization'),
      undefined,
      { recordUse },
    );
    if (!principal) {
      return problem(
        401,
        'invalid_credentials',
        'Provide a valid Bearer API key.',
        {},
        {
          'www-authenticate': 'Bearer',
        },
      );
    }
    if (!principal.scopes.includes(scope)) {
      return problem(
        403,
        'insufficient_scope',
        'The API key does not have the required scope.',
        {},
        {
          'www-authenticate': `Bearer error="insufficient_scope", scope="${scope}"`,
        },
      );
    }

    const limiterKey = `api:${principal.id}:${event.request.method}:${event.route.id}`;
    if (
      !(await allowAuthAttempt(event, limiterKey, { byAddress: !limitByKey }))
    ) {
      return problem(
        429,
        'rate_limited',
        'Too many requests. Try again in one minute.',
        {},
        {
          'retry-after': '60',
        },
      );
    }
    return await handler(db, principal);
  } catch {
    return problem(
      500,
      'internal_error',
      'The API could not complete the request.',
    );
  }
}
