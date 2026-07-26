/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

/**
 * Angular components need the real Angular compiler (`ngtsc`) — a plain
 * esbuild/TS transpile leaves `@Component` inert at runtime, and JIT cannot see
 * signal `input()`/`output()` declarations at all. `@analogjs/vite-plugin-angular`
 * runs ngtsc inside Vite, so the specs execute genuinely AOT-compiled code.
 *
 * No zone.js: the suite runs zoneless (`provideZonelessChangeDetection`), which
 * is exactly how the shipped package is meant to be consumed.
 */
export default defineConfig({
  plugins: [angular({ tsconfig: './tsconfig.spec.json' })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
