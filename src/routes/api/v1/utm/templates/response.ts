import type { createUtmTemplate } from '$lib/server/utm/templates';
import { invalidFields, payload, problem } from '../../http';

export function missingTemplate() {
  return problem(
    404,
    'template_not_found',
    'The UTM template could not be found.',
  );
}

export function staleTemplate() {
  return problem(
    409,
    'stale_template',
    'The template changed. Get its latest updatedAt value and retry.',
  );
}

export function templateResponse(
  result: Awaited<ReturnType<typeof createUtmTemplate>>,
  status: 200 | 201,
) {
  if ('template' in result) return payload(result.template, { status });

  switch (result.code) {
    case 'name_conflict':
      return problem(
        409,
        'name_conflict',
        'A UTM template with this name already exists.',
      );
    case 'stale_template':
      return staleTemplate();
    case 'not_found':
      return missingTemplate();
    case 'invalid_template':
      return invalidFields({
        body: [
          'Provide a name, optional description, and at least one supported UTM value.',
        ],
      });
  }
}
