import { defineConfig } from 'vitepress';

// GitHub Pages base path: derived from the repository name in CI
// (project pages deploy under /<repo>/), overridable via DOCS_BASE.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  title: 'ChartCraft',
  description: 'World-class charts for the modern web',
  base: process.env.DOCS_BASE ?? (repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/'),

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started', activeMatch: '^/(getting-started|accessibility|performance)' },
      { text: 'Concepts', link: '/concepts/data-model', activeMatch: '^/concepts/' },
      { text: 'Frameworks', link: '/frameworks/react', activeMatch: '^/frameworks/' },
      { text: 'API', link: '/api/core', activeMatch: '^/api' },
      { text: 'Examples', link: '/examples/', activeMatch: '^/examples/' },
      { text: 'Roadmap', link: '/roadmap', activeMatch: '^/roadmap' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Accessibility', link: '/accessibility' },
          { text: 'Performance', link: '/performance' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Data model', link: '/concepts/data-model' },
          { text: 'Scales and axes', link: '/concepts/scales-and-axes' },
          { text: 'Theming', link: '/concepts/theming' },
          { text: 'Interactions', link: '/concepts/interactions' },
        ],
      },
      {
        text: 'Frameworks',
        items: [
          { text: 'React', link: '/frameworks/react' },
          { text: 'Vue', link: '/frameworks/vue' },
          { text: 'Svelte', link: '/frameworks/svelte' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Overview', link: '/examples/' },
          { text: 'Line', link: '/examples/line' },
          { text: 'Area', link: '/examples/area' },
          { text: 'Bar', link: '/examples/bar' },
          { text: 'Scatter', link: '/examples/scatter' },
          { text: 'Pie & donut', link: '/examples/pie' },
          { text: 'Large data', link: '/examples/large-data' },
          { text: 'Events', link: '/examples/events' },
        ],
      },
      {
        text: 'API',
        items: [{ text: '@chartcraft/core', link: '/api/core' }],
      },
      {
        text: 'Internal',
        collapsed: true,
        items: [{ text: 'API contract (spec)', link: '/api-contract' }],
      },
    ],

    search: { provider: 'local' },

    outline: { level: [2, 3] },

    socialLinks: [{ icon: 'github', link: 'https://github.com/OWNER/charts' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © ChartCraft contributors',
    },
  },

  vite: {
    ssr: {
      // Workspace-linked packages must be bundled for the SSR build.
      noExternal: ['@chartcraft/vue', '@chartcraft/core'],
    },
  },
});
