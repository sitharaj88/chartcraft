import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Lets <script lang="ts"> work in .svelte files (types are stripped by esbuild;
  // svelte-check does the actual type checking).
  preprocess: vitePreprocess(),
};
