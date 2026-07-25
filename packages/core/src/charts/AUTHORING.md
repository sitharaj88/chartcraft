# Authoring a chart type

How to add a chart type to `@chartcraft/core`. All **39** contract ids are
declared and implemented.

**A new type is ONE new module + ONE register call.** The pipeline, wrappers,
legend/tooltip DOM, animation, resize, theming, export and the a11y layer pick
it up automatically. `chart.ts` / `model.ts` / `a11y/` / `interaction/hittest.ts`
contain zero per-type branching — do not add any. Everything type-specific
lives in your module.

## The three steps

1. Create `src/charts/<id>.ts` exporting a `ChartTypeDefinition`
   (interface in `src/charts/registry.ts` — read its doc comments; they are
   the authoritative reference).
2. Add `registerChartType(<id>Definition)` in `src/charts/index.ts`
   **above** `registerPlaceholders()`. Your registration replaces the
   throwing "not implemented" placeholder for your id. Until you register,
   `createChart({ type: '<id>' })` throws a helpful error — that is expected
   and lets type modules land independently, in any order.
3. Add `test/<id>.test.ts` (see "Tests" below).

Do not edit `ChartType` in `types.ts` — all 39 contract ids are already
declared, along with every `DataPoint` field (v0.2: `r`, `o/h/l/c`,
`min/q1/median/q3/max/outliers`, `isTotal`, `children`; v0.3: `low`, `high`,
`eLow`, `eHigh`, `target`, `start`, `end`, `group`, `weight`, `id`),
`TreeNode`, `SeriesOptions.sizeRange/errorBars/trendline/lowKey/highKey`,
every `ChartOptions` block (v0.2 `histogram`/`heatmap`/`gauge`/`waterfall`;
v0.3 `dataLabels`/`annotations`/`zoom` plus `rangearea`, `bullet`, `calendar`,
`violin`, `radialbar`, `rose`, `sankey`, `gantt`, `wordcloud`, `network`,
`choropleth`, `parallel`) and `Theme.up/down/neutral`.

## What the pipeline gives you (never re-implement these)

- **Option resolution** (`model.ts#resolveOptions`): padding, legend
  (generic auto = `series >= 2`), tooltip (`show` default true, `shared`
  default false), animation, downsample config, a11y config, the resolved
  `dataLabels`/`annotations`/`zoom` feature blocks, and pass-through of your
  `ChartOptions` block. Hook `resolveOptions(resolved, raw)` to apply your
  type's policy — mutate `resolved`, and read `resolved.legend.auto` (or check
  `raw`) to know whether the caller set a value explicitly. Never clobber
  explicit values, and **never write a COMPUTED value into `resolved.xAxis` /
  `resolved.yAxis`**: axis options belong to the caller and `getOptions()` must
  keep reporting what they configured. Value domains go through
  `extendValueDomain` (below).
- **Data model** (`model.ts#buildModel`): normalized points (all `DataValue`
  shapes folded into `NormalizedPoint`, rich fields carried through),
  categories (provided/derived/index-fallback), x-type inference, palette
  slot assignment by series identity, per-kind stacking, LTTB downsampling
  (viewport-aware), x/y extents. Driven entirely by your `needs` declaration.
- **Cartesian scales & axes** (`layout.ts#computeCartesianLayout`): when you
  declare `needs.cartesianAxes: true` the pipeline builds the x/y scales
  (band or linear/time/log), ticks, margins, zoom-viewport domain overrides,
  and draws grid + axes around your render. Chrome is **per axis**
  (`needs.axisChrome`) and which screen axis carries which logical axis is
  **declared** (`needs.axes`). Non-cartesian types get a plain plot `Rect`.
- **Animation**: `TypeGeom.pos` and `TypeGeom.slices` are interpolated
  between renders (entering points rise from `y0`; entering slices sweep
  from the start angle). Anything you put in `TypeGeom.extra` is redrawn at
  target immediately — use it for geometry that must not animate
  (candlestick: "never animated sweeps") or that has no generic
  interpolation (cells, tree nodes). Reduced motion is already handled.
- **Interaction plumbing**: pointer/keyboard listeners, hover state, event
  emission (`pointenter/leave/click` with `seriesId`/`dataIndex`), tooltip
  DOM (positioning, clamping, theming), legend DOM (toggling), the
  `aria-live` announcer, the visually-hidden table wrapper, resize and
  theme watching.
- **Export** (v0.3): `exportData()` serializes YOUR `a11yTable` spec to
  CSV/JSON and `exportImage()` re-runs YOUR `render` (plus decorations) on an
  offscreen canvas. Get the a11y table right and export is correct for free —
  never add a parallel data-shape description.

## What you must provide (the definition's stages)

```ts
export interface ChartTypeDefinition {
  readonly id: ChartType;
  readonly needs: ChartTypeNeeds;      // pipeline services you consume
  resolveOptions?(resolved, raw): void; // per-type option policy
  extendValueDomain?(model, opts): ValueDomainExtension | [number, number] | null;
  layout(ctx): TypeGeom;                // per-datum geometry
  render(ctx: RenderContext): void;     // paint via ctx.r (Renderer), never canvas
  decorations?(ctx: RenderContext, layer: 'under' | 'over'): void;  // optional
  hitTest(ctx, px, py): HoverState | null;
  resolveLegend?(ctx: GeomContext): boolean | null;   // measured legend policy
  legendItems(ctx): LegendItem[];
  legendCustomEl?(ctx, doc): HTMLElement | null;  // gradient scale bars
  a11yTable(ctx, opts?): A11yTableSpec; // columns + rows, shape-appropriate
  a11yDescription?(ctx: GeomContext): string | null;  // prose, not a table
  keyboardNav(model): NavContext;       // natural reading order for arrows
  announce?(ctx, pos): string | null;   // optional custom announcement
  tooltipPoints(ctx, hit): TooltipPoint[];
}
```

The order the pipeline runs them in:

```
resolveOptions        option policy
  -> extendValueDomain   model build: data extent -> value domain
  -> layout              geometry against the pipeline scales
  -> resolveLegend       legend visibility, now that layout is measured
  -> syncDom             legend / aria / a11y table / a11yDescription
  -> paint               see "the decorations stage" below
```

Stage notes:

- `needs` — declare, don't implement: `cartesianAxes`, `axisChrome`, `axes`,
  `xScale: 'band' | 'auto' | 'time'`, `bandIndex`, `baseKind`, `combo`,
  `rangeFromData`, `stacking`, `horizontal`, `downsample`, `triple`. Example: boxplot wants
  `{ cartesianAxes: true, xScale: 'band' }`; heatmap/treemap/gauge want
  `{ cartesianAxes: false }` and compute their own geometry from `layout.plot`.

  The four declarations added in v0.3, each replacing a per-type workaround:

  - **`axisChrome: boolean | { x?, y? }`** — per axis. One switch covers that
    screen axis's line, tick labels, axis title, gridlines AND the margin the
    pipeline reserves for its labels. `streamgraph` declares
    `{ x: true, y: false }`: a wiggle baseline carries no information, so the
    value axis goes away entirely while the x axis stays.
  - **`axes: 'value-y' | 'value-x' | 'rows'`** — which screen axis carries the
    continuous VALUE axis and which the BAND axis. Defaults to `'value-x'` when
    `horizontal` is in force, else `'value-y'`. `'rows'` is the third
    arrangement: band (category) axis on screen-y paired with the continuous
    DATA axis on screen-x, honoring `xAxis.type: 'time'` — there is no value
    axis at all. `gantt` declares it (task rows against a time axis), which the
    other two arrangements cannot express because they pair a band axis with a
    Linear/Log VALUE scale.
  - **`bandIndex: 'position'`** — a datum's band IS its point index; its
    normalized `x` is meaningless. `violin` declares it, because the generic
    normalizer folds a raw `number[]` sample into a tuple shape and mangles `x`.
    `bandIndexFor` obeys the flag, so placement, tick lookup, tooltips and the
    a11y table all agree.
  - **`rangeFromData: true`** — a series with no explicit per-series `type`
    renders as the `'rangearea'` band kind whenever its data carries a full
    `low`/`high` pair. `rangearea` declares it; an explicit `type` still wins.

  And one added in v0.3.2:

  - **`xScale: 'time'`** — this type's x is INHERENTLY temporal. `inferXType`
    honours the declaration, so a bare number is epoch milliseconds BY
    DECLARATION — which is the only safe basis, because integer `x` values are
    legal everywhere else and "a big number is probably a date" is a guess.
    `candlestick`, `ohlc` and `gantt` declare it. The point of declaring rather
    than patching one formatter is that everything downstream then agrees: the
    tick labels (a real `TimeScale`), the tooltip header, the a11y table's time
    column and the keyboard announcement. Ordering: an explicit caller
    `xAxis.type` wins, then a band declaration, then genuinely categorical data
    (supplied `categories`, string `x`), then this. Format an x value with
    `formatTemporal(x, model.xType === 'time', spanMs)` — never by sniffing the
    magnitude yourself. Do NOT write `resolved.xAxis.type` from
    `resolveOptions`: axis options belong to the caller, and `getOptions()` must
    round-trip what they configured.

  `axes` is also how the pipeline decides which axis formats what
  (`valueAxisOf` / `categoryAxisOf` in `registry.ts`): declare it and
  `formattedX` / `formattedY` come out right with no tooltip post-processing. It
  is meaningful for `cartesianAxes: false` types too — that is how a mirrored
  `pyramid` gets `yAxis.ticks.format` for its categories and
  `xAxis.ticks.format` for its magnitudes.
- `layout(ctx)` — you get `opts`, `theme`, `model`, the pipeline `layout`
  (plot rect + scales + `viewport`) and `measure(text, font)`. Return
  `{ pos, slices, bars, extra? }`. Use `pos[si][pi]` whenever a datum has a
  natural anchor point — the keyboard tooltip anchor and animation come for
  free. Keep `pos` indexed by MODEL series index (empty array for hidden
  series, `null` for gaps).
- `render(ctx)` — draw through `ctx.r` only (`line/path/rect/circle/sector/
  text/clipRect`). Respect the dataviz rules in the contract: ink-colored
  text, status colors from `theme.up/down/neutral`, no chart junk.
- `decorations(ctx, layer)` — **optional** overlay stage, see below.
- `hitTest` — hit targets larger than marks (`HIT_RADIUS` = 24px; helpers
  `nearestPoint`, `nearestByX`, `sliceAt` in `interaction/hittest.ts`).
- `a11yTable(ctx, opts?)` — first column is the row-header column. Use
  shape-appropriate columns (OHLC: open/high/low/close; treemap: indented label
  + value + share). The pipeline builds the DOM, the caption AND `exportData()`.

  **`opts.limit` (v0.3.2) is an optional row budget, and honouring it is
  optional.** The DOM path asks for the resolved `a11y.tableMaxRows` (all it can
  materialize anyway); `exportData()` asks for everything, always — an export
  that silently truncates is a data-integrity bug. Whatever you return is
  sliced by the pipeline, which also fills in `A11yTableSpec.total`, so a
  definition that ignores `limit` behaves exactly as it always did.

  Honour it when a row is genuinely expensive to build — one row object with
  formatted string cells per DATUM, on a type that can carry a million of them.
  Building the complete spec eagerly on mount cost +565 ms at 100k points and
  +4.2 s at 1M before this existed, all of it synchronous main-thread work to
  produce rows the DOM then threw away. It is pointless for a type whose row
  count is bounded by its own shape (a gauge has one row; a sankey has nodes +
  links; a heatmap has one row per series).

  The shape, when you do honour it:

  ```ts
  a11yTable(ctx, tableOpts): A11yTableSpec {
    const budget = a11yRowBudget(tableOpts);      // Infinity when unbounded
    const built = Math.min(ctx.model.maxLen, budget);
    const rows = [];
    for (let i = 0; i < built; i++) rows.push(/* ... */);
    // `total` is what you WOULD have built. Omitting it makes the caption and
    // the accessible description report the truncated count as the whole truth.
    return { columns, rows, total: ctx.model.maxLen };
  }
  ```

  Adopted so far by the shared cartesian table (line/area/bar/scatter and the
  types built on it), `candlestick`/`ohlc`, `bubble` and `rangearea`.
- `keyboardNav` — `{ seriesCount, isVisible, pointCount }` consumed by the
  pure `navigate()` state machine. Map your natural reading order onto
  (si, pi): heatmap = row-major cells (si = row, pi = column), funnel =
  stages, treemap = flattened node order. `dataIndex` in events is `pi`.
- `tooltipPoints` — call `ctx.pointFor(si, pi)` for the pipeline-built point
  (identity, palette color, category-aware formatting), then post-process for a
  reason your TYPE owns (candlestick replaces `formattedY` with an OHLC block).
  If you find yourself compensating because the pipeline formatted with the
  wrong axis, declare `needs.axes` instead.
- `extendValueDomain(model, opts)` — widen the value axis to cover marks the
  generic data extent cannot see: a bullet's qualitative ranges and target, a
  boxplot's whiskers and outliers, a waterfall's running totals, a
  candlestick's highs and lows, a violin's raw samples. It is called while the
  MODEL is built, before any scale exists, so read RAW data off `opts.data`. The
  pipeline UNIONS the result with the data extent and never narrows it. Return
  `{ domain, exact: true }` when `nice()` must not widen it (a bullet's
  outermost qualitative range has to end exactly at the plot edge). This is the
  only sanctioned way to set a value domain — writing `resolved.yAxis.min` from
  `resolveOptions` puts a computed number into the caller's options and into
  `getOptions()`.
- `resolveLegend(ctx)` — a legend decision that needs MEASURED layout. It runs
  after `layout()` and before the legend DOM is built, and receives the frame's
  `geom`, so a plan computed in `layout()` is read back off `extra`. Return
  `true`/`false` to set `legend.show`, `null` to leave it alone, and gate on
  `ctx.opts.legend.auto` so an explicit caller choice is never overridden.
  (`slope`: "no legend when the direct end labels fit" needs text metrics AND
  the plot rect, neither of which `resolveOptions` has.) `layout()` must never
  mutate `opts` — this stage is the seam.
- `a11yDescription(ctx)` — prose a data table cannot carry. The pipeline
  concatenates `a11y.description`, this stage and every decorator's
  `a11yDescription` into ONE visually-hidden node that the canvas points at with
  a single `aria-describedby` token, so a type never manages its own node.
  (`choropleth` names the data rows that matched no map feature.)

---

# v0.3 plumbing reference

## 1. The decorations stage (`decorations?(ctx, layer)`)

`render` paints the marks. `decorations` paints a type's OWN overlays — a
center total, direct labels, a "today" marker — so `render` stays about marks.
It is optional and called **twice per frame**, with the same `RenderContext`
`render` gets:

```
surface -> title/subtitle -> grid
        -> decorations(ctx, 'under')  +  under-Decorators
        -> render(ctx)                                     <- the marks
        -> axis chrome (axes + tick labels)
        -> decorations(ctx, 'over')   +  over-Decorators
```

That order is defined in exactly one place, `ChartImpl#paint` in `chart.ts`.
Notes:

- `'under'` runs after the grid and before the marks: bands, halos,
  backgrounds.
- `'over'` runs after the axis chrome: reference lines, labels, markers.
- Both layers see the **animation-interpolated** `ctx.geom` for the current
  frame, exactly like `render`.
- Clip to `ctx.layout.plot` yourself (`ctx.r.clipRect`) when the decoration
  must not bleed into the margins.
- **Cross-cutting features do NOT use this hook.** Error bars, trendlines,
  data labels, annotations and the zoom brush are pipeline-level
  `Decorator`s (below) — a chart type must never know they exist.

## 2. The pipeline-level decorator list (`src/decorate.ts`)

A `Decorator` is a type-agnostic pass registered once per build. Every mounted
chart walks the list; nothing is registered by default.

```ts
import { registerDecorator } from '../decorate';

registerDecorator({
  id: 'error-bars',            // stable; re-registering the id REPLACES it
  layer: 'over',               // 'under' | 'over'
  order: 10,                   // ascending within a layer; ties keep reg. order
  appliesTo: (ctx) => ctx.model.series.some((s) => /* declares errorBars */ true),
  draw: (ctx) => { /* ctx.r.line(...) */ },
  extendYDomain: (model, opts) => [lo, hi],   // widen the value domain
  legendItems: (ctx) => [ /* LegendItem[] */ ],
  a11yTable: (ctx, spec) => spec,             // transform the data table + export
  tooltipPoints: (ctx, hit, points) => points, // enrich the tooltip's points
  a11yDescription: (ctx) => null,             // extra accessible prose
  onClick: (ctx, px, py, native) => false,    // true = claim the click
  attach: (host) => () => { /* teardown */ }, // DOM listeners live here only
});
```

`DecoratorContext` (read-only) carries everything a feature needs:

| field | what it is |
|---|---|
| `r` | `Renderer` — draw through it, never the canvas API |
| `theme` | resolved `Theme` (ink colors, `up/down/neutral`, gridline) |
| `opts` | `ResolvedOptions`, incl. resolved `dataLabels`, `annotations`, `zoom` |
| `model` | `DataModel` — series, points, categories, extents, `viewport` |
| `layout` | full pipeline `Layout` (scales, ticks, baseline, viewport) |
| `plot` | alias of `layout.plot` (the plot `Rect`) |
| `xScale` / `yScale` | aliases of `layout.xScale` / `layout.yScale` |
| `geom` | this frame's `TypeGeom` (animation-interpolated) |
| `hover` | current hover/focus `{ si, pi }` or null |
| `def` | the active `ChartTypeDefinition` — gate on `def.id` / `def.needs` |
| `viewport` | active zoom `Viewport` or null |
| `host` | the live chart's `DecoratorHost`, or **null** when this pass paints through an offscreen renderer (`exportImage`) |
| `emit` | emit a public chart event (`zoom`, `annotationclick`, ...) |

Hook semantics:

- **`draw`** — called once per frame, in the decorator's layer.
- **`appliesTo`** — cheap opt-out, consulted before `draw`, `legendItems`
  and `onClick`.
- **`extendYDomain`** — called while the MODEL is built (before scales
  exist), so error-bar whiskers land inside the value domain. The pipeline
  **unions** the result with the data extent; it never narrows. With no
  decorator registered `model.yDomain` is bit-identical to v0.2.
- **`legendItems`** — appended **after** the type's items (a trendline must
  be legend-labeled so it can never read as observed data). Skipped when the
  type supplies a `legendCustomEl`.
- **`a11yTable`** — applied between the type's `a11yTable` stage and BOTH the
  DOM table and `exportData()`, in decorator order. There is exactly one spec,
  so the contract's "exportData emits exactly the a11y table's contents" holds
  even when a feature contributes columns (error bars add `± low` / `± high`).
- **`tooltipPoints`** — applied after the type's `tooltipPoints` stage and
  BEFORE `opts.tooltip.format`, so a feature enriches a value ("10 (8–12)")
  without wrapping the caller's formatter or mutating the resolved options.
- **`a11yDescription`** — concatenated by the pipeline with
  `a11y.description` and the type's own `a11yDescription` into the single
  visually-hidden description node. A feature never adds its own node or its own
  `aria-describedby` token.
- **`onClick`** — consulted **before** datum hit-testing, topmost-registered
  first. Return `true` to consume the click (so an annotation click does not
  also fire `pointclick`).
- **`attach(host)`** — called once per chart instance on mount; the returned
  function (if any) runs on `destroy`. `DecoratorHost` gives you `canvas`,
  `root`, `el`, `context()`, `requestRender()`, `setViewport()`,
  `getViewport()` and `emit()`. **This is the only sanctioned place to add
  DOM listeners** — pointer/wheel/keyboard zoom, brush drag, double-click
  reset all live here, and `chart.ts` stays interaction-agnostic. The host
  object is created once per chart and its identity is stable, so keying
  per-chart state on it (a `WeakMap<DecoratorHost, State>`) is safe.

**`ctx.host` and export isolation.** `draw` (and every other hook) receives the
same host on `ctx.host` — and `null` when the pass is painting through the
offscreen renderer `exportImage()` uses. That is a load-bearing property, not a
detail: an export must never reach live DOM. Treat a null host as "draw only,
touch nothing" (the zoom decorator returns early, so a brush rectangle never
appears in an exported PNG).

Registration helpers are public API: `registerDecorator`,
`unregisterDecorator`, `decorators(layer?)`, `clearDecorators()` (tests).

## 3. The zoom viewport

```ts
interface Viewport { x?: [number, number] | null; y?: [number, number] | null }
```

A viewport is a pair of **continuous domain overrides in data units**: `x`
addresses the data x axis, `y` the value axis, regardless of which screen axis
each lands on (so `horizontal: true` does not swap them). Rules:

- It is **state, not options** — it lives on the chart instance, is echoed on
  `model.viewport` and `layout.viewport`, and is not part of `getOptions()`.
- Set it with `chart.zoomTo(range | null)` (public; also emits the `zoom`
  event) or `host.setViewport(v)` from inside a decorator (no event — the
  decorator owns event batching).
- A viewport range **wins over both the data extent and `xAxis`/`yAxis`
  min/max**, and is applied verbatim: no `nice()` widening, so the visible
  window matches the request exactly.
- **Band (category) axes ignore it.** Zoom is defined on continuous axes.
- Reversed ranges are normalized ascending; degenerate (`a === b`) and
  non-finite ranges resolve to `null` (a reset).
- New `data` or a new `type` resets it (the window is in stale units).
- **Downsampling re-runs against the window**: for series that exceed
  `downsample.threshold`, the points are first sliced to the visible window
  (padded by one point each side so lines exit the plot edges), then LTTB'd
  only if the window still exceeds the threshold. Zooming into 1M points
  therefore reveals real detail. Series below the threshold are never
  windowed or touched.

`computeCartesianLayout` takes an optional `viewport` arg and falls back to
`model.viewport` when omitted, so a type's `layout` stage needs no changes:
just position marks against the scales you are handed.

## 4. v0.3 data fields

Everything below is already declared in `types.ts` and carried through
`normalizeSeriesData` **verbatim and losslessly** onto `NormalizedPoint` — no
type module needs to touch normalization.

| field | type | used by |
|---|---|---|
| `low`, `high` | `number \| null` | rangearea band, dumbbell endpoints, bullet range, gantt span |
| `eLow`, `eHigh` | `number` | asymmetric error bars (absolute bounds) |
| `target` | `number` | bullet target marker |
| `start`, `end` | `number \| Date` | gantt task span (Date identity preserved) |
| `group` | `string` | gantt swimlane, network cluster, parallel class |
| `weight` | `number` | wordcloud term weight |
| `id` | `string` | network / sankey node id |

Folding rules you can rely on:

- `y` falls back to `c` (ohlc close), then `weight` (the contract calls it an
  alias of y), then `low` — so gap detection, extents, keyboard navigation and
  tooltips work for every shape without special cases.
- **Three-element tuples** are ambiguous by shape, so the registry decides:
  `needs.triple: 'size'` (the default) reads `[x, y, r]` (bubble size
  channel); `needs.triple: 'range'` reads `[x, low, high]` and mirrors `low`
  into `y`. Declare `'range'` for rangearea/dumbbell-style types. Object data
  always carries `r` and `low`/`high` verbatim regardless of the flag.
- `SeriesOptions.lowKey` / `highKey` remap custom object-data field names
  (e.g. `p10`/`p90`) into `low`/`high` during normalization.
- `low`/`high` **join the value extent** in `buildModel`, so a band is fully
  visible without your type touching the domain.

## Worked example: how `bar` is built

`bar` (with `line`, `area`, `scatter`) is produced by the shared cartesian
engine — read `src/charts/cartesian.ts` top to bottom, it exercises every
stage:

- config `{ id: 'bar', baseKind: 'bar', bandX: true, horizontal: true }`
  → `needs` gets `xScale: 'band'` (model forces category x) and
  `horizontal: true` (model honors the option).
- `layout` computes bar slot geometry (band width → per-series slots with
  2px gaps, or min-x-gap grouping on a linear x) and per-datum `PointPos`
  with `y0` at the baseline or stack bound (`s.y0/s.y1` presence = stacked).
- `render` paints kinds in combo z-order (areas < bars < lines < scatter);
  the bar mark itself lives in `src/charts/bar.ts` (rounded data-end
  corners, 2px gaps).
- `hitTest` = full column band (`BandScale.invertIndex`), preferring bars
  whose value extent contains the pointer.
- `a11yTable` = category rows x series columns; `legendItems` = toggleable
  series; `keyboardNav` = series x points.

For a single-module example of a *preset* type, read `src/charts/sparkline.ts`
(chrome-free config + option hook, 30 lines). For a non-cartesian example
(own geometry, slices, non-toggleable legend, slice-count legend policy),
read `src/charts/pie.ts`.

## Tests

Put them in `packages/core/test/<id>.test.ts`. Per the contract every type
ships:

- unit tests for its **layout math** (bins, squarify, polar transforms,
  5-number summaries, KDE, squarified/spiral/force layouts, ...) — test the
  pure functions you export from your module. Stochastic layouts must be
  seeded: **no `Math.random()`**, and a test must prove two runs agree;
- **legend policy** (items, auto behavior, toggleability);
- **a11y table content** (columns + rows through the mounted DOM) — this
  also locks down `exportData()`;
- a **renderer call-log smoke test** (mount with `test/helpers.ts#mount`,
  assert against `ctxOf(el).__calls` / `__props` — see `test/marks.test.ts`
  for the pattern).

Run `npm run test -w @chartcraft/core` from the repo root; all existing
tests must stay green. Do not modify `chart.ts`, `model.ts`, `layout.ts`,
`decorate.ts`, `a11y/`, `interaction/hittest.ts` — if you think you need to,
the design question belongs in the registry interface or the decorator
interface, not in per-type branches. If a stage you need does not exist, say so
in `/DEVIATIONS.md` with the seam you would add: every stage on this page was
added because a type module documented the gap that way.
