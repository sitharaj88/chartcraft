/**
 * Theme system. The palette values below are validated for colorblind safety
 * (adjacent-pair CVD deltaE >= 8) — never re-sort them, never alter hexes.
 * Series color follows series identity, never rank after filtering.
 */
import type { Theme } from '../types';

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** 8 categorical slots per scheme. Validated order — do not re-sort. */
export const categoricalPalette: { light: string[]; dark: string[] } = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** Blue ramp 100 -> 700, light -> dark. */
export const sequentialPalette: string[] = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
  '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
];

export const lightTheme: Theme = {
  colorScheme: 'light',
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  gridline: '#e1e0d9',
  axisLine: '#c3c2b7',
  series: [...categoricalPalette.light],
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  up: '#0ca30c',
  down: '#d03b3b',
  neutral: '#52514e',
};

export const darkTheme: Theme = {
  colorScheme: 'dark',
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  gridline: '#2c2c2a',
  axisLine: '#383835',
  series: [...categoricalPalette.dark],
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  up: '#0ca30c',
  down: '#d03b3b',
  neutral: '#c3c2b7',
};

/** SSR-safe: never touches window at module scope. */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/**
 * Resolve a theme option value to a concrete Theme.
 * 'auto' follows prefers-color-scheme (light when matchMedia unavailable).
 * A partial custom Theme object is completed against the base for its scheme.
 */
export function resolveTheme(theme: 'light' | 'dark' | 'auto' | Theme | undefined): Theme {
  if (theme === undefined || theme === 'auto') {
    return systemPrefersDark() ? darkTheme : lightTheme;
  }
  if (theme === 'light') return lightTheme;
  if (theme === 'dark') return darkTheme;
  const base = theme.colorScheme === 'dark' ? darkTheme : lightTheme;
  return { ...base, ...theme, series: theme.series ?? base.series };
}

/**
 * Subscribe to prefers-color-scheme changes. Returns an unsubscribe fn.
 * No-op (returns noop) outside the DOM or when matchMedia is unavailable.
 */
export function watchColorScheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  const handler = () => onChange();
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  // Safari < 14 fallback
  const legacy = mql as unknown as {
    addListener?: (h: () => void) => void;
    removeListener?: (h: () => void) => void;
  };
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}
