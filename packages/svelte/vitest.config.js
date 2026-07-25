import { defineConfig } from 'vitest/config';

// Default environment is `node` (the helper/source-shape suite). The component
// suite opts into jsdom per file via `@vitest-environment jsdom` and compiles
// the .svelte sources in-memory (test/loader.js), because the repo ships no
// Svelte vite/vitest plugin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
