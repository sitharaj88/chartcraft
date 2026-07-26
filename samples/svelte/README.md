# Northwind Cloud — Svelte sample

The same single-page SaaS analytics dashboard as [`samples/vanilla`](../vanilla),
re-expressed in **Svelte 5**, built with **`@chartcraft/svelte` + `@chartcraft/core`
installed from the npm registry**. No workspace link, no relative path into
`packages/` — this is the "does it actually work for someone who runs
`npm install @chartcraft/svelte`" proof.

> Northwind Cloud is a fictional product. Every figure is synthetic and
> deterministic.

---

## Run it

Node ≥ 18.

```bash
cd samples/svelte
npm install      # pulls @chartcraft/svelte + @chartcraft/core ^0.3.0 from the registry
npm run dev      # http://localhost:5173
```

```bash
npm run build    # svelte-check && vite build  → dist/
npm run preview  # serve dist/
```

Confirm the dependencies really came from the registry (a linked workspace copy
would print `-> ./../../packages/svelte`):

```bash
npm ls @chartcraft/svelte @chartcraft/core
# @chartcraft/sample-svelte@0.1.0
# +-- @chartcraft/core@0.3.0
# `-- @chartcraft/svelte@0.3.0
#   `-- @chartcraft/core@0.3.0 deduped
```

…and that the lockfile points at the registry:

```bash
grep -A2 '"node_modules/@chartcraft' package-lock.json | grep resolved
# "resolved": "https://registry.npmjs.org/@chartcraft/core/-/core-0.3.0.tgz",
# "resolved": "https://registry.npmjs.org/@chartcraft/svelte/-/svelte-0.3.0.tgz",
```

This directory is deliberately **not** an npm workspace — the root `workspaces`
field is `packages/*` only — so it resolves its own `node_modules` from the
registry.

---

## Files

```
samples/svelte/
  package.json          deps: @chartcraft/svelte + @chartcraft/core ^0.3.0 (registry)
  index.html            document shell + #app mount point
  svelte.config.js      vitePreprocess, so <script lang="ts"> works
  vite.config.ts        @sveltejs/vite-plugin-svelte
  tsconfig.json         strict, bundler resolution
  src/
    main.ts             mount(App) + the stylesheet import
    App.svelte          state, layout, the nine cards          ← the app
    specs.ts            chartSpecs(data, scheme) — pure
    theme.ts            scheme detection + document side-effects
    selection.ts        the Inspector's model + formatters
    lib/
      TopBar.svelte     brand, range control, export, theme toggle
      StatTile.svelte   one KPI tile (figure + delta chip + sparkline)
      ChartCard.svelte  card chrome: <h2>, subtitle, optional head action
      Inspector.svelte  the pointclick destination
    data.ts             ALL data, deterministic      ← copied VERBATIM from samples/vanilla
    styles.css          ALL styling, plain CSS       ← copied VERBATIM from samples/vanilla
  README.md
```

`data.ts` and `styles.css` are **byte-identical** to the vanilla sample's
(`git hash-object` matches). They import nothing framework-specific and touch no
DOM, so the port only had to re-express `main.ts` and `index.html`. Rendered
output is pixel-identical to the vanilla build at 1440 × light apart from the
footer's package name.

---

## Why Svelte 5

`@chartcraft/svelte` ships **source `.svelte` components written in Svelte 4
syntax** (`export let`, `createEventDispatcher`) and declares `"svelte": ">=4"`
as its peer. That makes Svelte 5 the interesting question, so it was verified
rather than assumed — a throwaway probe app was built and driven headlessly
before a line of the dashboard was written:

| Check | Result |
|---|---|
| All 40 wrapper `.svelte` files compile under Svelte 5 (`5.56`, `vite-plugin-svelte` 4) | ✅ no errors, **no deprecation warnings** |
| `svelte-check` against the hand-written `index.d.ts` (`SvelteComponent<Props, Events, Slots>`) | ✅ 0 errors / 0 warnings, `on:` payloads typed |
| `on:pointclick` / `on:zoom` fired from a **runes-mode** parent onto a **legacy-mode** wrapper child | ✅ both fire with correct `event.detail` |
| `bind:this` + `getChart()` → `exportData()` / `zoomTo()` | ✅ returns the live core instance |
| Runtime `console` output | ✅ clean |

So this sample is Svelte 5: `$state` / `$derived` / `$effect`, `{#snippet}` +
`{@render}` instead of slots, and callback props instead of
`createEventDispatcher` for its *own* components. The one place Svelte 4 syntax
survives is `on:pointclick=` / `on:zoom=` on the chart components, because that
is the wrapper's event surface — Svelte 5 supports listening to legacy component
events from a runes-mode parent, which is exactly what makes the published
package usable as-is.

If you are still on Svelte 4, drop `svelte` to `^4.2` and
`@sveltejs/vite-plugin-svelte` to `^3.1`; the only source changes needed are the
runes (`export let` + `$:`), snippets (`<slot>`), and `new App({ target })`
instead of `mount(App, { target })`. The chart usage does not change at all.

---

## What it demonstrates

### Charts — nine forms, each chosen for its question

| Card | Component | Why this form |
|---|---|---|
| Recurring revenue (hero) | `<LineChart>` | Change over time, two segments on **one** y-axis. |
| Platform capacity | `<GaugeChart>` | One value against a **hard ceiling with named thresholds**. |
| Acquisition flow | `<SankeyChart>` | The funnel *branches* — only a Sankey shows where the drop-offs went. |
| Product mix | `<TreemapChart>` | 11 leaves under 4 parents; area carries the hierarchy in one glance. |
| Support load | `<HeatmapChart>` | Two categorical dimensions × one magnitude; the *pattern* is the finding. |
| Revenue by segment | `<BarChart stacked>` | Total **and** mix matter across a handful of periods. |
| Territory coverage | `<ChoroplethChart>` | Geography *is* the question. Topology is a tiny inline synthetic FeatureCollection in `data.ts` — nothing fetched, no atlas bundled. |
| Contract value | `<BoxplotChart>` | Mean ACV is the most misleading number on a SaaS dashboard; **spread** is the finding. |
| 4 × KPI tiles | `<SparklineChart>` | Shape beside a headline number. |

The per-type components are used throughout rather than the generic `<Chart>`,
so `type` is never spelled out and the specs stay `Omit<ChartOptions, 'type'>`.

### Cross-cutting features

- **`annotations`** — a dashed reference line marks the Atlas 2.0 launch on the
  hero chart.
- **`zoom`** — brush-drag on the hero chart. A **Reset zoom** button appears only
  once there is something to reset, driven by `on:zoom`, and hides again on reset.
- **`dataLabels`** with `select: 'last'` — direct value labels at the line ends.
- **`exportData()`** — **Export CSV** reaches the live chart through
  `bind:this` → `getChart()` and downloads exactly the chart's accessible data
  table (verified: 31 rows at 30d, 13 at 12m).

### Interactivity

- **Date range** (30d / 90d / 12m) — real `<button aria-pressed>`s that swap the
  dataset. Every chart animates to the new data; nothing remounts.
- **Theme toggle** — one source of truth. A single `$effect` writes `data-theme`
  on `<html>` (driving the CSS custom properties) and the same `Scheme` value
  flows into every chart's `theme` option through `chartSpecs()`.
- **`pointclick` → Inspector** — clicking (or Tab + arrow keys + Enter) on the
  revenue line, the support heatmap, the segment bars or the contract boxes fills
  a visible detail panel that reports whether the event came from **pointer or
  keyboard** (keyboard events carry `clientX === clientY === -1`).
- **Teardown** — nothing to write. Each wrapper component `destroy()`s its chart
  and drops its listeners in `onDestroy`, which is the whole point of using the
  wrapper instead of `createChart` in an `onMount`.

### Design & accessibility

- **No hand-picked series colours** — every mark takes the library's validated
  categorical palette; the app only sets *chrome* accents.
- **Delta chips use `theme.up` / `theme.down`**, applied to CSS custom properties
  at runtime. Tone follows the metric's semantics, not the sign (**churn going up
  is bad**), and direction is also carried by a ▲/▼ glyph.
- Real landmarks (`header` / `main` / `footer`), one `h1`, card titles as `h2` in
  the document outline. Card chrome owns the visible title; all **12** charts
  still get `a11y.title` / `a11y.description`, so no canvas is an unlabeled box.
- Visible focus rings, `aria-pressed` on both controls, `prefers-reduced-motion`
  honoured, `aria-live="polite"` on the Inspector card.
- Responsive 360 → 1920px. Verified with no horizontal overflow at 390px and
  1440px, light and dark.

---

## Svelte-specific vs shared

**Shared, verbatim, with every other port** — `src/data.ts`, `src/styles.css`.
Between them they own all the data and all the design; they are why the five
samples render the same board.

**Shared in spirit, re-expressed here** — `src/specs.ts` is the Svelte port of
the vanilla `chartSpecs()`: still a pure function of `(data, scheme)`, but
returning `Omit<ChartOptions, 'type'>` because the per-type components inject
`type` themselves.

**Genuinely Svelte** —

- `$state` / `$derived` for the four pieces of app state; `specs` is a
  `$derived`, so first render and every re-render consume identical options.
- Passing that derived object as the `options` **prop** is the entire update
  mechanism. The wrapper's `$: if (chart) chart.update(options)` turns a prop
  change into a diffed `update()`, so charts are created once and animated
  thereafter — the vanilla sample's "never tear down and rebuild" rule falls out
  of Svelte's reactivity for free instead of being hand-maintained.
- The KPI `{#each … (kpi.id)}` is **keyed**, which is what stops a range change
  from remounting the four sparklines.
- `{#snippet action()}` for the card's optional head control, `{@render}` in
  `ChartCard`.
- Callback props (`onrange`, `onexport`, `ontoggletheme`) rather than
  `createEventDispatcher`.
- The wrapper's `class` prop puts `card__chart` / `kpi__spark` **on the div
  ChartCraft mounts into**, so there is no extra wrapper element and the chart's
  `ResizeObserver` measures exactly the box the stylesheet sizes.

---

## Notes on `@chartcraft/svelte` 0.3.0

Building a real app against the published package surfaced three rough edges,
none blocking:

1. **`getChart()` is only reachable through `bind:this`.** There is no
   `on:ready` / `onchart` callback, so any code that needs the instance (here:
   `exportData()` and `zoomTo()`) has to hold a component ref *and* tolerate
   `null`. Because `bind:this` lands before the child's `onMount` runs,
   `getChart()` returns `null` if called from a parent's own `onMount` — fine
   for event handlers, a trap for setup code.
2. **The per-type components share one loose props type.** `TypedChartProps.options`
   is `Omit<ChartOptions, 'type'>` for all 40 of them, so
   `<GaugeChart options={{ …, sankey: { … } }} />` type-checks happily. The
   components buy you the right `type` string, not a narrowed options shape.
3. **Events are Svelte-4 component events, so the `on:` directive is mandatory.**
   The modern callback-prop form (`onpointclick={…}`) is not supported — usefully,
   the hand-written `index.d.ts` turns that into a `svelte-check` error rather
   than a silent no-op, but it does mean a Svelte 5 app must keep using the
   deprecated `on:` directive for chart events. Worth knowing ahead of Svelte 6,
   where `on:` is slated for removal.
