import { analyticsResponse } from '../report';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => analyticsResponse(event);
