import { describe, expect, it } from 'vitest';
import { isTheme, resolveTheme } from '../../src/lib/theme/theme';

describe('theme preferences', () => {
  it('uses the system preference for first visits and rejects unrecognized values', () => {
    expect(resolveTheme(undefined, undefined)).toBe('system');
    expect(resolveTheme(undefined, '" invalid="html')).toBe('system');
    expect(isTheme('DARK')).toBe(false);
  });

  it('uses a saved browser preference when no account preference is available', () => {
    expect(resolveTheme(undefined, 'dark')).toBe('dark');
  });

  it('gives the account preference precedence, including system mode', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('system');
  });
});
