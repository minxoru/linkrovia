import { describe, expect, it } from 'vitest';
import { csvBatches, csvCell } from '../../src/routes/admin/import/spreadsheet';
import { parseCsv } from '../../src/lib/csv';
import { readCsv } from '../../src/lib/server/links/csv';

describe('CSV input', () => {
  it('accepts a UTF-8 BOM, escaped quotes, and embedded line breaks', async () => {
    const input =
      '\uFEFFdestination_url,tags\r\nhttps://example.com,"one,""two""\r\nthree"\r\n';
    const decoded = await readCsv(
      new Request('https://example.com', { method: 'POST', body: input }),
    );
    expect(parseCsv(decoded)).toEqual({
      headers: ['destination_url', 'tags'],
      rows: [['https://example.com', 'one,"two"\r\nthree']],
    });
  });

  it('rejects invalid UTF-8 and an oversized request body', async () => {
    const request = (body: Uint8Array<ArrayBuffer>) =>
      new Request('https://example.com', { method: 'POST', body });
    await expect(
      readCsv(request(Uint8Array.of(0xc0, 0xaf))),
    ).rejects.toMatchObject({ code: 'invalid_encoding' });
    await expect(
      readCsv(request(new Uint8Array(1024 * 1024 + 1))),
    ).rejects.toMatchObject({ code: 'file_too_large' });
  });

  it.each([
    'destination_url\n"unclosed',
    'destination_url\n"quoted"tail',
    'destination_url\nun"quoted',
  ])('rejects broken quote syntax in %s', (value) => {
    expect(() => parseCsv(value)).toThrow('invalid_csv');
  });

  it('rejects more than 500 logical records', () => {
    expect(() =>
      parseCsv('destination_url\n' + 'https://example.com\n'.repeat(501)),
    ).toThrow('too_many_rows');
  });

  it.each([
    '=SUM(1)',
    '+SUM(1)',
    '-SUM(1)',
    '@SUM(1)',
    ' \t=SUM(1)',
    '＝SUM(1)',
    '\tdata',
    '\rdata',
  ])('escapes spreadsheet cell %s', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it('retains literal quotes and commas inside a quoted export cell', () => {
    expect(csvCell('Hello, "World"')).toBe('"Hello, ""World"""');
  });
});

describe('browser CSV batches', () => {
  const headers = ['destination_url'];
  const targetBytes = 256 * 1024;

  it('counts UTF-8 bytes and honors the record cap without losing offsets', () => {
    const large = '界'.repeat(50_000);
    const records = [[large], [large], ['a'], ['b'], ['c']];
    const batches = [...csvBatches(headers, records, 2)];
    expect(batches.map(({ offset, size }) => [offset, size])).toEqual([
      [0, 1],
      [1, 2],
      [3, 2],
    ]);
    for (const batch of batches) {
      expect(new TextEncoder().encode(batch.body).length).toBeLessThanOrEqual(
        targetBytes,
      );
      expect(parseCsv(batch.body).rows).toEqual(
        records.slice(batch.offset, batch.offset + batch.size),
      );
    }
  });

  it('submits an oversize record alone with its header', () => {
    const large = '界'.repeat(100_000);
    const batches = [
      ...csvBatches(headers, [['before'], [large], ['after']], 50),
    ];
    expect(batches.map(({ offset, size }) => [offset, size])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(parseCsv(batches[1].body)).toEqual({ headers, rows: [[large]] });
    expect(new TextEncoder().encode(batches[1].body).length).toBeGreaterThan(
      targetBytes,
    );
  });
});
