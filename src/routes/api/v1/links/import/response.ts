import { CsvInputError, type CsvInputCode } from '$lib/csv';
import { runCsvRequest } from '$lib/server/links/csv-request';
import type { RequestEvent } from '@sveltejs/kit';
import { payload, problem, withScope } from '../../http';

const details: Record<CsvInputCode, string> = {
  invalid_encoding: 'Send a UTF-8 CSV file.',
  invalid_csv: 'Check the CSV syntax and include at least one data row.',
  invalid_header:
    'Include destination_url and use unique, supported column names.',
  file_too_large: 'The CSV file must be at most 1 MiB.',
  too_many_rows: 'The CSV file must contain at most 500 data rows.',
  unsupported_content_type: 'Send the body as text/csv.',
  invalid_options: 'Check the duplicate policy, timezone and batch offset.',
};

export function importResponse(
  event: RequestEvent,
  mode: 'preview' | 'commit',
) {
  return withScope(
    event,
    'links:write',
    async (db, principal) => {
      try {
        return payload(
          await runCsvRequest(event.request, db, principal.userId, mode),
        );
      } catch (cause) {
        if (!(cause instanceof CsvInputError)) throw cause;
        const status =
          cause.code === 'unsupported_content_type'
            ? 415
            : cause.code === 'file_too_large' || cause.code === 'too_many_rows'
              ? 413
              : 400;
        return problem(status, cause.code, details[cause.code]);
      }
    },
    { recordUse: mode === 'commit' },
  );
}
