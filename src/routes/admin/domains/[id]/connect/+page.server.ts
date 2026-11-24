import { dev } from '$app/env';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { requireForm, requireSession } from '$lib/server/links/form';
import { updateDomainAssignment } from '$lib/server/domains/assignment';
import { parseCloudflareInput } from '$lib/server/domains/cloudflare';
import {
  deploymentHostname,
  managementHostname,
  readDomainConnection,
} from '$lib/server/domains/connection';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async (event) => {
  const { db, session } = requireSession(event);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const [domain, primary] = await Promise.all([
    readDomainConnection(db, event.params.id),
    managementHostname(db),
  ]);
  if (!domain) error(404, 'Domain not found');
  const { mappingId: _mappingId, ...view } = domain;
  return {
    locale: event.locals.locale,
    domain: view,
    managementHostname: primary ?? null,
    isOwner: session.user.role === 'owner',
    managementAvailable:
      !!primary &&
      (primary.endsWith('.workers.dev') ||
        (dev && ['localhost', '127.0.0.1', '::1'].includes(primary))),
  };
}) satisfies PageServerLoad;

async function assign(event: RequestEvent, operation: 'attach' | 'detach') {
  const { db, session, form } = await requireForm(event);
  if (session.user.role !== 'owner') error(403, 'Forbidden');
  const version = form.get('version');
  if (form.get('confirmed') !== 'on' || !version || !/^\d+$/.test(version))
    return fail(400, { operation, code: 'confirmation_required' });
  const credentials = parseCloudflareInput({
    accountId: form.get('accountId')?.trim(),
    zoneId: form.get('zoneId')?.trim(),
    token: form.get('token')?.trim(),
  });
  if (!credentials)
    return fail(400, { operation, code: 'invalid_credentials' });
  if (
    !(await allowAuthAttempt(event, `domain-assignment:${session.user.id}`, {
      byAddress: false,
    }))
  )
    return fail(429, { operation, code: 'busy' });

  const [domain, deployment] = await Promise.all([
    readDomainConnection(db, event.params.id ?? ''),
    deploymentHostname(db),
  ]);
  if (!domain || domain.isPrimary) error(404, 'Domain not found');
  if (domain.version !== Number(version))
    return fail(409, { operation, code: 'domain_changed' });
  if (!deployment) return fail(422, { operation, code: 'unsupported' });
  try {
    const { code } = await updateDomainAssignment(
      db,
      domain,
      session.user.id,
      operation,
      credentials,
      deployment,
    );
    switch (code) {
      case 'attached':
      case 'detached':
        return { operation, code };
      case 'permissions':
        return fail(403, { operation, code });
      case 'conflict':
      case 'domain_changed':
      case 'not_managed':
        return fail(409, { operation, code });
      case 'unsupported':
        return fail(422, { operation, code });
      default:
        return fail(503, { operation, code });
    }
  } catch {
    return fail(503, { operation, code: 'provider_error' });
  }
}

export const actions = {
  attach: (event) => assign(event, 'attach'),
  detach: (event) => assign(event, 'detach'),
  management: async (event) => {
    const { db, session, form } = await requireForm(event);
    if (session.user.role !== 'owner') error(403, 'Forbidden');
    const enabled = form.get('enabled');
    if (enabled !== '0' && enabled !== '1')
      return fail(400, { operation: 'management', code: 'invalid' });
    const primaryAllowed = `EXISTS (SELECT 1 FROM domains AS primary_domain WHERE primary_domain.is_primary = 1 AND (primary_domain.hostname GLOB '*.workers.dev' ${dev ? "OR primary_domain.hostname IN ('localhost', '127.0.0.1', '::1')" : ''}))`;
    const eligible = `(${primaryAllowed}) AND id = ? AND is_primary = 0 AND is_active = 1 AND connection_status = 'active'
      AND verified_at IS NOT NULL AND backup_archived_at IS NULL
      AND provider_mode = 'cloudflare_custom_domain'`;
    const [, result] = await db.batch<{ id: string }>([
      db
        .prepare(
          `UPDATE domains SET management_enabled = 0, updated_at = unixepoch()
        WHERE management_enabled = 1 AND ? = 1 AND EXISTS (SELECT 1 FROM domains WHERE ${eligible})`,
        )
        .bind(Number(enabled), event.params.id),
      db
        .prepare(
          `UPDATE domains SET management_enabled = ?, updated_at = unixepoch()
        WHERE ${eligible} RETURNING id`,
        )
        .bind(Number(enabled), event.params.id),
    ]);
    if (!result.results.length)
      return fail(409, { operation: 'management', code: 'changed' });
    return { operation: 'management', code: 'saved' };
  },
} satisfies Actions;
