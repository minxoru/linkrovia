import type { RequestEvent } from '@sveltejs/kit';
import { checkCsrfToken, type Session } from '$lib/server/auth/session';
import { hex, sha256 } from '$lib/server/auth/crypto';
import { requireSameOrigin } from '$lib/server/security/request';
import { allowAuthAttempt } from '$lib/server/security/rate-limit';
import {
  BackupError,
  createBackup,
  readBackup,
} from '$lib/server/backup/format';
import {
  downloadReceipt,
  issueManifest,
  verifyDownload,
  verifyManifest,
  type RestoreOptions,
} from '$lib/server/backup/manifest';
import { planRestore } from '$lib/server/backup/restore';
import { readBackupState } from '$lib/server/backup/snapshot';
import { payload, problem } from '../http';

const errors = {
  invalid_json: [400, 'Send a valid UTF-8 JSON backup file.'],
  invalid_document: [400, 'The backup contents are invalid.'],
  unsupported_version: [400, 'This backup schema is unsupported.'],
  checksum_mismatch: [400, 'The backup contents do not match the checksum.'],
  invalid_options: [400, 'Select a valid restore mode and conflict policy.'],
  too_large: [
    413,
    'This operation exceeds the 128 KiB or 250 record backup limit.',
  ],
  unsupported_content_type: [415, 'Send the backup file as application/json.'],
  stale_manifest: [409, 'Validate the backup again before restoring it.'],
  confirmation_required: [
    409,
    'Download the current backup and confirm replacement.',
  ],
  restore_failed: [
    500,
    'No partial restore was applied. Retry the same restore or validate it again.',
  ],
  backup_unavailable: [503, 'The backup could not be created or validated.'],
} as const;

function backupProblem(cause: unknown) {
  const code =
    cause instanceof BackupError && Object.hasOwn(errors, cause.code)
      ? (cause.code as keyof typeof errors)
      : 'backup_unavailable';
  return problem(errors[code][0], code, errors[code][1]);
}

export async function withBackupOwner(
  event: RequestEvent,
  operation: (db: D1Database, session: Session) => Promise<Response>,
) {
  const session = event.locals.session;
  if (!session)
    return problem(401, 'unauthorized', 'Sign in to an owner account.');
  if (session.user.role !== 'owner')
    return problem(403, 'forbidden', 'This operation requires the owner role.');
  const db = event.locals.env?.DB;
  if (!db) return backupProblem(null);
  if (
    event.request.method === 'POST' &&
    (!requireSameOrigin(event.request, event.url) ||
      !checkCsrfToken(
        event.request.headers.get('x-csrf-token'),
        session.csrfToken,
      ))
  )
    return problem(403, 'forbidden', 'The request could not be verified.');

  try {
    if (
      !(await allowAuthAttempt(
        event,
        `backup:${session.user.id}:${event.route.id}`,
      ))
    )
      return problem(
        429,
        'rate_limited',
        'Try again in one minute.',
        {},
        { 'retry-after': '60' },
      );
    return await operation(db, session);
  } catch (cause) {
    return backupProblem(cause);
  }
}

function restoreOptions(url: URL): RestoreOptions {
  const params = url.searchParams;
  for (const name of params.keys()) {
    if (
      (name !== 'mode' && name !== 'conflict') ||
      params.getAll(name).length !== 1
    )
      throw new BackupError('invalid_options');
  }
  const mode = params.get('mode') ?? 'merge';
  const conflict =
    params.get('conflict') ?? (mode === 'replace' ? 'overwrite' : 'skip');
  if (mode === 'replace' && conflict === 'overwrite') return { mode, conflict };
  if (mode === 'merge' && (conflict === 'overwrite' || conflict === 'skip'))
    return { mode, conflict };
  throw new BackupError('invalid_options');
}

export function exportBackup(event: RequestEvent) {
  return withBackupOwner(event, async (db, session) => {
    const state = await readBackupState(db);
    const manifest =
      event.request.method === 'POST'
        ? event.request.headers.get('x-backup-manifest')
        : null;
    const headers = new Headers({
      'content-disposition': 'attachment; filename="linkrovia-backup.json"',
      'x-content-type-options': 'nosniff',
    });
    if (manifest !== null) {
      const claims = verifyManifest(state.key, session.csrfToken, manifest);
      if (claims.mode !== 'replace' || claims.revision !== state.revision)
        throw new BackupError('stale_manifest');
      headers.set(
        'x-backup-download',
        downloadReceipt(state.key, session.csrfToken, manifest),
      );
    }
    const document = await createBackup(state.data, state.instanceId);
    return payload(document, { headers });
  });
}

export function validateBackup(event: RequestEvent) {
  return withBackupOwner(event, async (db, session) => {
    const options = restoreOptions(event.url);
    const backup = await readBackup(event.request);
    const state = await readBackupState(db, backup);
    const { result } = planRestore(db, session.user.id, state, backup, options);
    return payload({
      manifest: issueManifest(
        state.key,
        session.csrfToken,
        options,
        backup.integrityChecksum,
        state.revision,
      ),
      preview: result.preview,
    });
  });
}

async function completedRestore(db: D1Database, id: string, owner: string) {
  const stored = await db
    .prepare(
      `SELECT report_json FROM import_jobs
    WHERE id = ? AND created_by = ? AND kind = 'backup_restore' AND status = 'completed'`,
    )
    .bind(id, owner)
    .first<string>('report_json');
  return stored ? payload(JSON.parse(stored)) : null;
}

export function restoreBackup(event: RequestEvent) {
  return withBackupOwner(event, async (db, session) => {
    const manifest = event.request.headers.get('x-backup-manifest') ?? '';
    const backup = await readBackup(event.request);
    const state = await readBackupState(db, backup);
    const claims = verifyManifest(state.key, session.csrfToken, manifest);
    if (claims.checksum !== backup.integrityChecksum)
      throw new BackupError('stale_manifest');
    if (
      claims.mode === 'replace' &&
      (event.request.headers.get('x-backup-confirm') !== 'replace' ||
        !verifyDownload(
          state.key,
          session.csrfToken,
          manifest,
          event.request.headers.get('x-backup-download') ?? '',
        ))
    )
      throw new BackupError('confirmation_required');

    const id = hex(await sha256(manifest));
    const owner = session.user.id;
    const prior = await completedRestore(db, id, owner);
    if (prior) return prior;
    if (claims.revision !== state.revision)
      throw new BackupError('stale_manifest');
    const { statements, result } = planRestore(
      db,
      owner,
      state,
      backup,
      claims,
    );

    try {
      // Abort the entire D1 transaction if anything changed after the snapshot.
      await db.batch([
        db
          .prepare(
            `UPDATE backup_state SET revision = CASE WHEN revision = ?
          THEN revision + 1 ELSE NULL END WHERE singleton = 1`,
          )
          .bind(claims.revision),
        ...statements,
        db
          .prepare(
            `INSERT INTO import_jobs (id, created_by, kind, status, report_json)
          VALUES (?, ?, 'backup_restore', 'completed', ?)`,
          )
          .bind(id, owner, JSON.stringify(result)),
        db
          .prepare(
            `INSERT INTO audit_events (id, user_id, action, entity_type, entity_id)
          VALUES (?, ?, 'backup.restored', 'import_job', ?)`,
          )
          .bind(crypto.randomUUID(), owner, id),
      ]);
    } catch {
      const completed = await completedRestore(db, id, owner);
      if (completed) return completed;
      const revision = await db
        .prepare('SELECT revision FROM backup_state WHERE singleton = 1')
        .first<number>('revision');
      throw new BackupError(
        revision !== claims.revision ? 'stale_manifest' : 'restore_failed',
      );
    }
    return payload(result);
  });
}
