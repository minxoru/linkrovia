import { parseSimulationInput } from '../../../../../lib/server/links/simulation';
import { getVisitorContext } from '../../../../../lib/server/targeting/visitor';

export const simulationFields = {
  userAgent: 512,
  country: 7,
  region: 7,
  language: 64,
} as const;

export function parseSimulationForm(form: URLSearchParams) {
  const userAgent = form.get('userAgent') ?? '';
  const country = form.get('country') ?? '';
  const region = form.get('region') ?? '';
  const language = form.get('language') ?? '';
  const values = { userAgent, country, region, language };
  const invalidFields = Object.entries(simulationFields)
    .filter(([field, max]) => values[field as keyof typeof values].length > max)
    .map(([field]) => field);
  if (/[^\x20-\x7e]/.test(userAgent) && !invalidFields.includes('userAgent')) {
    invalidFields.push('userAgent');
  }

  const userAgentHeader = invalidFields.includes('userAgent') ? '' : userAgent;
  const { os, device } = getVisitorContext(
    new Request('https://simulation.invalid', {
      headers: { 'user-agent': userAgentHeader },
    }),
  );
  const parsed = parseSimulationInput({
    os,
    device,
    country: country.trim() || undefined,
    region: region.trim() || undefined,
    language: language.trim() || undefined,
  });
  if ('fieldErrors' in parsed) {
    for (const field of Object.keys(parsed.fieldErrors)) {
      if (!invalidFields.includes(field)) invalidFields.push(field);
    }
  }
  if (invalidFields.length || 'fieldErrors' in parsed) {
    return { values, invalidFields };
  }
  return { values, input: parsed.input };
}
