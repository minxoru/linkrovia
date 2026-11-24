import { qrResponse } from '$lib/server/links/qr-response';
import { missingLink, withScope } from '../../../http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  withScope(
    event,
    'links:read',
    async (db) =>
      (await qrResponse(db, event.params.id, event.url, 'svg')) ??
      missingLink(),
  );
