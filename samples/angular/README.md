# Northwind Cloud — Angular sample

The same single-page SaaS analytics dashboard as [`samples/vanilla`](../vanilla),
rebuilt with **`@chartcraft/angular` + `@chartcraft/core` installed from the npm
registry**. No workspace link, no relative path into `packages/` — this is the
"does it actually work for someone who runs `npm install @chartcraft/angular`"
proof.

> Northwind Cloud is a fictional product. Every figure is synthetic and
> deterministic.

The five ports render **the same pixels**. `src/data.ts` and `src/styles.css`
are byte-identical copies of the vanilla sample's, and a full-page diff of the
two production builds differs only in the footer line naming the package:

| Comparison | Differing pixels | Document height |
|---|---|---|
| angular vs vanilla @ 1440px light | 428 / 2,954,880 = **0.0145%** | 2052 = 2052 |
| angular vs react @ 1440px light | 384 / 2,954,880 = **0.0130%** | 2052 = 2052 |
| angular vs vanilla @ 390px light | 127 / 1,663,350 = **0.0076%** | 4265 = 4265 |
| angular vs vanilla @ 1440px dark | 488 / 2,954,880 = **0.0165%** | 2052 = 2052 |

Every differing pixel sits in a single 11px-tall band at the bottom-right of the
page — `x[1214..1394] y[2006..2016]`, which is exactly
`@chartcraft/core` → `@chartcraft/angular` in the footer. Nothing else on the
board moves.

---

## Run it

Node ≥ 20.19 (Angular 21's floor).

```bash
cd samples/angular
npm install      # pulls @chartcraft/angular + @chartcraft/core ^0.3.0 from the registry
npm run dev      # http://localhost:5175
```

```bash
npm run build    # tsc --noEmit && vite build  → dist/
npm run preview  # serve dist/
```

Confirm the dependencies really came from the registry (a linked workspace copy
would print `-> ./../../packages/angular`):

```bash
npm ls @chartcraft/angular @chartcraft/core
# @chartcraft/sample-angular@0.1.0
# +-- @chartcraft/angular@0.3.0
# | `-- @chartcraft/core@0.3.0 deduped
# `-- @chartcraft/core@0.3.0
```

…and that the lockfile agrees:

```bash
grep -A3 '"node_modules/@chartcraft' package-lock.json | grep resolved
#   "resolved": "https://registry.npmjs.org/@chartcraft/angular/-/angular-0.3.0.tgz",
#   "resolved": "https://registry.npmjs.org/@chartcraft/core/-/core-0.3.0.tgz",
```

This directory is deliberately **not** an npm workspace — the root `workspaces`
field is `packages/*` only — so it resolves its own `node_modules` from the
registry.

---

## Files

```
samples/angular/
  package.json              deps: @chartcraft/angular + @chartcraft/core ^0.3.0 (registry)
  index.html                just <app-root> — the page is Angular's
  tsconfig.json             strict + strictTemplates + typeCheckHostBindings
  vite.config.ts            @analogjs/vite-plugin-angular (no angular.json, no CLI workspace)
  src/
    main.ts                 bootstrapApplication + provideZonelessChangeDetection
    app.ts                  App — state, computed specs, layout        ← the port of main.ts
    specs.ts                chartSpecs(data, scheme) — options as a pure function
    theme.ts                ThemeStore — the one source of truth for light/dark
    selection.ts            pure pointClick → display-row plumbing
    components/
      top-bar.ts            TopBar    — brand · range control · export · theme toggle
      stat-tile.ts          StatTile  — one KPI: figure, delta chip, <cc-sparkline-chart>
      chart-card.ts         ChartCard — card chrome: <h2>, subtitle, span, action slot
      inspector.ts          Inspector — the pointClick destination
    data.ts                 ALL data, deterministic          ← copied VERBATIM from samples/vanilla
    styles.css              ALL styling, framework-agnostic  ← copied VERBATIM from samples/vanilla
  README.md
```

`data.ts` and `styles.css` are **byte-identical** to `samples/vanilla/src/`
(`git hash-object` matches `feb6133…` and `4a93cd1…`, the same hashes the React,
Vue and Svelte ports carry). They import nothing framework-specific and touch no
DOM, which is the whole reason all five ports render the same board.

---

## What it demonstrates

### Charts — nine forms, each chosen for its question

| Card | Component | Why this form |
|---|---|---|
| Recurring revenue (hero) | `<cc-line-chart>` | Change over time, two segments on **one** y-axis. |
| Platform capacity | `<cc-gauge-chart>` | One value against a **hard ceiling with named thresholds**. |
| Acquisition flow | `<cc-sankey-chart>` | The funnel *branches* — only a Sankey shows where the drop-offs went. |
| Product mix | `<cc-treemap-chart>` | 11 leaves under 4 parents; area carries the hierarchy in one glance. |
| Support load | `<cc-heatmap-chart>` | Two categorical dimensions × one magnitude; the *pattern* is the finding. |
| Revenue by segment | `<cc-bar-chart>` (stacked) | Total **and** mix across a handful of periods. |
| Territory coverage | `<cc-choropleth-chart>` | Geography *is* the question. Topology is a tiny inline synthetic FeatureCollection in `data.ts` — nothing fetched, no atlas bundled. |
| Contract value | `<cc-boxplot-chart>` | Mean ACV is the most misleading number on a SaaS dashboard; **spread** is the finding. |
| 4 × KPI tiles | `<cc-sparkline-chart>` | Shape beside a headline number. |

The per-type components are used throughout rather than the generic
`<cc-chart>`, so `type` is never spelled out and every spec stays
`TypedChartOptions` — a spec can only be handed to the component that matches
it.

### Cross-cutting features

- **`annotations`** — a dashed reference line marks the Atlas 2.0 launch on the
  hero chart.
- **`zoom`** — brush-drag the hero chart. A **Reset zoom** button appears only
  once there is something to reset, driven by the `(zoom)` output, and hides
  again on reset.
- **`dataLabels`** with `select: 'last'` — direct value labels at the line ends.
- **`exportData()`** — **Export CSV** reaches the live chart through
  `viewChild(CcLineChart)` → `.chart()` and downloads exactly the chart's
  accessible data table (verified: `northwind-mrr-12m.csv`, 13 rows,
  `Time,Enterprise,Self-serve`).

### Interactivity — all verified headlessly against the production build

| Check | Result |
|---|---|
| Theme toggle re-themes all 12 charts | all 12 canvases repaint, none blank, `aria-pressed` flips, sun/moon icon swaps |
| Date range 12m → 30d | `.page-head__meta` and 7 of 9 subtitles change, Churned ARR goes `$214.0K` → `$18.4K`, all 12 canvases keep their ink |
| Pointer click → Inspector | `Support load · 12–16 · index 3 · 144 tickets · Input: Pointer` |
| Tab (×20) + ArrowRight ×2 + Enter | `Recurring revenue · 1 Sept 2025 · index 1 · $909,000 · Input: Keyboard` |
| Brush-drag the hero chart | **Reset zoom** appears; plot changes by 5042px |
| **Theme toggle while zoomed** | zoom preserved **to the pixel** (0px vs the pre-toggle zoomed plot) — see the workaround below |
| Reset zoom | button hides, plot returns to the un-zoomed baseline (0px difference) |
| Console | zero errors, zero warnings |

### Design & accessibility

Unchanged from the vanilla sample: real `header`/`main`/`footer` landmarks (the
real elements — see "attribute selectors" below), one `h1`, nine card `h2`s in
the document outline, `aria-pressed` on both controls, `aria-live="polite"` on
the Inspector card, visible focus rings, `prefers-reduced-motion` honoured, and
`a11y.title` + `a11y.description` on **all 12** charts, so no canvas is ever an
unlabeled box. `a11y.table` is left at its default, so all 12 charts keep their
screen-reader data table and their focusable, arrow-navigable canvas.

No hand-picked series colours: every mark takes the library's validated
categorical palette, and the delta chips read `theme.up` / `theme.down` into CSS
custom properties at runtime, so the tiles can never desynchronise from the
marks.

---

## What's Angular-specific, and what's shared

**Shared with every port, unchanged**

- `src/data.ts` and `src/styles.css` — byte-identical copies.
- The *shape* of the app: chart options are a pure function of `(data, scheme)`;
  `data-theme` on `<html>` is the single source of truth for the theme; charts
  are created once and updated, never torn down and rebuilt.
- Every chart option object, verbatim — `specs.ts` is `main.ts`'s `chartSpecs()`
  returning `TypedChartOptions` instead of `ChartOptions`.

**Genuinely Angular**

| Vanilla | Angular |
|---|---|
| `createChart(el, opts)` + `chart.update(opts)` | `<cc-line-chart [options]="specs().mrr">` — the wrapper's `effect()` routes a new reference into `chart.update()` |
| `{ type: 'line' }` | the per-type component `<cc-line-chart>`, which injects `type` |
| `chart.on('pointclick', …)` + manual unsubscribe | `(pointClick)="inspect('mrr', $event)"` |
| `chart.on('zoom', …)` | `(zoom)="onZoom($event)"` |
| `charts.get('chart-mrr').exportData()` | `viewChild(CcLineChart)` → `hero()?.chart()?.exportData()` |
| module-scope `let scheme` + `applyScheme()` | the root-provided `ThemeStore` (a `signal` + one `effect`) |
| `getData(range)` re-run by hand in `setRange()` | `computed(() => getData(range()))` |
| `chartSpecs(data, scheme)` re-run by hand | ONE `computed()`, keyed on `(data, scheme)` |
| `renderInspector()` DOM rebuild | a `computed()` entry + a presentational `Inspector` |
| `destroyAll()` on `pagehide` + HMR dispose | the wrapper's `DestroyRef.onDestroy` — nothing to write |
| `svgIcon.toggleAttribute('hidden', …)` | `@if (dark()) { … } @else { … }` |
| everything in one `main.ts` | `app.ts` + four presentational components |

Specifically:

- **Standalone everywhere. No `NgModule` in this repo directory at all**, and no
  `CommonModule` either: `@if` / `@for` are Angular's built-in control flow, so
  `NgIf`/`NgFor` are never imported.
- **Four signals hold all the state** — `scheme` (in `ThemeStore`), `range`,
  `selection`, `zoomWindow` — and everything else is `computed()`: `data`,
  `specs`, `zoomed`, the Inspector `entry`, each tile's `sparkSpec`, and each
  card's host class list.
- **`computed()` is the immutable-update contract, not an optimisation.** The
  wrapper watches `options` with an `effect()` that reacts to *reference*
  changes. `specs = computed(() => chartSpecs(data(), scheme()))` produces a
  brand-new object exactly when — and only when — an input moves.
  `specs().mrr.theme = 'dark'` would render nothing. Read `specs.ts`'s header
  comment; it is the one thing to get right when adopting this wrapper.
- **`viewChild(CcLineChart)`, once, for one reason.** `exportData()` and
  `zoomTo()` live on the instance, which every component exposes as a `chart`
  **signal** — so no `AfterViewInit` timing puzzle. Everything else is bindings.
- **`booleanAttribute` inputs** let the call site write `hero` and `live` as bare
  attributes, exactly like the React port's boolean props.
- **Attribute selectors, not element selectors**, for this sample's own four
  components — `header[appTopBar]`, `article[appChartCard]`,
  `article[appStatTile]`, `div[appInspector]`. The shared stylesheet is
  byte-identical across all five ports and styles a `.topbar` that is a
  block-level child of the page, `.card--span-*` elements that are direct
  children of `.grid`, and so on. An element selector would insert a wrapper
  element at every one of those joints — the grid span would land on the wrong
  element and the sticky top bar would need patching. With an attribute selector
  the component's host **is** the semantic element, the classes still come from
  the component's own `host: { … }` rather than the call site, and the rendered
  DOM matches the React port's exactly. `<app-root>` is the only extra element
  on the page, and it is the counterpart of React's `<div id="root">`.
- **`typeCheckHostBindings: true`** in `tsconfig.json`, because those `host`
  blocks now carry real logic and `strictTemplates` alone does not check them.
- **Vite, not the Angular CLI.** `@analogjs/vite-plugin-angular` runs `ngtsc`
  inside Vite, so this stays a plain Vite app with `dev` / `build` / `preview`
  like its four siblings — no `angular.json`, no `@angular/build` application
  builder, no `polyfills` entry. It is the same toolchain `packages/angular`
  uses for its own AOT test suite. The published package's **partial-Ivy**
  output is finalized by the Angular linker during this build with no extra
  configuration.
  - One non-default worth copying: **`disableTypeChecking: false`**. The
    plugin's default collects *syntactic* diagnostics only, and
    `{{ noSuchProperty }}` in a template compiles clean. With it turned off,
    `npm run build` is a real `strictTemplates` gate (verified by planting a
    bogus binding: the build fails with `Property 'nope' does not exist on type
    'InspectorEntry'`). `tsc --noEmit` cannot see inside template strings, so
    this is the only thing checking them.
- **`&ngsp;` in the footer.** Angular's default `preserveWhitespaces: false`
  drops whitespace-only text nodes, which would run
  `@chartcraft/angular` and `v0.3.0` together. `&ngsp;` is the escape hatch, and
  it is worth knowing before it costs you a pixel diff.
- **One pleasant surprise:** a node declared inside an `@if` block **is** still
  matched against `ng-content select="[cardAction]"` — it does not fall through
  to the catch-all slot. So the conditional **Reset zoom** button needs no
  `ng-template` + `ngTemplateOutlet` dance and no `[hidden]` fallback; `@if` is
  enough, exactly as in the React/Vue/Svelte ports.

---

## Zoneless

`main.ts` provides `provideZonelessChangeDetection()` and **nothing loads
zone.js** — there is no `import 'zone.js'`, no polyfills entry in `index.html`,
and `zone.js` is not installed (it is an *optional* peer of `@angular/core`, and
this app declines it).

Verified against the production build rather than assumed:

```
zone global (typeof globalThis.Zone) : "undefined"
zone patch symbol                   : "undefined"
window.setTimeout is native         : true
Promise is native                   : true
zone.js strings in dist/assets/*.js : 0
ng-version on <app-root>            : 21.2.18
charts rendered                     : 12
```

…and every interaction in the table above — canvas `pointclick`, keyboard
arrow-walking, brush-zoom, `ResizeObserver`-driven resize, the `download` click
— runs under signals-only change detection with no `NgZone` anywhere.
`@chartcraft/angular` never touches `NgZone`, which is what makes this work
without a single workaround.

---

## Rough edges in `@chartcraft/angular` 0.3.0

Building a real app against the published package surfaced four, none blocking.

### 1. A theme change destroys the user's zoom — worked around here

**This is a library-level bug, not the intended pattern.** It is the same one the
Vue port found, and it reproduces identically in Angular.

Core resets the zoom viewport whenever an `update()` carries `data`. The vanilla
sample never hits this because it can send a partial — `chart.update({ theme })`
— which core reads as "the viewport is still valid". The wrappers instead push
the **whole** `options` object on every change, so a pure theme toggle carries
`data` and silently drops the viewport. Silently: no `zoom` event is emitted, so
the app is not even told, and a naive port is left showing a **Reset zoom**
button that points at nothing.

Measured here with the workaround removed: after a brush-zoom, one theme toggle
returned the hero plot to **0px difference from the un-zoomed baseline** while
the Reset button stayed visible.

The app-level fix is to mirror the window from the `(zoom)` output and re-apply
it once the update has landed:

```ts
private readonly zoomWindow = signal<ZoomRange>(null);
protected onZoom(w: ZoomRange) { this.zoomWindow.set(w); }

constructor() {
  afterRenderEffect(() => {
    this.scheme();                    // tracked: the trigger
    untracked(() => {                 // untracked: zoomTo() re-emits `zoom`
      const w = this.zoomWindow();
      if (w) this.hero()?.chart()?.zoomTo(w);
    });
  });
}
```

`afterRenderEffect` is Angular's equivalent of Vue's `flush: 'post'`, and the
ordering is the whole point: a plain `effect()` created in `App`'s constructor is
registered *before* the child `<cc-line-chart>`'s own effect, so it would
re-apply the window and then have it destroyed. After-render effects run once the
whole change-detection pass has been flushed to the DOM — after
`chart.update()`. With this in place the zoom survives a theme toggle to the
pixel (0px difference), exactly as it does in the vanilla app.

Until the wrapper can diff `options` or forward partials, every Angular app that
combines `zoom: { enabled: true }` with a live theme switch needs this.

### 2. Value re-exports live in `@chartcraft/core`, not the wrapper

`@chartcraft/angular` re-exports core's **types** (`ChartOptions`, `PointEvent`,
`ZoomRange`, `SeriesOptions`, …) but not its **values**, so `version`,
`lightTheme`, `darkTheme` and `categoricalPalette` are imported from
`@chartcraft/core` directly — which is why both packages are direct
dependencies. Same as the React wrapper.

### 3. Two levels of nullability for one instance

Reaching the chart is `this.hero()?.chart()?.…`: `viewChild()` is `undefined`
before the view exists, and `chart()` is `null` before `afterNextRender`. There
is no `(ready)` output and no promise, so every imperative call site carries both
optional chains and a "what if it isn't there yet" branch. Fine in an event
handler, a trap in setup code.

### 4. The per-type components share one loose options type

`TypedChartOptions` is `Omit<ChartOptions, 'type'>` for all 39 of them, so
`<cc-gauge-chart [options]="{ sankey: { … } }">` type-checks happily under
`strictTemplates`. The components buy you the correct `type` string, not a
narrowed options shape.

Two things that worked better than expected, for the record: the partial-Ivy
package needed **no** configuration to link inside a non-CLI Vite build, and the
`class` on `<cc-line-chart class="card__chart">` lands on the very element
ChartCraft mounts into — so `.card__chart`'s height is the box the chart's
`ResizeObserver` measures, with no wrapper div and no extra CSS.
