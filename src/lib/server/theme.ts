import type { Cookies } from '@sveltejs/kit';
import { resolveTheme, type Theme } from '../theme/theme';

export const themeCookie = '__Host-linkrovia_theme';

export function setThemeCookie(cookies: Cookies, theme: Theme) {
  cookies.set(themeCookie, resolveTheme(theme, undefined), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,
  });
}
