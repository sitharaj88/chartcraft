---
layout: home

hero:
  name: ChartCraft
  text: World-class charts for the modern web
  tagline: A zero-dependency, framework-agnostic charting core with 39 chart types and thin React, Vue, and Svelte wrappers — accessible, colorblind-safe, and fast by default.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Live Examples
      link: /examples/
    - theme: alt
      text: GitHub
      link: https://github.com/OWNER/charts

features:
  - title: 39 chart types
    details: Line, bar and pie through boxplot, violin, candlestick, waterfall, heatmap, calendar, treemap, icicle, circle packing, sankey, gantt, choropleth and network — plus combo mixing. Every type ships with tooltips, keyboard navigation, and a data table.
  - title: Six cross-cutting features
    details: Error bars, trendlines, measured data labels, annotations, zoom/pan/brush, and PNG + CSV export. Each composes with all 39 types, because none of them is a chart type.
  - title: Framework-agnostic core
    details: One canvas-rendered engine with zero runtime dependencies. Every feature lives in @chartcraft/core, so every framework gets exact parity.
  - title: React, Vue & Svelte wrappers
    details: Thin, idiomatic wrappers that own lifecycle, resize observation, and event bridging — and nothing else. Angular and Solid are on the roadmap.
  - title: Accessibility-first
    details: A parallel DOM alongside the canvas — screen-reader data table, full keyboard navigation, live announcements — mapped to WCAG 2.2, with zero configuration. Exports mirror that table exactly.
  - title: Colorblind-safe palette
    details: An 8-slot categorical palette validated pairwise under CVD simulation, in light and dark mode. Color follows series identity, never rank.
  - title: Built for scale
    details: Canvas rendering, allocation-free hot paths, and LTTB downsampling that re-runs inside the zoom window — so a million points still show real detail.
  - title: Deterministic by rule
    details: No Math.random() in any layout. Word clouds, circle packs and force-directed graphs are seeded, so every render is reproducible and testable.
  - title: TypeScript strict, zero deps
    details: Written in strict TypeScript against a published API contract, with an experimental decorator API for your own overlays. ESM, CJS, and full type declarations.
---

<div class="home-demo">
  <ClientOnly>
    <DemoHero />
  </ClientOnly>
</div>
