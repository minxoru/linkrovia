import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { ApiKeyScope, authorizeApiKey } from '../auth/api-keys';
import { uuidV7 } from '../auth/crypto';
import { listDomains } from '../links/store';
import { deviceTypes, operatingSystems } from '../targeting/visitor';
import { utmKeys } from '../utm';
import { listUtmTemplates } from '../utm/templates';
import {
  GET as listLinks,
  POST as createLink,
} from '../../../routes/api/v1/links/+server';
import {
  GET as getLink,
  PATCH as updateLink,
} from '../../../routes/api/v1/links/[id]/+server';
import { GET as getLinkAnalytics } from '../../../routes/api/v1/links/[id]/analytics/+server';
import { POST as simulateRedirect } from '../../../routes/api/v1/links/[id]/simulate/+server';
import { POST as createUtmTemplate } from '../../../routes/api/v1/utm/templates/+server';

type Principal = NonNullable<Awaited<ReturnType<typeof authorizeApiKey>>>;
type Result = Record<string, unknown>;
type Params = Record<string, string>;
type RouteId = NonNullable<RequestEvent['route']['id']>;

export const mcpToolScopes = {
  list_links: 'links:read',
  get_link: 'links:read',
  create_link: 'links:write',
  update_link: 'links:write',
  disable_link: 'links:write',
  simulate_redirect: 'links:read',
  get_link_analytics: 'analytics:read',
  list_domains: 'links:read',
  list_utm_templates: 'links:read',
  create_utm_template: 'links:write',
} as const satisfies Record<string, ApiKeyScope>;

const id = z.string().regex(/^[a-z0-9_-]{1,100}$/i);
const epochSecond = z.int().min(-8_640_000_000_000).max(8_640_000_000_000);
const version = epochSecond.min(0);
const destination = z.string().max(8192);
const pageSize = z.int().min(1).max(30).default(20);
const page = z.strictObject({
  limit: pageSize,
  offset: z.int().min(0).max(100_000).default(0),
});
const utmValues = z.partialRecord(
  z.enum([...utmKeys, 'source', 'medium', 'campaign', 'term', 'content']),
  z.string().max(256),
);
const conditionType = z.enum(['os', 'device', 'country', 'region', 'language']);
const condition = z.strictObject({
  type: conditionType,
  operator: z.enum(['eq', 'base_language']),
  value: z.string().max(128),
});
const ruleProperties = {
  priority: z.int(),
  destinationUrl: destination,
  isActive: z.boolean().optional(),
};
const rule = z.union([
  z.strictObject({
    ...ruleProperties,
    conditions: z.array(condition).min(1).max(5),
  }),
  z.strictObject({
    ...ruleProperties,
    ...condition.shape,
    operator: condition.shape.operator.optional(),
  }),
]);
const linkFields = {
  domainId: id,
  destinationUrl: destination,
  slug: z.string().max(64).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  redirectType: z.literal([301, 302, 307, 308]).optional(),
  isActive: z.boolean().optional(),
  startsAt: epochSecond.nullable().optional(),
  expiresAt: epochSecond.nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  rules: z.array(rule).max(20).optional(),
  utmConfig: z
    .strictObject({
      default: utmValues.optional(),
      rules: z.record(z.string().max(64), utmValues).optional(),
    })
    .nullable()
    .optional(),
};
const linkUpdate = z
  .strictObject(linkFields)
  .partial()
  .extend({ id, updatedAt: version });

function toolError(
  message: string,
  structuredContent?: Result,
): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent,
  };
}

function toolResult(value: Result): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function registerMcpTools(
  server: McpServer,
  event: RequestEvent,
  db: D1Database,
  principal: Principal,
) {
  function register<Args extends object>(
    name: keyof typeof mcpToolScopes,
    description: string,
    inputSchema: z.ZodType<Args>,
    run: (args: Args, signal: AbortSignal) => Promise<CallToolResult>,
  ) {
    const scope = mcpToolScopes[name];
    if (!principal.scopes.includes(scope)) return;
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: scope !== 'links:write',
          openWorldHint: false,
        },
      },
      async (args, ctx) => {
        const signal = AbortSignal.any([
          event.request.signal,
          ctx.mcpReq.signal,
        ]);
        if (signal.aborted) return toolError('Request cancelled.');
        try {
          await db
            .prepare(
              `INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json)
               VALUES (?, ?, 'mcp.tool_called', 'mcp_tool', ?, ?)`,
            )
            .bind(
              uuidV7(),
              principal.userId,
              name,
              JSON.stringify({ apiKeyId: principal.id }),
            )
            .run();
          if (signal.aborted) return toolError('Request cancelled.');
          return await run(args, signal);
        } catch {
          return toolError('Linkrovia could not complete the tool request.');
        }
      },
    );
  }

  async function rest<P extends Params, Route extends RouteId>(
    handler: RequestHandler<P, Route>,
    route: Route,
    params: P,
    method: 'GET' | 'POST' | 'PATCH',
    signal: AbortSignal,
    {
      query,
      body,
    }: { query?: Record<string, string | number>; body?: object } = {},
  ): Promise<CallToolResult> {
    const path = route.replace('[id]', () => encodeURIComponent(params.id));
    const url = new URL(path, event.url);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers();
    headers.set('authorization', event.request.headers.get('authorization')!);
    if (body) headers.set('content-type', 'application/json');
    const request = new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const response = await handler({
      ...event,
      locals: { ...event.locals, session: null },
      params,
      request,
      route: { id: route },
      url,
    });
    if (response.status >= 500)
      return toolError('Linkrovia could not complete the tool request.');
    const result = await response.json<Result>();
    if (!response.ok) {
      return toolError('Linkrovia rejected the tool request.', {
        status: response.status,
        code: result.code,
        fieldErrors: result.fieldErrors,
      });
    }
    return toolResult(result);
  }

  register(
    'list_links',
    'List links with filters and a page cursor.',
    z.strictObject({
      q: z.string().min(1).max(200).optional(),
      domain: id.optional(),
      tag: z.string().min(1).max(50).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      cursor: z
        .string()
        .regex(/^\d{1,12}:[0-9a-f-]{36}$/)
        .optional(),
      limit: pageSize,
    }),
    (query, signal) =>
      rest(listLinks, '/api/v1/links', {}, 'GET', signal, { query }),
  );
  register(
    'get_link',
    'Get a link and its redirect rules by ID.',
    z.strictObject({ id }),
    (params, signal) =>
      rest(getLink, '/api/v1/links/[id]', params, 'GET', signal),
  );
  register(
    'create_link',
    'Create a new short link.',
    z.strictObject(linkFields),
    (body, signal) =>
      rest(createLink, '/api/v1/links', {}, 'POST', signal, { body }),
  );
  register(
    'update_link',
    'Update an existing link using its current updatedAt value.',
    linkUpdate,
    ({ id, ...body }, signal) =>
      rest(updateLink, '/api/v1/links/[id]', { id }, 'PATCH', signal, { body }),
  );
  register(
    'disable_link',
    'Deactivate an existing link using its current updatedAt value.',
    z.strictObject({ id, updatedAt: version }),
    ({ id, updatedAt }, signal) =>
      rest(updateLink, '/api/v1/links/[id]', { id }, 'PATCH', signal, {
        body: { updatedAt, isActive: false },
      }),
  );
  register(
    'simulate_redirect',
    'Preview which redirect rule applies to a visitor context.',
    z.strictObject({
      id,
      os: z.enum(operatingSystems).optional(),
      device: z.enum(deviceTypes).optional(),
      country: z.string().max(7).optional(),
      region: z.string().max(16).optional(),
      language: z.string().max(128).optional(),
      referrer: destination.nullable().optional(),
      at: epochSecond.optional(),
    }),
    ({ id, ...body }, signal) =>
      rest(
        simulateRedirect,
        '/api/v1/links/[id]/simulate',
        { id },
        'POST',
        signal,
        { body },
      ),
  );
  register(
    'get_link_analytics',
    'Read aggregate click statistics for a link.',
    z.strictObject({
      id,
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      tz: z.string().max(100).optional(),
      range: z.enum(['24h', '7d', '30d', '90d', '1y', 'all']).optional(),
      granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
      ruleId: id.optional(),
      source: z.enum(['link', 'qr']).optional(),
      dimension: z
        .enum([
          'country',
          'region',
          'referrer',
          'device',
          'os',
          'browser',
          'rule',
          'source',
          'traffic',
          'link',
        ])
        .optional(),
      filter: z.string().max(32).optional(),
      key: z.string().max(255).optional(),
    }),
    ({ id, ...query }, signal) =>
      rest(
        getLinkAnalytics,
        '/api/v1/links/[id]/analytics',
        { id },
        'GET',
        signal,
        { query },
      ),
  );
  register(
    'list_domains',
    'List registered short-link hosts.',
    page,
    async ({ limit, offset }) => {
      const domains = await listDomains(db, { limit: limit + 1, offset });
      return toolResult({
        data: domains.slice(0, limit),
        nextOffset: domains.length > limit ? offset + limit : null,
      });
    },
  );
  register(
    'list_utm_templates',
    'List stored UTM templates.',
    page,
    async (query) => toolResult(await listUtmTemplates(db, query)),
  );
  register(
    'create_utm_template',
    'Create a reusable set of UTM values.',
    z.strictObject({
      name: z.string().min(1).max(80),
      description: z.string().max(256).nullable().optional(),
      values: utmValues,
    }),
    (body, signal) =>
      rest(createUtmTemplate, '/api/v1/utm/templates', {}, 'POST', signal, {
        body,
      }),
  );
}
