import { error } from '@sveltejs/kit';
import { requireSession } from '$lib/server/links/form';
import { qrResponse } from '$lib/server/links/qr-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { db } = requireSession(event);
  const format = event.params.format;
  if (format !== 'svg' && format !== 'png') error(404, 'Not found');
  return (
    (await qrResponse(db, event.params.id, event.url, format)) ??
    error(404, 'Not found')
  );
};
