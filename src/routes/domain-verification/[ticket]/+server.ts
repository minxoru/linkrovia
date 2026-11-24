import { respondToDomainProbe } from '$lib/server/domains/proof';
import type { RequestHandler } from './$types';

const headers = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export const GET: RequestHandler = async ({ locals, params, request, url }) => {
  if (!locals.env.DB) return new Response(null, { status: 503, headers });
  const result = await respondToDomainProbe(
    locals.env.DB,
    params.ticket,
    url,
    request.headers.get('origin'),
  );
  if (!result) return new Response(null, { status: 404, headers });
  return Response.json(
    { proof: result.proof },
    {
      headers: {
        ...headers,
        'access-control-allow-origin': result.origin,
        vary: 'Origin',
      },
    },
  );
};
