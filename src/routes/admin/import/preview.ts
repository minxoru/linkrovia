import type { CsvRow, DuplicatePolicy } from '$lib/server/links/csv-import';

export function markPreviewDuplicates(
  rows: CsvRow[],
  duplicate: DuplicatePolicy,
) {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (row.status !== 'ready') return row;
    const key = `${row.domain}/${row.slug}`;
    if (seen.has(key)) {
      const { record: _record, ...details } = row;
      return {
        ...details,
        status:
          duplicate === 'skip' ? ('skipped' as const) : ('error' as const),
        code: 'duplicate',
        fields: ['slug'],
      };
    }
    seen.add(key);
    return row;
  });
}
