export const maxCsvBytes = 1024 * 1024;
export const maxCsvRows = 500;
export const csvPreviewBatchSize = 50;

const columns = new Set([
  'destination_url',
  'slug',
  'domain',
  'redirect_type',
  'starts_at',
  'expires_at',
  'tags',
  'ios_url',
  'android_url',
  'title',
  'is_active',
  'rules',
]);

export type CsvInputCode =
  | 'invalid_encoding'
  | 'invalid_csv'
  | 'invalid_header'
  | 'file_too_large'
  | 'too_many_rows'
  | 'unsupported_content_type'
  | 'invalid_options';

export class CsvInputError extends Error {
  constructor(readonly code: CsvInputCode) {
    super(code);
  }
}

export type CsvFile = { headers: string[]; rows: string[][] };

export function parseCsv(value: string): CsvFile {
  const records: string[][] = [];
  let offset = 0;
  let record: string[] = [];
  const unquoted = /[^,"\r\n]*/y;
  const quoted = /"(?:[^"]|"")*"/y;
  while (offset < value.length || record.length) {
    const pattern = value[offset] === '"' ? quoted : unquoted;
    pattern.lastIndex = offset;
    const match = pattern.exec(value);
    if (!match) throw new CsvInputError('invalid_csv');
    const cell = match[0];
    const quotedCell = pattern === quoted;
    record.push(quotedCell ? cell.slice(1, -1).replaceAll('""', '"') : cell);
    if (record.length > 64) throw new CsvInputError('invalid_csv');
    offset = pattern.lastIndex;

    const separator = value[offset];
    if (separator === ',') {
      offset++;
      continue;
    }
    if (separator === '\r' && value[offset + 1] === '\n') offset += 2;
    else if (separator === '\n') offset++;
    else if (separator !== undefined) throw new CsvInputError('invalid_csv');
    records.push(record);
    if (records.length > maxCsvRows + 1)
      throw new CsvInputError('too_many_rows');
    record = [];
  }

  const [headers, ...rows] = records;
  if (
    !headers?.includes('destination_url') ||
    new Set(headers).size !== headers.length ||
    headers.some((name) => !columns.has(name))
  ) {
    throw new CsvInputError('invalid_header');
  }
  if (!rows.length) throw new CsvInputError('invalid_csv');
  return { headers, rows };
}
export function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Quote an inert spreadsheet display value, including common Unicode formula prefixes. */
export function csvCell(value: string): string {
  const needsProtection =
    /^[\t\r\n]/u.test(value) || /^[\s\p{Cf}]*[=+\-@＝＋－＠]/u.test(value);
  return csvField(needsProtection ? "'" + value : value);
}
