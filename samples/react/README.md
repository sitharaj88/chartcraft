# Northwind Cloud — React sample

The same single-page SaaS analytics dashboard as [`samples/vanilla`](../vanilla),
rebuilt with **`@chartcraft/react` + `@chartcraft/core` installed from the npm
registry**. No workspace link, no relative path into `packages/` — this is the
"does it actually work for someone who runs `npm install @chartcraft/react`"
proof.

> Northwind Cloud is a fictional product. Every figure is synthetic and
> deterministic.

The two apps render **the same pixels**. `src/data.ts` and `src/styles.css` are
byte-identical copies of the vanilla sample's, and a full-page diff of the two
production builds at 1440px and 390px differs only in the footer line
(`@chartcraft/core` → `@chartcraft/react`) — 0.03% of pixels, document heights
equal to the pixel. That visual identity across frameworks is the point of the
exercise: what changes between the ports is the *code*, not the dashboard.

---

## Run it

Node ≥ 18.

```bash
cd samples/react
npm install      # pulls @chartcraft/react + @chartcraft/core ^0.3.0 from the registry
npm run dev      # http://localhost:5174
```

```bash
npm run build    # tsc --noEmit && vite build  → dist/
npm run preview  # serve dist/
```

Confirm the dependencies really came from the registry (a linked workspace copy
would print `-> ./../../packages/react`):

```bash
npm ls @chartcraft/react @chartcraft/core
# @chartcraft/sample-react@0.1.0
# +-- @chartcraft/core@0.3.0
# `-- @chartcraft/react@0.3.0
#   `-- @chartcraft/core@0.3.0 deduped
```

…and that the lockfile points at the registry:

```bash
grep resolved package-lock.json | grep chartcraft
# "resolved": "https://registry.npmjs.org/@chartcraft/core/-/core-0.3.0.tgz",
# "resolved": "https://registry.npmjs.org/@chartcraft/react/-/react-0.3.0.tgz",
```

This directory is deliberately **not** an npm workspace — the root `workspaces`
field is `packages/*` only — so it resolves its own `node_modules` from the
registry.

---

## Files

```
samples/react/
  package.json              deps: @chartcraft/react + @chartcraft/core ^0.3.0 (registry)
  index.html                just <div id="root"> — the page is React's
  tsconfig.json             strict, bundler resolution, react-jsx
  vite.config.ts
  src/
    main.tsx                createRoot + StrictMode; imports the stylesheet
    App.tsx                 state, layout, the 12 charts
    specs.ts                chartSpecs(data, scheme) — options as a pure function
    components/
      TopBar.tsx            brand, range control, Export CSV, theme toggle
      StatTile.tsx          one KPI: figure, delta chip, <SparklineChart>
      ChartCard.tsx         card chrome — <h2>, subtitle, optional action slot
      Inspector.tsx         the pointclick destination
    hooks/
      useTheme.ts           data-theme on <html> + theme.up/down → CSS vars
    data.ts                 ALL data, deterministic          ← verbatim from samples/vanilla
    styles.css              ALL styling, framework-agnostic  ← verbatim from samples/vanilla
  README.md
```

---

## What it demonstrates

Nine chart forms, each chosen for its question — see the
[vanilla README](../vanilla/README.md#charts--nine-forms-each-chosen-for-its-question)
for the full rationale table. In short: a hero `line` (MRR by segment, on one
y-axis) with an **annotation**, **brush zoom** and **`dataLabels: 'last'`**; a
`gauge` for capacity against named thresholds; a `sankey` for the branching
acquisition flow; a `treemap` for product mix; a `heatmap` for support load; a
stacked `bar` for segment revenue; a `choropleth` over a tiny inline synthetic
FeatureCollection; a `boxplot` for contract-value spread; and four `sparkline`
KPI tiles.

Interactivity, all verified headlessly against the production build:

- **Theme toggle** re-themes all 12 charts (every canvas repaints; none blanks).
- **Date range** (30d / 90d / 12m) swaps the dataset — all 12 canvases update,
  the subtitles and KPI figures follow.
- **`pointclick` → Inspector**, reporting whether the event came from **pointer
  or keyboard** (keyboard events carry `clientX === clientY === -1`).
- **Brush-zoom** the hero chart reveals a **Reset zoom** button, which hides
  again once the window is cleared.
- **Export CSV** downloads `northwind-mrr-<range>.csv` via `exportData()`.

Accessibility is unchanged from the vanilla sample: real `header`/`main`/`footer`
landmarks, one `h1`, nine card `h2`s in the document outline, `aria-pressed` on
both controls, visible focus rings, `prefers-reduced-motion` honoured — and
`a11y.title` on **all 12** charts, so no canvas is ever an unlabeled box.

---

## What's React-specific, and what's shared

**Shared with every port, unchanged:**

- `src/data.ts` and `src/styles.css` — byte-identical copies. They import
  nothing framework-specific and touch no DOM.
- The *shape* of the app: chart options are a pure function of `(data, scheme)`;
  `data-theme` on `<html>` is the single source of truth for the theme; charts
  are created once and updated, never torn down and rebuilt.

**React-specific:**

- **Typed components, not `createChart`.** `<LineChart>`, `<SankeyChart>`,
  `<TreemapChart>`, `<GaugeChart>`, `<ChoroplethChart>`, `<HeatmapChart>`,
  `<BarChart>`, `<BoxplotChart>`, `<SparklineChart>` — each carries its own
  `type`, so a spec can only be spread into the component that matches it.
  `ChartSpec` in `specs.ts` is `Omit<ChartOptions, 'type'>` for exactly that
  reason.
- **Handler props, not `chart.on(...)`.** `onPointClick` and `onZoom` replace
  the vanilla app's manual subscribe/unsubscribe bookkeeping. There is no
  teardown code here at all — the wrapper destroys the chart on unmount.
- **`useMemo` is load-bearing, not an optimisation.** The wrapper diffs option
  props *by identity*, one `ChartOptions` key at a time. `chartSpecs()` is
  memoised on `[data, scheme]` so every nested option object keeps its
  reference between renders; without that, every keystroke-level re-render
  would push a fresh `data` object into `chart.update()`. **Build new objects —
  never mutate a spec in place**, or the diff will not see the change.
- **The Inspector is a pure render of state**, not DOM built by hand. It also
  resolves the series swatch from `specs` rather than from a live chart
  instance, so no chart ref is needed for it.
- **One `ref`, for one reason.** `exportData()` lives on the instance, so the
  hero chart takes a `ref<ChartInstance>`. Everything else is props.
- **Conditional rendering replaces `hidden`.** The Reset-zoom button and the
  theme icons are rendered or not rendered. The vanilla sample has to carry a
  `svg[hidden] { display: none }` rule because the HTML `hidden` attribute does
  not apply to SVG elements; that footgun simply does not arise here.
- **`StrictMode` is on.** The wrapper's mount effect survives React 18's
  double-invoke: exactly one canvas per container in dev.

**One thing to know:** value re-exports live in `@chartcraft/core`, not the
wrapper. `@chartcraft/react` re-exports core's *types* (`ChartOptions`,
`PointEvent`, …) but not its *values*, so `version`, `lightTheme`, `darkTheme`
and `categoricalPalette` are imported from `@chartcraft/core` directly — which
is why both packages are direct dependencies.
