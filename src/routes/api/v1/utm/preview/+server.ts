import { isObject } from '$lib/server/links/api-input';
import { parseDestinationUrl } from '$lib/server/security/url-policy';
import { parseUtmValues, previewUtm } from '$lib/server/utm';
import { invalidFields, payload, withJson, withScope } from '../../http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
  withScope(
    event,
    'links:read',
    () =>
      withJson(event, (body) => {
        if (
          !isObject(body) ||
          Object.keys(body).some(
            (key) => key !== 'destinationUrl' && key !== 'values',
          )
        )
          return invalidFields({
            body: ['Provide a destinationUrl and UTM values.'],
          });
        const destination = parseDestinationUrl(body.destinationUrl);
        if (!destination)
          return invalidFields({
            destinationUrl: ['Enter a public HTTP or HTTPS URL.'],
          });
        const values = parseUtmValues(body.values);
        if (!values)
          return invalidFields({
            values: ['Enter supported UTM parameters with text values.'],
          });
        return payload(previewUtm(destination.href, values));
      }),
    { recordUse: false },
  );
