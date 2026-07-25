# Authoring a chart type

How to add one of the v0.2 chart types (`bubble`, `histogram`, `boxplot`,
`candlestick`, `ohlc`, `waterfall`, `heatmap`, `treemap`, `sunburst`,
`funnel`, `radar`, `gauge`) to `@chartcraft/core`.

**A new type is ONE new module + ONE register call.** The pipeline, wrappers,
legend/tooltip DOM, animation, resize, theming and the a11y layer pick it up
automatically. `chart.ts` / `model.ts` / `a11y/` / `interaction/hittest.ts`
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

Do not edit `ChartType` in `types.ts` — all 19 contract ids are already
declared, along with the `DataPoint` rich fields (`r`, `o/h/l/c`,
`min/q1/median/q3/max/outliers`, `isTotal`, `children`), `TreeNode`,
`SeriesOptions.sizeRange`, the `ChartOptions` blocks
(`histogram`/`heatmap`/`gauge`/`waterfall`) and `Theme.up/down/neutral`.

## What the pipeline gives you (never re-implement these)

- **Option resolution** (`model.ts#resolveOptions`): padding, legend
  (generic auto = `series >= 2`), tooltip (`show` default true, `shared`
  default false), animation, downsample config, a11y config, and pass-through
  of your `ChartOptions` block. Hook `resolveOptions(resolved, raw)` to apply
  your type's policy — mutate `resolved`, and check `raw` to know what the
  caller set explicitly (never clobber explicit values).
- **Data model** (`model.ts#buildModel`): normalized points (all `DataValue`
  shapes folded into `NormalizedPoint`, rich fields carried through),
  categories (provided/derived/index-fallback), x-type inference, palette
  slot assignment by series identity, per-kind stacking, LTTB downsampling,
  x/y extents. Driven entirely by your `needs` declaration.
- **Cartesian scales & axes** (`layout.ts#computeCartesianLayout`): when you
  declare `needs.cartesianAxes: true` the pipeline builds the x/y scales
  (band or linear/time/log), ticks, margins, and draws grid + axes around
  your render (suppressed when `needs.axisChrome: false`). Non-cartesian
  types get a plain plot `Rect`.
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

## What you must provide (the definition's stages)

```ts
export interface ChartTypeDefinition {
  readonly id: ChartType;
  readonly needs: ChartTypeNeeds;      // pipeline services you consume
  resolveOptions?(resolved, raw): void; // per-type option policy
  layout(ctx): TypeGeom;                // per-datum geometry
  render(ctx: RenderContext): void;     // paint via ctx.r (Renderer), never canvas
  hitTest(ctx, px, py): HoverState | null;
  legendItems(ctx): LegendItem[];
  a11yTable(ctx): A11yTableSpec;        // columns + rows, shape-appropriate
  keyboardNav(model): NavContext;       // natural reading order for arrows
  announce?(ctx, pos): string | null;   // optional custom announcement
  tooltipPoints(ctx, hit): TooltipPoint[];
}
```

Stage notes:

- `needs` — declare, don't implement: `cartesianAxes`, `axisChrome`,
  `xScale: 'band' | 'auto'`, `baseKind`, `combo`, `stacking`, `horizontal`,
  `downsample`. Example: boxplot wants `{ cartesianAxes: true, xScale:
  'band' }`; heatmap/treemap/gauge want `{ cartesianAxes: false }` and
  compute their own geometry from `layout.plot`.
- `layout(ctx)` — you get `opts`, `theme`, `model`, the pipeline `layout`
  (plot rect + scales) and `measure(text, font)`. Return
  `{ pos, slices, bars, extra? }`. Use `pos[si][pi]` whenever a datum has a
  natural anchor point — the keyboard tooltip anchor and animation come for
  free. Keep `pos` indexed by MODEL series index (empty array for hidden
  series, `null` for gaps).
- `render(ctx)` — draw through `ctx.r` only (`line/path/rect/circle/sector/
  text/clipRect`). Respect the dataviz rules in the contract: ink-colored
  text, status colors from `theme.up/down/neutral`, no chart junk.
- `hitTest` — hit targets larger than marks (`HIT_RADIUS` = 24px; helpers
  `nearestPoint`, `nearestByX`, `sliceAt` in `interaction/hittest.ts`).
- `a11yTable` — first column is the row-header column. Use shape-appropriate
  columns (OHLC: open/high/low/close; treemap: indented label + value +
  share). The pipeline builds the DOM and the caption.
- `keyboardNav` — `{ seriesCount, isVisible, pointCount }` consumed by the
  pure `navigate()` state machine. Map your natural reading order onto
  (si, pi): heatmap = row-major cells (si = row, pi = column), funnel =
  stages, treemap = flattened node order. `dataIndex` in events is `pi`.
- `tooltipPoints` — call `ctx.pointFor(si, pi)` for the pipeline-built point
  (identity, palette color, category-aware formatting), then post-process
  (e.g. candlestick replaces `formattedY` with an OHLC block via
  `opts.tooltip.format`-compatible HTML-free strings).

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
  5-number summaries, waterfall running totals, ...) — test the pure
  functions you export from your module;
- **legend policy** (items, auto behavior, toggleability);
- **a11y table content** (columns + rows through the mounted DOM);
- a **renderer call-log smoke test** (mount with `test/helpers.ts#mount`,
  assert against `ctxOf(el).__calls` / `__props` — see `test/marks.test.ts`
  for the pattern).

Run `npm run test -w @chartcraft/core` from the repo root; all existing
tests must stay green. Do not modify `chart.ts`, `model.ts`, `a11y/`,
`interaction/hittest.ts` — if you think you need to, the design question
belongs in the registry interface, not in per-type branches.
