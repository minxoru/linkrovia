import { ensureDefaultQr, qrLink } from '$lib/server/links/qr-store';
import { missingLink, payload, withScope } from '../../../http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withScope(event, 'links:write', async (db) => {
    const link = await qrLink(db, event.params.id);
    if (!link || !(await ensureDefaultQr(db, link.id))) return missingLink();
    return payload({ id: link.id });
  });
