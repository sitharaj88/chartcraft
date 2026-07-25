---
layout: home

hero:
  name: ChartCraft
  text: World-class charts for the modern web
  tagline: A zero-dependency, framework-agnostic charting core with 19 chart types and thin React, Vue, and Svelte wrappers — accessible, colorblind-safe, and fast by default.
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
  - title: 19 chart types
    details: From line, bar, and pie to histogram, boxplot, candlestick, waterfall, heatmap, treemap, sunburst, funnel, radar, gauge, sparkline — plus combo mixing. Every type ships with tooltips, keyboard navigation, and a data table.
  - title: Framework-agnostic core
    details: One canvas-rendered engine with zero runtime dependencies. Every feature lives in @chartcraft/core, so every framework gets exact parity.
  - title: React, Vue & Svelte wrappers
    details: Thin, idiomatic wrappers that own lifecycle, resize observation, and event bridging — and nothing else. Angular and Solid are on the roadmap.
  - title: Accessibility-first
    details: A parallel DOM alongside the canvas — screen-reader data table, full keyboard navigation, live announcements — mapped to WCAG 2.2, with zero configuration.
  - title: Colorblind-safe palette
    details: An 8-slot categorical palette validated pairwise under CVD simulation, in light and dark mode. Color follows series identity, never rank.
  - title: Built for scale
    details: Canvas rendering, allocation-free hot paths, and automatic LTTB downsampling keep 100k+ point series smooth.
  - title: TypeScript strict, zero deps
    details: Written in strict TypeScript against a published API contract. ESM, CJS, and full type declarations — and not a single runtime dependency.
---

<div class="home-demo">
  <ClientOnly>
    <DemoHero />
  </ClientOnly>
</div>
