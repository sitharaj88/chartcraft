/**
 * Northwind Cloud — Angular entry point.
 *
 * Two things worth noticing, both of which are the whole point of this sample:
 *
 *   1. **No NgModule.** `bootstrapApplication` takes the standalone root
 *      component directly; every component in `src/` is standalone and declares
 *      its own `imports`.
 *   2. **No zone.js.** `provideZonelessChangeDetection()` is the only change
 *      detection provider, and `zone.js` is not a dependency of this app —
 *      there is no `import 'zone.js'` here and no polyfill entry in
 *      `index.html`. `@chartcraft/angular` never touches `NgZone`, so the
 *      charts, their `ResizeObserver`, and their `pointclick`/`zoom` outputs
 *      all work under signals-only change detection.
 *
 * The stylesheet is imported here, exactly as in the Svelte and React ports —
 * it is copied verbatim from `samples/vanilla` and owns all the design.
 */
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app';
import './styles.css';

void bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideBrowserGlobalErrorListeners()],
});
