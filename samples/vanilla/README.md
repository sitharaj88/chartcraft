# Northwind Cloud — vanilla TypeScript sample

A realistic single-page SaaS analytics dashboard built with **`@chartcraft/core`
installed from the npm registry**. No workspace link, no relative path into
`packages/` — this is the "does it actually work for someone who runs
`npm install @chartcraft/core`" proof.

> Northwind Cloud is a fictional product. Every figure is synthetic and
> deterministic.

---

## Run it

Node ≥ 18.

```bash
cd samples/vanilla
npm install      # pulls @chartcraft/core ^0.3.0 from the registry
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tsc --noEmit && vite build  → dist/
npm run preview  # serve dist/ at http://localhost:4173
```

Confirm the dependency really came from the registry (a linked workspace copy
would print `-> ./../../packages/core`):

```bash
npm ls @chartcraft/core
# @chartcraft/sample-vanilla@0.1.0
# `-- @chartcraft/core@0.3.0
```

This directory is deliberately **not** an npm workspace — the root
`workspaces` field is `packages/*` only — so it resolves its own
`node_modules` from the registry.

---

## Files

```
samples/vanilla/
  package.json     deps: @chartcraft/core ^0.3.0 (registry)
  index.html       the shell: landmarks, top bar, card scaffolding
  tsconfig.json    strict, bundler resolution
  vite.config.ts
  src/main.ts      app bootstrap + chart wiring   ← the only framework-specific file
  src/data.ts      ALL data, deterministic        ← copied verbatim by the ports
  src/styles.css   ALL styling, framework-agnostic ← copied verbatim by the ports
  README.md
```

`data.ts` and `styles.css` are shared verbatim with the React, Vue, Svelte and
Angular ports of this sample. They import nothing framework-specific and touch
no DOM, so a port only has to re-express `main.ts` and `index.html`.

---

## What it demonstrates

### Charts — nine forms, each chosen for its question

| Card | Type | Why this form |
|---|---|---|
| Recurring revenue (hero) | `line` | Change over time, two segments on **one** y-axis. A monthly-revenue split is exactly where dual axes tempt people; this is the counter-example. |
| Platform capacity | `gauge` | One value against a **hard ceiling with named thresholds** — the only case where a gauge beats a stat tile. |
| Acquisition flow | `sankey` | The funnel *branches* (bounced / stalled / lapsed). A funnel chart shows that users dropped out; only a Sankey shows where they went. |
| Product mix | `treemap` | 11 leaves under 4 parents — area carries the hierarchy in one glance where a bar chart would need nesting or a second chart. |
| Support load | `heatmap` | Two categorical dimensions × one magnitude (weekday × 4-hour block). The *pattern* is the finding, not any single cell. |
| Revenue by segment | `bar` (stacked) | Both the total and the mix matter across a handful of periods — the one case where stacking beats grouping. |
| Territory coverage | `choropleth` | Geography *is* the question. Topology is a **tiny inline synthetic FeatureCollection** in `data.ts` — nothing fetched, no atlas bundled. |
| Contract value | `boxplot` | Mean ACV is the most misleading number on a SaaS dashboard (enterprise deals are a long right tail). Comparing **spread** is what a boxplot exists for, and it's the only distribution on the board. |
| 4 × KPI tiles | `sparkline` | Shape beside a headline number — the tile text carries the value, the sparkline carries the trend. |

Candlestick was deliberately **swapped for boxplot**: a stock-style OHLC mark
has no honest referent on a revenue-and-product dashboard, whereas contract-value
spread is a question this product genuinely has.

### Cross-cutting features

- **`annotations`** — a dashed reference line marks the Atlas 2.0 launch on the
  hero chart. The bend in the Enterprise line is the whole story; without the
  marker the chart poses a question it doesn't answer.
- **`zoom`** — brush-drag on the hero chart (90 daily points don't fit legibly).
  A **Reset zoom** button appears only once there's something to reset, driven by
  the `zoom` event.
- **`dataLabels`** with `select: 'last'` — direct value labels at the line ends,
  so the reader doesn't trace back to the axis. Selectivity is the point: a label
  on every point is noise.
- **`exportData()`** — the **Export CSV** button downloads exactly the chart's
  accessible data table, so the CSV and what a screen reader reads can never
  disagree (and unlike the DOM table, the export is never row-capped).

### Interactivity

- **Date range** (30d / 90d / 12m) — real `<button aria-pressed>`s that swap the
  dataset and `update()` every chart. Verified: the hero chart's data table goes
  12 rows → 30 rows with different dates.
- **Theme toggle** — one source of truth. `data-theme` on `<html>` drives both
  the CSS custom properties and each chart's `theme` option via
  `chart.update({ theme })`.
- **`pointclick` → Inspector panel** — clicking (or Tab + arrow keys + Enter) on
  the revenue line, the segment bars, the heatmap or the contract boxes fills a
  visible detail panel. It reports whether the event came from **pointer or
  keyboard** (keyboard events carry `clientX === clientY === -1`).
- **Teardown** — every chart is `destroy()`ed and every event unsubscribed on
  `pagehide` and on Vite HMR dispose.

### Design & accessibility

- **No hand-picked series colours.** Every mark takes its colour from the
  library's validated categorical palette; the app only sets *chrome* accents
  (ChartCraft blue `#2a78d6` → violet `#4a3aa7`).
- **Delta chips use `theme.up` / `theme.down`**, applied to CSS custom
  properties at runtime, never invented green/red. The chip tone follows the
  metric's semantics, not the sign: **Churned ARR going up is bad**, and the tile
  carries a `higherIsBetter` flag to say so. Direction is also carried by a ▲/▼
  glyph, so it's never colour alone.
- Real landmarks (`header` / `main` / `footer`), one `h1`, card titles as `h2`
  in the document outline. Card chrome owns the visible title; each chart still
  gets `a11y.title` / `a11y.description`, so the canvas is never an unlabeled box.
- `a11y.table` is left at its default (`'hidden'`) on every chart — never `'off'`.
- Visible focus rings, `aria-pressed` on both controls, `prefers-reduced-motion`
  honoured.
- Responsive 360 → 1920px: the 12-column grid steps to 6 columns, then to one.
  Verified with no horizontal overflow at 390px and 1440px, light and dark.

---

## Notes for the framework ports

1. Copy `src/data.ts` and `src/styles.css` **unchanged**.
2. Mirror the structure of `main.ts`:
   - chart options are a **pure function of `(data, scheme)`** (`chartSpecs()`),
     so mounting and updating consume identical specs and can never disagree;
   - charts are **created once and then `update()`d** — nothing is torn down and
     rebuilt on a theme or range change, which is what keeps transitions
     animated instead of flashing empty cards;
   - `data-theme` on `<html>` remains the single source of truth for the theme.
3. Keep the card `<h2>`s in the markup rather than passing `title` to the chart,
   so headings stay in the document outline.
