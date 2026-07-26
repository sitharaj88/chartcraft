import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

/**
 * Vite + @analogjs/vite-plugin-angular — no `angular.json`, no Angular CLI
 * workspace.
 *
 * Angular components need the real compiler (`ngtsc`): a plain esbuild/TS
 * transpile leaves `@Component` inert at runtime, and JIT cannot see signal
 * `input()`/`output()` declarations at all. This plugin runs ngtsc inside Vite,
 * so the app is genuinely AOT-compiled.
 *
 * The same toolchain builds and tests `packages/angular` itself (see its
 * `vitest.config.ts`), which is why it is the one used here rather than
 * `@angular/build`'s application builder: it keeps this sample the same shape
 * as its four siblings — a plain Vite app with `dev` / `build` / `preview`.
 *
 * `disableTypeChecking: false` is NOT the default and matters: left alone, the
 * plugin collects syntactic diagnostics only, and `{{ noSuchProperty }}` in a
 * template compiles clean. Turning it off is what makes `npm run build` a real
 * `strictTemplates` gate — `tsc --noEmit` cannot see inside template strings.
 */
export default defineConfig({
  plugins: [angular({ tsconfig: './tsconfig.json', disableTypeChecking: false })],
  // Relative base so `npm run preview` and any static host (including a
  // sub-path deploy) both work without further configuration.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5175,
  },
});
