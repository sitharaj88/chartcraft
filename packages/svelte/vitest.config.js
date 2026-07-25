import { defineConfig } from 'vitest/config';

// Logic-only tests (plain JS helpers). Compiling .svelte files in vitest would
// require plugins that are intentionally not part of this repo's toolchain.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
