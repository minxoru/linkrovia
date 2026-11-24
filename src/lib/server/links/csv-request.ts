import { isTimeZone } from '../../timezone/timezone';
import { CsvInputError, parseCsv } from '../../csv';
import { isCsvRequest, readCsv } from './csv';
import { commitCsv, previewCsv, type CsvOptions } from './csv-import';

export async function runCsvRequest(
  request: Request,
  db: D1Database,
  actorId: string | null,
  mode: 'preview' | 'commit',
  effectiveTimeZone?: string,
) {
  if (!isCsvRequest(request))
    throw new CsvInputError('unsupported_content_type');
  const params = new URL(request.url).searchParams;
  const allowed = new Set(['duplicate', 'tz', 'offset']);
  for (const name of params.keys()) {
    if (!allowed.has(name) || params.getAll(name).length !== 1) {
      throw new CsvInputError('invalid_options');
    }
  }
  const timeZone = params.get('tz') ?? effectiveTimeZone ?? 'UTC';
  const duplicate = params.get('duplicate') ?? 'error';
  const offset = params.get('offset') ?? '0';
  if (
    !isTimeZone(timeZone) ||
    (effectiveTimeZone !== undefined && timeZone !== effectiveTimeZone) ||
    (duplicate !== 'skip' && duplicate !== 'error') ||
    !/^\d{1,3}$/.test(offset)
  ) {
    throw new CsvInputError('invalid_options');
  }

  const data = parseCsv(await readCsv(request));
  const options: CsvOptions = { duplicate, timeZone };
  return mode === 'preview'
    ? previewCsv(db, data, options, Number(offset))
    : commitCsv(db, actorId, data, options, Number(offset));
}
