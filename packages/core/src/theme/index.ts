/**
 * Theme system. The palette values below are validated for colorblind safety
 * (adjacent-pair CVD deltaE >= 8) — never re-sort them, never alter hexes.
 * Series color follows series identity, never rank after filtering.
 */
import type { Theme } from '../types';

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * The status palette's validated CAUTION step (`theme.warning`), v0.4.0.
 *
 * Identical in both schemes, exactly as `up` and `down` are: a status colour
 * carries a MEANING and must not shift hue between light and dark, or the same
 * band reads as a different state on a different desktop. Taken from the
 * validated status palette — not invented here, and not derived from a
 * categorical slot (a status colour must never impersonate a series).
 *
 * `Theme.warning` is OPTIONAL (a caller may hand us a complete custom theme
 * written before the slot existed), so this constant is also the FALLBACK, and
 * `warningColor` below is the only place that applies it.
 */
export const STATUS_WARNING = '#fab219';

/**
 * A theme's CAUTION colour: its own `warning`, or the validated status step.
 *
 * The single resolution point for the slot, so no consumer ever writes
 * `theme.warning ?? '#fab219'` and no second copy of the hex exists. Both
 * built-in themes and every theme `resolveTheme` returns already carry one; this
 * covers a `Theme` object that reached a consumer by another route (a custom
 * theme written against an older version, a test fixture).
 */
export function warningColor(theme: Theme): string {
  return theme.warning ?? STATUS_WARNING;
}

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

/**
 * The DEFAULT sequential ramp, ORIENTED for a surface.
 *
 * A sequential ramp encodes MAGNITUDE, and the governing rule is asymmetric:
 * the near-zero end may recede toward the surface (that is what "almost
 * nothing" should look like), but the high-magnitude end must never be the one
 * that recedes. `sequentialPalette` is written light -> dark, which satisfies
 * that on a LIGHT surface only.
 *
 * Measured against the two built-in surfaces:
 *
 * | end        | step      | vs light `#fcfcfb` | vs dark `#1a1a19` |
 * |------------|-----------|--------------------|-------------------|
 * | lightest   | `#cde2fb` | 1.29               | 13.16             |
 * | darkest    | `#0d366b` | 11.64              | 1.46              |
 *
 * Used verbatim in dark mode, the ramp put the HIGHEST-value cells at 1.46:1 —
 * the cells that matter most were the invisible ones. So the direction follows
 * the scheme: light keeps low -> lightest / high -> darkest; dark REVERSES, so
 * low -> darkest (receding into the dark surface) and high -> lightest (13.16:1,
 * the most prominent step there is). This is the same flip `funnel` already made
 * for its ordinal span, generalized.
 *
 * A CALLER-SUPPLIED ramp is never reoriented — the caller chose the direction,
 * and silently reversing their array would be the more surprising behaviour. See
 * `resolveSequentialRamp`.
 */
export function sequentialRampFor(scheme: 'light' | 'dark'): string[] {
  return scheme === 'dark' ? [...sequentialPalette].reverse() : [...sequentialPalette];
}

/**
 * Ramp resolution shared by every sequential consumer (heatmap, calendar,
 * choropleth): the caller's ramp verbatim when they supplied one, else the
 * default ramp oriented for `scheme`.
 */
export function resolveSequentialRamp(
  custom: readonly string[] | undefined,
  scheme: 'light' | 'dark',
): string[] {
  return custom && custom.length > 0 ? [...custom] : sequentialRampFor(scheme);
}

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
  warning: STATUS_WARNING,
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
  warning: STATUS_WARNING,
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
  // `warning` is completed the same way `series` is: an OPTIONAL slot a spread
  // would otherwise overwrite with `undefined` when the key is present but unset.
  return {
    ...base,
    ...theme,
    series: theme.series ?? base.series,
    warning: theme.warning ?? base.warning,
  };
}

/** Subscribe to a media query. Returns an unsubscribe fn. SSR-safe no-op. */
function watchMedia(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(query);
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

/**
 * Subscribe to prefers-color-scheme changes. Returns an unsubscribe fn.
 * No-op (returns noop) outside the DOM or when matchMedia is unavailable.
 */
export function watchColorScheme(onChange: () => void): () => void {
  return watchMedia('(prefers-color-scheme: dark)', onChange);
}

// --------------------------------------------------------------- forced colors

/** The media query that reports Windows High Contrast / forced-colors mode. */
export const FORCED_COLORS_QUERY = '(forced-colors: active)';

/**
 * CSS system colors used when `forced-colors: active`.
 *
 * These are CSS `<color>` keywords, and a canvas 2D context accepts them as
 * `fillStyle`/`strokeStyle` exactly like any other color — the user agent
 * resolves them against the user's forced palette, which is the only way a
 * canvas can participate in forced-colors mode at all (canvas pixels are not
 * re-mapped by the browser the way DOM colors are).
 *
 * Only three colors are used for SERIES, because a forced-colors palette is
 * small and its guarantees are limited: `CanvasText` (body text), `LinkText`
 * (hyperlinks) and `Highlight` (selection) are the three foreground roles every
 * Windows High Contrast theme defines and keeps distinguishable from `Canvas`.
 * Series past the third are separated by the SHAPE channel — dash pattern and
 * marker shape — exactly as series past palette slot 8 are in normal mode (see
 * `model.ts#seriesDash`). Deriving more "hues" from system colors would be
 * inventing contrast guarantees the platform does not make.
 */
export const forcedColorsPalette: string[] = ['CanvasText', 'LinkText', 'Highlight'];

/** True when the user agent reports forced-colors mode. SSR-safe. */
export function forcedColorsActive(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(FORCED_COLORS_QUERY).matches;
  } catch {
    return false;
  }
}

/** Subscribe to forced-colors changes. Returns an unsubscribe fn. */
export function watchForcedColors(onChange: () => void): () => void {
  return watchMedia(FORCED_COLORS_QUERY, onChange);
}

/**
 * Re-express a theme in CSS system colors for `forced-colors: active`.
 *
 * Forced colors is a USER setting that deliberately overrides authored color,
 * so it wins over `theme: 'dark'` and over a fully custom `Theme` object alike —
 * the same way it wins over author CSS. `fontFamily`/`fontSize` and
 * `colorScheme` are preserved: forced colors replaces the palette, not the
 * typography, and the scheme still selects the sequential ramp's direction
 * (`sequentialRampFor`) for consumers that ask for it.
 *
 * `up`/`down`/`warning` collapse to `CanvasText`, which is exactly why the
 * financial types encode rise/fall with a redundant FILL channel (hollow rising
 * bodies) rather than with color alone — under forced colors, color carries
 * nothing. A gauge's bands lose their separation for the same reason; a forced
 * palette has three foreground roles, and spending one on "caution" would be
 * inventing a guarantee the platform does not make.
 */
export function forcedColorsTheme(base: Theme): Theme {
  return {
    ...base,
    surface: 'Canvas',
    textPrimary: 'CanvasText',
    textSecondary: 'CanvasText',
    textMuted: 'GrayText',
    gridline: 'GrayText',
    axisLine: 'CanvasText',
    series: [...forcedColorsPalette],
    up: 'CanvasText',
    down: 'CanvasText',
    neutral: 'GrayText',
    warning: 'CanvasText',
    forcedColors: true,
  };
}
