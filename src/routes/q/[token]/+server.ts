import {
  rejectPublicLinkMethod,
  servePublicLink,
} from '$lib/server/links/public-response';
import { resolveQrLink } from '$lib/server/links/redirect';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  servePublicLink(event, event.params.token, resolveQrLink);
export const HEAD = GET;
export const fallback = rejectPublicLinkMethod;
