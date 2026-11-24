import type { getSession } from '$lib/server/auth/session';
import type { Locale } from '$lib/i18n/locale';

declare global {
  namespace App {
    interface Locals {
      env: Omit<Env, 'CLICKS' | 'ANALYTICS_SQL'> &
        Partial<Pick<Env, 'CLICKS' | 'ANALYTICS_SQL'>> & {
          LINKROVIA_CLICKS_DATASET?: string;
        };
      locale: Locale;
      session: Awaited<ReturnType<typeof getSession>>;
    }
  }
}

export {};
