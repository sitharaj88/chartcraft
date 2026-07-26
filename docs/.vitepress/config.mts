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
      {
        text: 'Guide',
        link: '/getting-started',
        activeMatch: '^/(getting-started|accessibility|performance|extensibility)',
      },
      { text: 'Concepts', link: '/concepts/data-model', activeMatch: '^/concepts/' },
      { text: 'Features', link: '/features/error-bars', activeMatch: '^/features/' },
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
          { text: 'Extensibility', link: '/extensibility' },
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
        text: 'Features',
        items: [
          { text: 'Error bars', link: '/features/error-bars' },
          { text: 'Trendlines', link: '/features/trendlines' },
          { text: 'Data labels', link: '/features/data-labels' },
          { text: 'Annotations', link: '/features/annotations' },
          { text: 'Zoom, pan & brush', link: '/features/zoom-pan-brush' },
          { text: 'Export', link: '/features/export' },
        ],
      },
      {
        text: 'Frameworks',
        items: [
          { text: 'React', link: '/frameworks/react' },
          { text: 'Vue', link: '/frameworks/vue' },
          { text: 'Svelte', link: '/frameworks/svelte' },
          { text: 'Angular', link: '/frameworks/angular' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Overview', link: '/examples/' },
          {
            text: 'Trends & comparison',
            items: [
              { text: 'Line', link: '/examples/line' },
              { text: 'Area', link: '/examples/area' },
              { text: 'Bar', link: '/examples/bar' },
              { text: 'Scatter', link: '/examples/scatter' },
              { text: 'Bubble', link: '/examples/bubble' },
              { text: 'Lollipop', link: '/examples/lollipop' },
              { text: 'Slope', link: '/examples/slope' },
              { text: 'Dumbbell', link: '/examples/dumbbell' },
              { text: 'Range area', link: '/examples/rangearea' },
            ],
          },
          {
            text: 'Part-to-whole & composition',
            items: [
              { text: 'Pie & donut', link: '/examples/pie' },
              { text: 'Funnel', link: '/examples/funnel' },
              { text: 'Pyramid', link: '/examples/pyramid' },
              { text: 'Marimekko', link: '/examples/marimekko' },
              { text: 'Streamgraph', link: '/examples/streamgraph' },
            ],
          },
          {
            text: 'Statistical',
            items: [
              { text: 'Histogram', link: '/examples/histogram' },
              { text: 'Boxplot', link: '/examples/boxplot' },
              { text: 'Violin', link: '/examples/violin' },
              { text: 'Parallel coordinates', link: '/examples/parallel' },
            ],
          },
          {
            text: 'Financial & targets',
            items: [
              { text: 'Candlestick & OHLC', link: '/examples/candlestick' },
              { text: 'Waterfall', link: '/examples/waterfall' },
              { text: 'Bullet', link: '/examples/bullet' },
            ],
          },
          {
            text: 'Hierarchy',
            items: [
              { text: 'Treemap', link: '/examples/treemap' },
              { text: 'Sunburst', link: '/examples/sunburst' },
              { text: 'Icicle', link: '/examples/icicle' },
              { text: 'Circle packing', link: '/examples/circlepack' },
            ],
          },
          {
            text: 'Matrix & calendar',
            items: [
              { text: 'Heatmap', link: '/examples/heatmap' },
              { text: 'Calendar', link: '/examples/calendar' },
            ],
          },
          {
            text: 'Radial',
            items: [
              { text: 'Radar', link: '/examples/radar' },
              { text: 'Gauge', link: '/examples/gauge' },
              { text: 'Radial bar', link: '/examples/radialbar' },
              { text: 'Rose', link: '/examples/rose' },
            ],
          },
          {
            text: 'Flow & schedule',
            items: [
              { text: 'Sankey', link: '/examples/sankey' },
              { text: 'Gantt', link: '/examples/gantt' },
            ],
          },
          {
            text: 'Geographic & graph',
            items: [
              { text: 'Choropleth', link: '/examples/choropleth' },
              { text: 'Network', link: '/examples/network' },
            ],
          },
          {
            text: 'Micro, combo & text',
            items: [
              { text: 'Sparkline', link: '/examples/sparkline' },
              { text: 'Combo', link: '/examples/combo' },
              { text: 'Word cloud', link: '/examples/wordcloud' },
            ],
          },
          {
            text: 'Showcases',
            items: [
              { text: 'Large data', link: '/examples/large-data' },
              { text: 'Events', link: '/examples/events' },
            ],
          },
        ],
      },
      {
        text: 'API',
        items: [
          { text: '@chartcraft/core', link: '/api/core' },
          { text: 'Decorator API', link: '/extensibility' },
        ],
      },
      {
        text: 'Internal',
        collapsed: true,
        items: [{ text: 'API contract (spec)', link: '/api-contract' }],
      },
    ],

    search: { provider: 'local' },

    outline: { level: [2, 3] },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sitharaj88/chartcraft' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/sitharaj08' },
      {
        // VitePress has no built-in "personal site" icon — a minimal globe,
        // matching the stroke weight of the built-in icon set. VPSocialLink's
        // own stylesheet sets `svg { fill: currentColor }` on the root <svg>
        // (so built-in filled icons pick up the theme color), which beats a
        // `fill="none"` attribute on that same root and then INHERITS down to
        // children with no fill of their own — silently turning a stroke-only
        // icon into a solid disc. Fix: repeat `fill="none"` on every child
        // shape too, so each has its own specified value rather than an
        // inherited one, regardless of what the ancestor's fill resolves to.
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" fill="none"/><path fill="none" d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9Z"/></svg>',
        },
        link: 'https://sitharaj.in',
        ariaLabel: 'Sitharaj — personal website',
      },
      {
        // No built-in "Buy Me a Coffee" icon either — a simple cup glyph.
        // Same per-child fill="none" fix as the globe icon above.
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path fill="none" d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path fill="none" d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path fill="none" d="M8 3c-.6.7-.6 1.3 0 2M12 3c-.6.7-.6 1.3 0 2"/></svg>',
        },
        link: 'https://www.buymeacoffee.com/sitharaj88',
        ariaLabel: 'Buy Sitharaj a coffee',
      },
    ],

    footer: {
      message:
        'Released under the MIT License. Built by <a href="https://sitharaj.in" target="_blank" rel="noopener">Sitharaj</a> — ' +
        '<a href="https://github.com/sitharaj88" target="_blank" rel="noopener">GitHub</a> · ' +
        '<a href="https://www.linkedin.com/in/sitharaj08" target="_blank" rel="noopener">LinkedIn</a> · ' +
        '<a href="https://www.buymeacoffee.com/sitharaj88" target="_blank" rel="noopener">Buy me a coffee</a>',
      copyright: 'Copyright © ChartCraft contributors',
    },
  },

  markdown: {
    /**
     * Wrap every markdown table in its own frame + scroller.
     *
     * VitePress's default makes the `<table>` itself the horizontal scroll
     * container. That works, but it costs a sticky header — a `position:
     * sticky` `<th>` can only stick to its nearest scrollport, and there the
     * scrollport is the table. Moving the overflow out to a wrapper lets the
     * table stay `display: table` and fit the column by wrapping cell text on
     * desktop (so the header can stick to the page under the navbar), while
     * the wrapper takes over as the scroller on narrow screens.
     */
    config: (md) => {
      const renderToken = (tokens: unknown[], idx: number, options: unknown, self: any) =>
        self.renderToken(tokens, idx, options);

      md.renderer.rules.table_open = (tokens, idx, options, _env, self) =>
        `<div class="cc-table"><div class="cc-table__scroll">${renderToken(
          tokens,
          idx,
          options,
          self,
        )}`;

      md.renderer.rules.table_close = (tokens, idx, options, _env, self) =>
        `${renderToken(tokens, idx, options, self)}</div></div>`;
    },
  },

  vite: {
    ssr: {
      // Workspace-linked packages must be bundled for the SSR build.
      noExternal: ['@chartcraft/vue', '@chartcraft/core'],
    },
  },
});
