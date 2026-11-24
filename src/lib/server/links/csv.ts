import { CsvInputError, maxCsvBytes } from '../../csv';

export async function readCsv(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > maxCsvBytes) {
    throw new CsvInputError('file_too_large');
  }
  if (!request.body) throw new CsvInputError('invalid_csv');

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks.join('') + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxCsvBytes) throw new CsvInputError('file_too_large');
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } catch (cause) {
    await reader.cancel().catch(() => {});
    if (cause instanceof CsvInputError) throw cause;
    throw new CsvInputError('invalid_encoding');
  } finally {
    reader.releaseLock();
  }
}

export function isCsvRequest(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return /^text\/csv(?:;\s*charset\s*=\s*(?:"utf-8"|utf-8))?$/i.test(
    contentType.trim(),
  );
}
