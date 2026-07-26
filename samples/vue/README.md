# Northwind Cloud — Vue 3 sample

A realistic single-page SaaS analytics dashboard built with **`@chartcraft/vue`
and `@chartcraft/core` installed from the npm registry**. No workspace link, no
relative path into `packages/` — this is the "does it actually work for someone
who runs `npm install @chartcraft/vue`" proof.

It is a port of [`samples/vanilla`](../vanilla): same data, same styling, same
board, same interactions — re-expressed as idiomatic Vue 3.

> Northwind Cloud is a fictional product. Every figure is synthetic and
> deterministic.

---

## Run it

Node ≥ 18.

```bash
cd samples/vue
npm install      # pulls @chartcraft/vue + @chartcraft/core ^0.3.0 from the registry
npm run dev      # http://localhost:5174
```

```bash
npm run build    # vue-tsc --noEmit && vite build  → dist/
npm run preview  # serve dist/
```

Confirm the dependencies really came from the registry (a linked workspace copy
would print `-> ./../../packages/vue`):

```bash
npm ls @chartcraft/vue @chartcraft/core
# @chartcraft/sample-vue@0.1.0
# +-- @chartcraft/core@0.3.0
# `-- @chartcraft/vue@0.3.0
#   `-- @chartcraft/core@0.3.0 deduped
```

…and that the lockfile agrees:

```bash
grep resolved package-lock.json | grep chartcraft
#   "resolved": "https://registry.npmjs.org/@chartcraft/core/-/core-0.3.0.tgz",
#   "resolved": "https://registry.npmjs.org/@chartcraft/vue/-/vue-0.3.0.tgz",
```

This directory is deliberately **not** an npm workspace — the root `workspaces`
field is `packages/*` only — so it resolves its own `node_modules` from the
registry.

---

## Files

```
samples/vue/
  package.json                    deps: @chartcraft/vue + @chartcraft/core ^0.3.0 (registry)
  index.html                      just the mount point — the landmarks live in App.vue
  tsconfig.json                   strict, bundler resolution
  vite.config.ts                  @vitejs/plugin-vue
  env.d.ts
  src/
    main.ts                       createApp(App).mount('#app')
    App.vue                       state, computed specs, layout          ← the port of main.ts
    specs.ts                      chart options as pure (data, scheme) fns
    inspector.ts                  pure pointclick → display-row plumbing
    useTheme.ts                   the theme composable (one source of truth)
    components/
      TopBar.vue                  brand · range control · export · theme toggle
      ChartCard.vue               card chrome: <h2>, subtitle, grid span, actions slot
      StatTile.vue                one KPI tile + its sparkline
      Inspector.vue               the pointclick destination
    data.ts                       ALL data, deterministic         ← copied VERBATIM from vanilla
    styles.css                    ALL styling, framework-agnostic ← copied VERBATIM from vanilla
  README.md
```

`data.ts` and `styles.css` are **byte-identical** to `samples/vanilla/src/`
(verify with `sha256sum`). They import nothing framework-specific and touch no
DOM, which is the whole reason all five ports render the same dashboard.

---

## What it demonstrates

### Charts — nine forms, each chosen for its question

| Card | Component | Why this form |
|---|---|---|
| Recurring revenue (hero) | `<LineChart>` | Change over time, two segments on **one** y-axis. |
| Platform capacity | `<GaugeChart>` | One value against a hard ceiling with named thresholds. |
| Acquisition flow | `<SankeyChart>` | The funnel *branches* — only a Sankey shows where the drop-offs went. |
| Product mix | `<TreemapChart>` | 11 leaves under 4 parents; area carries the hierarchy in one glance. |
| Support load | `<HeatmapChart>` | Two categorical dimensions × one magnitude; the *pattern* is the finding. |
| Revenue by segment | `<BarChart :options="{ stacked: true }">` | Total *and* mix over a handful of periods. |
| Territory coverage | `<ChoroplethChart>` | Geography *is* the question. Topology is a tiny inline synthetic FeatureCollection in `data.ts` — nothing fetched, no atlas bundled. |
| Contract value | `<BoxplotChart>` | Mean ACV is the most misleading number on a SaaS dashboard; spread is the story. |
| 4 × KPI tiles | `<SparklineChart>` | Shape beside a headline number. |

### Cross-cutting features

- **`annotations`** — a dashed reference line marks the Atlas 2.0 launch.
- **`zoom`** — brush-drag the hero chart. A **Reset zoom** button appears only
  once there is something to reset, driven by the `@zoom` event.
- **`dataLabels`** with `select: 'last'` — direct value labels at the line ends.
- **`exportData()`** — **Export CSV** downloads exactly the chart's accessible
  data table, reached through a template ref.

### Interactivity

- **Date range** (30d / 90d / 12m) swaps the dataset and updates every chart.
- **Theme toggle** — `data-theme` on `<html>` drives both the CSS custom
  properties and every chart's `theme` option.
- **`@point-click` → Inspector** — click, or Tab + arrow keys + Enter, on the
  revenue line / segment bars / heatmap / contract boxes. The panel reports
  whether the event came from **pointer or keyboard** (keyboard events carry
  `clientX === clientY === -1`).

### Accessibility

Real landmarks (`header` / `main` / `footer`), one `h1`, card titles as `h2`,
`a11y.title` + `a11y.description` on **all twelve** charts, `aria-pressed` on
both controls, `aria-live="polite"` on the Inspector card, visible focus rings,
`prefers-reduced-motion` honoured. No horizontal overflow at 390px or 1440px,
light or dark.

---

## What is Vue-specific vs shared with the other samples

**Shared, unchanged, across all five ports**

- `src/data.ts` and `src/styles.css` — byte-identical copies.
- The *shape* of the app: chart options are a pure function of `(data, scheme)`;
  charts are created once and then `update()`d, never torn down and rebuilt on a
  theme or range change; `data-theme` on `<html>` is the single source of truth.
- Every chart option object, verbatim — `specs.ts` is `main.ts`'s `chartSpecs()`
  split into one exported builder per card.

**Vue-specific**

| Vanilla | Vue |
|---|---|
| `createChart(el, opts)` + `chart.update(opts)` | `<LineChart :options>` — the wrapper deep-watches `options` and routes changes into `chart.update()` |
| `{ type: 'line' }` | the per-type component `<LineChart>`, which injects `type` |
| `chart.on('pointclick', …)` + manual unsubscribe | `@point-click="inspect('mrr', $event)"` |
| `chart.on('zoom', …)` | `@zoom="onZoom"` |
| `charts.get('chart-mrr').exportData()` | `useTemplateRef<ChartExposed>('hero')` → `hero.chart.exportData()` |
| module-scope `let scheme` + `applyScheme()` | the `useTheme()` composable |
| `getData(range)` re-run by hand in `setRange()` | `computed(() => getData(range.value))` |
| `chartSpecs(data, scheme)` re-run by hand | one `computed` per card, keyed on `(data, scheme)` |
| `renderInspector()` DOM rebuild | a `computed` entry + a presentational `<Inspector>` |
| `destroyAll()` on `pagehide` + HMR dispose | the wrapper's `onBeforeUnmount` — nothing to write |
| everything in one `main.ts` | `App.vue` + four presentational components |

**Two deliberate divergences from the vanilla port**, both documented in the
source:

1. **The theme icon actually changes.** The vanilla sample toggles its two
   inline SVGs with `svgEl.hidden = …`, but `hidden` is defined on
   `HTMLElement`, *not* `SVGElement` (`'hidden' in SVGElement.prototype ===
   false`), so the assignment sets a JS expando and never touches the
   attribute — its icon is permanently stuck on the moon. `TopBar.vue` uses
   `v-if`/`v-else`, which does what the vanilla code plainly intends: moon in
   light, sun in dark.

2. **The zoom is re-applied after a theme change.** See the rough edge below.

Everything else is pixel-identical to `samples/vanilla` — a full-page diff at
1440px and 390px, light and dark, differs only in the footer's package name and
that theme icon (≈0.02% of pixels).

---

## Rough edge worth knowing about

`@chartcraft/vue` deep-watches `options` and passes the **whole** object to
`chart.update()`. Core resets the zoom viewport whenever an update carries
`data` — which, through the wrapper, is *every* update, including a theme
change. It does so silently (no `zoom` event), so a naive port loses the user's
brush on a theme toggle and leaves a **Reset zoom** button pointing at nothing.

The vanilla sample never hits this because it can send a partial
(`chart.update({ theme })`). Until the wrapper can diff or forward partials,
the app-level fix is to mirror the window from the `@zoom` event and re-apply
it after the update lands — `App.vue` does this in a `watch(scheme, …,
{ flush: 'post' })`, which is what orders it after the wrapper's own `pre`-flush
watcher. With that in place the zoom survives a theme toggle, exactly as it does
in the vanilla app.
