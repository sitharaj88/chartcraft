# Roadmap

Where ChartCraft goes next. Items are grouped by theme, not strictly
ordered; the [API contract](api-contract.md) governs every addition — each of
these lands as a contract change first, then core, then wrappers, then docs
(see `CONTRIBUTING.md` in the repository root).

## Shipped in 0.4

**Dogfooding, not more tests.** 0.3 shipped with 1,984 passing tests, and then
five real sample dashboards were built against the *published* packages. They
found four defects those tests could not: every one was an **experience** bug —
the API accepted the options, returned no error, and drew something wrong or lost
user state. All four are fixed, with 39 new tests pinning the behaviour.

- **[A log value axis derives its domain from the positive data only.](concepts/scales-and-axes.md#log-axes)**
  A boxplot of all-positive data (1.2 … 260) with `yAxis: { type: 'log' }` used to
  draw a **1e-12 … 1e3** axis with every box squashed into the top tenth of the
  plot. Zero anchoring is now skipped, rounding is to whole decades, a stacked
  series contributes its cumulative tops rather than its zero floor, and a
  non-positive bound from any source — `min`/`max`, a chart type's own widening, a
  decorator, a zoom-viewport edge — is *discarded* rather than clamped to an
  epsilon. A **value** ≤ 0 becomes a `null` gap with one `console.warn`, never an
  error: a live dashboard must not go blank when a linear axis is flipped to log.
  Applies to a log x axis and to a horizontal chart's value axis too.
- **[An options update no longer silently destroys the zoom viewport.](features/zoom-pan-brush.md#the-viewport-across-an-update)**
  The old rule reset the window whenever the payload merely *contained* `data` —
  and since every framework wrapper re-sends the whole options object, a pure
  theme change threw away the user's brush **and emitted no event**. The
  discriminator is now the computed **domains**, per axis, so new values on the
  same timestamps keep an x-zoom. A reset always emits `zoom: null`.
- **[`PointEvent` carries the colour of the mark that was clicked.](api/core.md#pointevent)**
  `PointEvent.color` resolves through the same path as `TooltipPoint.color`, so a
  click-driven detail panel's swatch can never disagree with the chart — and no
  one has to re-derive it from a series index, which is wrong whenever a series is
  hidden or a type assigns slots per slice. It is **required**, which is why 0.4 is
  a minor: constructing a `PointEvent` (a test fixture, a mock) now needs the field.
- **[`theme.warning`, and gauge bands that need no hardcoded hex.](examples/gauge.md#band-colors)**
  `up`/`down` covered two of the three states a status mark has; the middle one
  forced every consumer to hardcode a colour. `theme.warning` (`#fab219`, both
  schemes) is that step, and it is the **one optional slot** on `Theme` so every
  hand-written custom theme still compiles — and still gets themed.
  `gauge.bands[].color` is now optional, filled by position.

**Wrapper DX, from the same dogfooding.**

- **One package, not two.** All four wrappers re-export core's complete public
  value surface as well as its types, so `@chartcraft/core` is no longer a second
  direct dependency. Named re-exports only, verified to tree-shake.
- **`ChartSpec`** (`Omit<ChartOptions, 'type'>`) is exported under that one name
  from all four, for the "options in their own module" pattern every sample uses.
  `TypedChartOptions` survives as a deprecated alias in Vue and Angular.
- **React**: memoising option props is a *correctness* requirement, not an
  optimisation — there is now a development-only warning when the wrapper sees a
  new-but-deeply-equal option prop three renders in a row, and `ref` is populated
  before any parent effect runs.
- **Angular**: a `(ready)` output and `whenReady()`, removing the two-level
  `this.hero()?.chart()?.…` nullability dance, plus the same dev-mode warning.
- **Svelte**: all six events work as Svelte 5 **callback props**
  (`onpointclick`, `onzoom`, …) as well as `on:` directives, on Svelte 4 *and* 5 —
  so a Svelte 5 app can drop the deprecated directive entirely. Plus
  `onready`/`on:ready`.
- **Vue**: no dev warning by design (it deep-watches, so a mutation is never
  silently lost), but the guidance to hold options in a `ref`/`computed` is now
  documented.

Still open, and stated honestly in all four framework guides: the per-type
components share **one loose options type**, so `<GaugeChart>` accepts a `sankey`
block. They buy the correct `type` string, not a narrowed options shape.
Narrowing was assessed and deliberately deferred — it would break the shared
`ChartSpec` pattern, and it is a 1.0-shaped change.

## Shipped in 0.3

**Twenty new chart types, for 39 total:** range area, bullet, dumbbell,
lollipop, slope, streamgraph, marimekko, pyramid, calendar, radial bar, rose,
violin, parallel coordinates, icicle, circle packing, word cloud, sankey,
gantt, choropleth and network. Every one ships with the full shared feature set
— tooltip, legend policy, keyboard navigation, a data table, theming, animation,
reduced motion, resize — and its own [example page](examples/index.md) with an
honest "when *not* to use this" section.

**Audit-driven hardening.** An adversarial [quality audit](https://github.com/sitharaj88/chartcraft/blob/main/QUALITY-AUDIT.md)
of all 39 types drove a round of fixes that shipped in 0.3: the accessible table
and `exportData()` now carry the **full** series rather than the downsampled
render set; sequential ramps are scheme-aware, so the highest-magnitude cell
clears 13.16:1 on dark instead of vanishing at 1.46:1; candlesticks encode
rise/fall with **fill** as well as colour; `forced-colors: active` is genuinely
implemented; series past palette slot 8 gain a dash/marker channel; network
links became reachable by assistive tech; and `zoomTo` at 1M points went
**76.8 ms → 9.9 ms** while a 1M-point mount went **4.70 s → 1.21 s**.

**Six cross-cutting features**, each with a page of its own:

- [Error bars](features/error-bars.md) — the v0.2 roadmap's one open chart-type
  item, now a series decoration on line/area/bar/scatter/bubble, included in the
  value domain, the tooltip and the data table.
- [Trendlines](features/trendlines.md) — least squares, centered moving average,
  exponential; dashed and legend-labeled so a fit can never read as data.
- [Data labels](features/data-labels.md) — with *measured* selectivity: `'auto'`
  drops labels that would collide.
- [Annotations](features/annotations.md) — reference lines, bands, labeled points,
  free text, plus an `annotationclick` event.
- [Zoom, pan & brush](features/zoom-pan-brush.md) — and downsampling that re-runs
  inside the visible window, so zooming into a million points reveals real detail.
- [Export](features/export.md) — `exportImage()` (PNG at any scale) and
  `exportData()` (CSV/JSON that mirrors the accessibility table exactly).

**A public plugin surface.** The previous roadmap's "plugin system" shipped as the
[decorator API](extensibility.md): the five features above are implemented on it
with no special treatment from the pipeline. It is exported and documented but
marked **experimental** — four of its hooks were added during v0.3 in response to
real feature needs, so the shape may still move in a minor release.

Also new: `SeriesData`/`GraphData` (graph payloads typecheck without a cast),
`DataPoint.value` (so a real `TreeNode[]` needs no cast either), the `zoom` and
`annotationclick` events, and three new `Chart` methods.

## Shipped in 0.2

Thirteen new types plus combo (per-series mark mixing), for 19 at the time:
bubble, sparkline, histogram, boxplot, candlestick, OHLC, waterfall, heatmap,
treemap, sunburst, funnel, radar, and gauge — each with palette slots by
identity, a data-table representation, and full keyboard navigation. The
financial types got their volume-pane story as a small multiple, not a dual axis.

## Renderers

The `Renderer` interface exists precisely so these slot in without touching
chart code — and v0.3 added a reason to want them:

- **SVG renderer** — for print/export pipelines and style-by-CSS use cases
  (design systems that must restyle marks with stylesheets). Same visual
  spec; one retained node per mark, so intended for small/medium data. It is also
  what `exportImage({ format: 'svg' })` needs: today that call **rejects** with
  "SVG renderer not available".
- **WebGL renderer** — for the 1M+ point regime where Canvas 2D fill rate
  becomes the ceiling. Targets scatter and line first. Automatic renderer
  selection by data size is a possible follow-on once both exist.

## Frameworks

- ~~**Angular wrapper** (`@chartcraft/angular`)~~ — **shipped in v0.3.**
  Standalone, signal-based, zoneless-ready, all 39 chart types. See the
  [Angular guide](frameworks/angular.md).
- **Solid wrapper** (`@chartcraft/solid`) — same thin-wrapper contract as
  React/Vue/Svelte/Angular: lifecycle, resize observation, event bridging,
  nothing else. Feature parity comes from core, as always.

## Server-side & export

- **SSR snapshot rendering** — render a chart to markup/image on the server
  so the HTML payload contains real chart content (today, wrappers are
  SSR-safe but the chart appears at hydration). Also unlocks static-site and
  email use.
- **Vector export** — `exportImage({ format: 'svg' })` and a PDF path, both built
  on the SVG renderer above, for vector-quality print output.

## Interaction

- **Parallel-coordinates brushing** — filtering lines by dragging on an axis. The
  seam is already pure and documented (a decorator can map a pointer x to a
  dimension and a pixel back to that axis's value); the decorator itself is not
  written yet.
- **Category-axis zoom** — the viewport applies to continuous axes only, because
  windowing a band scale would desynchronize band indices from `categories`. A
  band-aware viewport is possible but needs a contract decision first.

## Data

- **Streaming data API** — an append-oriented path (`appendData`-style)
  cheaper than `setData` for live feeds: no re-normalization of unchanged
  history, windowing, and downsample-aware appends.

## Extensibility

- **Stabilizing the decorator API** — promoting [it](extensibility.md) out of
  experimental: freezing the hook set, deciding whether decorators can be scoped
  per chart instead of per build, and giving `LegendItem` / `A11yTableSpec` public
  type exports so a decorator's hooks are fully typed from the package root.

## Quality infrastructure

- **Visual regression harness** — pixel-diff snapshots of every example and
  mark-spec fixture across themes and DPRs, wired into CI, so the visual
  quality bar in the contract is enforced by machines rather than reviewers'
  eyes. The v0.3 determinism rules (no `Math.random()` in any layout) exist partly
  to make this possible.

## Non-goals

For clarity, some things stay out regardless of demand:

- **Dual y-axes** — two measures of different scale get two charts or an
  indexed common base ([why](concepts/scales-and-axes.md#one-y-axis-on-purpose)).
  This includes Pareto charts: a cumulative line belongs on the same normalized
  scale as its bars, or in a small multiple.
- **Runtime dependencies in core** — zero now, zero later. That is why no map
  topology is bundled: `choropleth.geojson` is always yours.
- **Unvalidated palette growth** — no 9th categorical slot, ever. Beyond 8 the
  hue order is reused with a **composite encoding** (dash pattern + marker shape)
  and a one-time console recommendation; the real fix is a design change on the
  caller's side (fold the tail into "Other", or small multiples). The library
  will not generate a colour, and it will not fold your data for you.
- **Radius-linear encodings** — rose radius, bubble and network node radius are
  always √value. Area-true or not at all.
- **A project planner** — the gantt type draws spans. Dependencies, critical paths
  and resource levelling belong to a planning tool, not a chart library.
