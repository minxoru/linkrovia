import {
  parseConversionEvent,
  recordConversion,
} from '$lib/server/conversions/events';
import { readApiJson } from '$lib/server/links/api-input';
import {
  bodyProblem,
  invalidFields,
  payload,
  problem,
  withScope,
} from '../../http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withScope(
    event,
    'conversions:write',
    async (db, principal) => {
      const read = await readApiJson(event.request, 8192);
      if (!('body' in read))
        return read.status === 413
          ? problem(
              413,
              'body_too_large',
              'The event body must be at most 8 KiB.',
            )
          : bodyProblem(read.status);
      const input = parseConversionEvent(read.body);
      if (!input)
        return invalidFields({
          body: ['Provide goalId, occurredAt, and optionally clickRef.'],
        });
      const result = await recordConversion(
        db,
        principal.userId,
        input,
        event.request.headers.get('idempotency-key'),
      );
      if ('receipt' in result)
        return payload(result, { status: result.duplicate ? 200 : 201 });
      switch (result.code) {
        case 'invalid_idempotency_key':
          return problem(
            400,
            result.code,
            'Send a stable Idempotency-Key header of 1–128 printable ASCII characters.',
          );
        case 'invalid_time':
          return problem(
            400,
            result.code,
            'Send an event timestamp within the accepted time window.',
          );
        case 'invalid_reference':
          return problem(
            409,
            result.code,
            'The click reference is unavailable for attribution to this goal.',
          );
        case 'goal_not_found':
          return problem(
            404,
            result.code,
            'The conversion goal could not be found or is inactive.',
          );
      }
    },
    { limitByKey: true },
  );
