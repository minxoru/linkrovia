import { csvField } from '../../../lib/csv';
export { csvCell, csvField } from '../../../lib/csv';

function csvRecord(row: string[]): string {
  return row
    .map((value) =>
      (row.length === 1 && !value) || /[,"\r\n]/.test(value)
        ? csvField(value)
        : value,
    )
    .join(',');
}

const targetBatchBytes = 256 * 1024;

export function* csvBatches(
  headers: string[],
  rows: string[][],
  rowLimit: number,
) {
  const encoder = new TextEncoder();
  const header = csvRecord(headers);
  const headerBytes = encoder.encode(header).length;
  let records: string[] = [];
  let bytes = headerBytes;
  let offset = 0;

  for (const row of rows) {
    const record = csvRecord(row);
    const recordBytes = encoder.encode(record).length + 1;
    if (
      records.length &&
      (records.length >= rowLimit || bytes + recordBytes > targetBatchBytes)
    ) {
      yield {
        offset,
        size: records.length,
        body: [header, ...records].join('\n'),
      };
      offset += records.length;
      records = [];
      bytes = headerBytes;
    }
    records.push(record);
    bytes += recordBytes;
  }
  if (records.length) {
    yield {
      offset,
      size: records.length,
      body: [header, ...records].join('\n'),
    };
  }
}
