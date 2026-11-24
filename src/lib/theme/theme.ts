export const themes = ['system', 'light', 'dark'] as const;
export type Theme = (typeof themes)[number];

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(account: unknown, browser: unknown): Theme {
  if (isTheme(account)) return account;
  return isTheme(browser) ? browser : 'system';
}
