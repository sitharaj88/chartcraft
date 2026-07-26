import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so `npm run preview` and any static host (including a
  // sub-path deploy) both work without further configuration.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
