export function requireSameOrigin(request: Request, url: URL): boolean {
  return request.headers.get('origin') === url.origin;
}

export async function readSmallForm(
  request: Request,
  maxBytes = 8192,
): Promise<URLSearchParams | null> {
  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded' || !request.body)
    return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return new URLSearchParams(body + decoder.decode());
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
