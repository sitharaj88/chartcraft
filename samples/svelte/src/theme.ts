/**
 * Theme — ONE source of truth.
 *
 * `data-theme` on <html> drives the CSS custom properties in `styles.css`;
 * the same `Scheme` value is handed to every chart as its `theme` option (see
 * `specs.ts`). A single `$effect` in App.svelte keeps the document in sync
 * with the state variable, so nothing can drift.
 */

import { darkTheme, lightTheme } from '@chartcraft/core';

export type Scheme = 'light' | 'dark';

/** Initial scheme, from the OS preference. */
export function preferredScheme(): Scheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Side-effect half of the theme: the document attribute, plus the delta-chip
 * colours.
 *
 * The chips borrow the CHARTS' own up/down semantics rather than hand-picked
 * green and red, so a theme change can never desynchronise the tiles from the
 * marks.
 */
export function applyScheme(scheme: Scheme): void {
  document.documentElement.dataset.theme = scheme;

  const t = scheme === 'dark' ? darkTheme : lightTheme;
  const root = document.documentElement.style;
  root.setProperty('--delta-up', t.up);
  root.setProperty('--delta-down', t.down);
}
