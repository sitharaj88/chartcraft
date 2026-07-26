/**
 * useTheme — ONE source of truth for light/dark.
 *
 * `data-theme` on <html> drives the CSS custom properties; the same `scheme`
 * string is handed to every chart as its `theme` option. A React effect is the
 * idiomatic place for the DOM side-effect; the value the components render from
 * is plain state.
 */

import { useCallback, useEffect, useState } from 'react';
import { darkTheme, lightTheme } from '@chartcraft/core';

import type { Scheme } from '../specs';

/** Read once, lazily — `matchMedia` is absent under SSR / jsdom. */
function initialScheme(): Scheme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function useTheme(): { scheme: Scheme; toggle: () => void } {
  const [scheme, setScheme] = useState<Scheme>(initialScheme);

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;

    // The delta chips borrow the CHARTS' own up/down semantics rather than
    // hand-picked green and red, so a theme change can never desynchronise
    // the tiles from the marks.
    const t = scheme === 'dark' ? darkTheme : lightTheme;
    const root = document.documentElement.style;
    root.setProperty('--delta-up', t.up);
    root.setProperty('--delta-down', t.down);
  }, [scheme]);

  const toggle = useCallback(() => {
    setScheme((s) => (s === 'dark' ? 'light' : 'dark'));
  }, []);

  return { scheme, toggle };
}
