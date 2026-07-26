/**
 * Northwind Cloud — the theme composable.
 *
 * ONE source of truth: `data-theme` on `<html>` drives both the CSS custom
 * properties in `styles.css` and the ChartCraft `theme` option every chart
 * spec reads. Nothing else is allowed an opinion about light vs dark.
 *
 * Packaging this as a composable is the Vue-idiomatic answer to the vanilla
 * sample's module-scope `let scheme` + `applyScheme()` pair: same single
 * source of truth, but reactive, so every `computed` spec re-derives itself.
 */
import { ref, watchEffect } from 'vue';
import { darkTheme, lightTheme } from '@chartcraft/core';

import type { Scheme } from './specs';

export function useTheme() {
  const scheme = ref<Scheme>(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  watchEffect(() => {
    const next = scheme.value;
    document.documentElement.dataset.theme = next;

    // The delta chips borrow the CHARTS' own up/down semantics rather than
    // hand-picked green and red, so a theme change can never desynchronise the
    // tiles from the marks.
    const t = next === 'dark' ? darkTheme : lightTheme;
    const root = document.documentElement.style;
    root.setProperty('--delta-up', t.up);
    root.setProperty('--delta-down', t.down);
  });

  const toggleTheme = (): void => {
    scheme.value = scheme.value === 'dark' ? 'light' : 'dark';
  };

  return { scheme, toggleTheme };
}
