import { json } from '@sveltejs/kit';
import { isConfiguredSetupToken, setupOpen } from '$lib/server/auth/setup';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const headers = { 'cache-control': 'no-store' };
  try {
    if (locals.env.DB) {
      const pending = await locals.env.DB.prepare(
        `SELECT (${setupOpen}) AS pending FROM setup_state WHERE singleton = 1`,
      ).first<number>('pending');
      if (pending !== null) {
        const setup =
          pending !== 1
            ? 'complete'
            : isConfiguredSetupToken(locals.env.SETUP_TOKEN)
              ? 'pending'
              : 'token-required';
        return json(
          { status: 'ok' },
          {
            headers: {
              ...headers,
              'x-linkrovia-setup': setup,
            },
          },
        );
      }
    }
  } catch {
    console.error('D1 readiness check failed');
  }
  return json({ status: 'unavailable' }, { status: 503, headers });
};
