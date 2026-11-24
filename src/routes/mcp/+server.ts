import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { registerMcpTools } from '$lib/server/mcp/tools';
import { isMcpEnabled } from '$lib/server/mcp/settings';
import { problem, withScope } from '../api/v1/http';
import type { RequestHandler } from './$types';

const maxRequestBytes = 256 * 1024;

const handle: RequestHandler = async (event) => {
  const db = event.locals.env?.DB;
  if (!db) return new Response(null, { status: 503 });
  try {
    if (!(await isMcpEnabled(db))) return new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 503 });
  }

  const origin = event.request.headers.get('origin');
  if (origin !== null && origin !== event.url.origin) {
    return problem(403, 'invalid_origin', 'The origin is not allowed.');
  }
  return withScope(
    event,
    'mcp:connect',
    (db, principal) => {
      if (event.request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { allow: 'POST' } });
      }

      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: 'Linkrovia', version: '1.0.0' });
          registerMcpTools(server, event, db, principal);
          return server;
        },
        { maxRequestBodySize: maxRequestBytes },
      );
      return handler.fetch(event.request);
    },
    { limitByKey: true },
  );
};

export const POST = handle;
export const GET = handle;
export const HEAD = handle;
export const DELETE = handle;
export const OPTIONS = handle;
