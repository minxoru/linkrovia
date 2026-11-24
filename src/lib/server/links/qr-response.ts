import { qrFilename, qrPng, qrSvg, qrUrl } from './qr';
import { getDefaultQr, qrLink } from './qr-store';

export async function qrResponse(
  db: D1Database,
  id: string,
  origin: URL,
  format: 'svg' | 'png',
) {
  const link = await qrLink(db, id);
  if (!link) return null;
  const qr = await getDefaultQr(db, id);
  if (!qr) return null;
  const url = qrUrl(link.hostname, qr.token, origin);
  const body = format === 'svg' ? qrSvg(url) : await qrPng(url);
  return new Response(body, {
    headers: {
      'content-type':
        format === 'svg' ? 'image/svg+xml; charset=utf-8' : 'image/png',
      'content-disposition': `inline; filename="${qrFilename(link.slug)}-qr.${format}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
