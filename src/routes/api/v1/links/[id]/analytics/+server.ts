import { analyticsResponse } from '../../../analytics/report';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  analyticsResponse(event, event.params.id);
