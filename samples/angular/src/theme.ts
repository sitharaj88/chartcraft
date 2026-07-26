/**
 * Theme — ONE source of truth for light/dark.
 *
 * `data-theme` on `<html>` drives the CSS custom properties in `styles.css`;
 * the same `Scheme` value is handed to every chart as its `theme` option (see
 * `specs.ts`). Nothing else is allowed an opinion about light vs dark.
 *
 * A root-provided service holding a `signal` is the Angular-idiomatic answer to
 * the vanilla sample's module-scope `let scheme` + `applyScheme()` pair: same
 * single source of truth, but reactive, so every `computed()` spec re-derives
 * itself and every chart gets a new `options` object.
 *
 * The document side-effect lives in an `effect()` rather than in `toggle()`, so
 * the DOM can never disagree with the signal — however the signal came to
 * change.
 */
import { Injectable, effect, signal } from '@angular/core';
import { darkTheme, lightTheme } from '@chartcraft/core';

export type Scheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeStore {
  /** Read once from the OS preference, then owned by the user's toggle. */
  readonly scheme = signal<Scheme>(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  constructor() {
    effect(() => {
      const next = this.scheme();
      document.documentElement.dataset['theme'] = next;

      // The delta chips borrow the CHARTS' own up/down semantics rather than
      // hand-picked green and red, so a theme change can never desynchronise
      // the tiles from the marks.
      const t = next === 'dark' ? darkTheme : lightTheme;
      const root = document.documentElement.style;
      root.setProperty('--delta-up', t.up);
      root.setProperty('--delta-down', t.down);
    });
  }

  toggle(): void {
    this.scheme.update((s) => (s === 'dark' ? 'light' : 'dark'));
  }
}
