import type { RequestHandler } from './$types';
import { importResponse } from '../response';

export const POST: RequestHandler = (event) => importResponse(event, 'preview');
