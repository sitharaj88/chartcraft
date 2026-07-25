# `@chartcraft/core` API reference

Complete reference for the public surface of `@chartcraft/core` v0.3, as
defined by the [API contract](../api-contract.md). Every type below is
exported from the package root.

Sections:

- [Entry points](#entry-points)
- [The `Chart` instance](#the-chart-instance) — including `exportImage`, `exportData`, `zoomTo`
- [`ChartOptions`](#chartoptions) — all 39 chart types
- [Data types](#data-types) — `ChartData`, `SeriesOptions`, `SeriesData`, `GraphData`, `DataValue`, `DataPoint`, `TreeNode`
- [Per-type options](#per-type-options) — the 15 per-type option blocks
- [Feature options](#feature-options) — error bars, trendlines, data labels, annotations, zoom
- [Component options](#component-options) — axes, legend, tooltip, animation, a11y
- [Events](#events) — `ChartEventMap`, `PointEvent`
- [Theming](#theming) — `Theme`, palettes
- [Utilities](#utilities) — scales, `downsampleLTTB`, decorators, `version`

---

## Entry points

### `createChart(container, options)`

```ts
function createChart(container: HTMLElement, options: ChartOptions): Chart;
```

Creates a chart inside `container` and returns its [`Chart`](#the-chart-instance)
handle.

- `container` — any `HTMLElement`. The chart fills it (responsive via
  `ResizeObserver`) unless fixed `width`/`height` are given. Give it a
  nonzero size; a 0×0 container renders nothing.
- `options` — see [`ChartOptions`](#chartoptions). `type` and `data` are
  required; everything else has defaults.

The call synchronously builds the DOM (canvas + accessibility layer) and
schedules the first render. Options are treated as immutable input: the chart
**deep-clones what you pass and never mutates your objects** (a legend toggle
flips the chart's own copy), and later changes go through
[`update`](#updateoptions). Functions (`ticks.format`, `tooltip.format`,
`dataLabels.format`), `Date`s and class instances are carried by reference, not
cloned — cloning those would break identity or drop behavior.

Several types **validate** their input and throw a named error rather than
render something plausible-but-wrong: `pyramid` (series count ≠ 2), `lollipop`
(`stacked: true`), `radialbar`/`rose` (negative values), `sankey` (bad graph
payload or a cycle), `network` (a link naming an unknown node), and
`choropleth` with `unmatched: 'strict'`.

### Other exports

```ts
export const version: string;                     // package version string

export const lightTheme: Theme;                   // built-in light theme
export const darkTheme: Theme;                    // built-in dark theme
export const categoricalPalette: { light: string[]; dark: string[] }; // 8 slots each
export const sequentialPalette: string[];         // blue ramp, light → dark

export { LinearScale, TimeScale, BandScale, LogScale };  // scale classes
export { downsampleLTTB };                               // LTTB downsampling

// v0.3 — the experimental decorator/plugin surface
export { registerDecorator, unregisterDecorator, decorators, clearDecorators };
export type { Decorator, DecoratorContext, DecoratorHost, DecorationLayer, Viewport };
```

See [Theming](#theming), [Utilities](#utilities) and
[Extensibility](../extensibility.md).

---

## The `Chart` instance

```ts
interface Chart {
  update(options: Partial<ChartOptions>): void;
  setData(data: ChartData): void;
  resize(): void;
  destroy(): void;
  on<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): () => void;
  off<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): void;
  getOptions(): Readonly<ChartOptions>;
  readonly el: HTMLElement;
  // v0.3
  exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob>;
  exportData(opts?: { format?: 'csv' | 'json' }): string;
  zoomTo(range: { x?: [number, number]; y?: [number, number] } | null): void;
}
```

### `update(options)`

Deep-merges the partial into the current options, diffs against the retained
model, and re-runs **only the affected pipeline stages** (normalize → data
model → scales/layout → render). Changes animate unless animation is off.
This is the primary mutation API — prefer it over destroy/recreate
([why](../performance.md#update-vs-recreate)).

```ts
chart.update({ theme: 'dark', yAxis: { max: 100 } });
```

Merge semantics: objects merge recursively; arrays (`series`, `data`,
`categories`, `annotations`) are replaced wholesale. Series are matched across
updates by identity (`id` ?? `name`) — see
[stable identity](../concepts/data-model.md#stable-series-identity).

Supplying new `data` or a new `type` **resets the zoom viewport**, because the
window is expressed in the previous data's units.

### `setData(data)`

Convenience for `update({ data })`. Replaces the chart's data.

```ts
chart.setData({ series: [{ name: 'Load', data: nextWindow }] });
```

### `resize()`

Re-measures the container and re-renders at the new size. Rarely needed —
resizing is automatic via `ResizeObserver`; call this only when the container
changes measurability in a way the observer can't see (e.g. after revealing a
previously `display: none` panel in some environments).

### `destroy()`

Tears the chart down: removes the canvas and the accessibility DOM from
`el`, disconnects observers, and removes all event listeners (yours
included, plus any listeners a decorator attached). Fires the `destroy` event
last. The instance must not be used afterwards. Framework wrappers call this on
unmount.

### `on(type, handler)` → unsubscribe

Subscribes to a chart event. Fully typed: the handler's payload type follows
the event name (see [`ChartEventMap`](#events)). **Returns an unsubscribe
function** — the idiomatic cleanup:

```ts
const off = chart.on('pointclick', (ev) => console.log(ev.seriesId, ev.dataIndex));
// …
off();
```

### `off(type, handler)`

Removes a previously registered handler (same function reference). Provided
for symmetry; prefer the unsubscriber returned by `on`.

### `getOptions()`

Returns a readonly snapshot of the **resolved** options — your input with all
defaults applied and all `update`s merged, plus runtime state the chart owns
(e.g. `visible` after legend toggles). Do not mutate it; feed changes through
`update`.

Four things to know about the snapshot:

- **The zoom viewport is not in it.** `zoom` configures the *feature*; the
  current window is transient interaction state, reachable through
  `zoomTo()`/the `zoom` event.
- **`legend` carries one extra field**, `auto: boolean` — true when you did not
  set `legend`/`legend.show`, so a later stage may still refine the decision.
  Reading it is supported; the contract's own three fields keep their meaning.
- **Six types no longer report a computed value domain** in `xAxis`/`yAxis`
  (`bullet`, `boxplot`, `waterfall`, `candlestick`, `ohlc`, `violin`): a
  snapshot round-trips configuration, not a derived scale.
- **`sankey`, `gantt` and `network` report normalized data.** Those types rewrite
  `data` into one synthetic series (marks in reading order / tasks in row order /
  nodes by degree) — your own objects are never mutated, and an `update()`
  re-derives everything from your original input.

### `exportImage(opts?)`

```ts
exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob>;
```

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'png' \| 'svg'` | `'png'` | `'svg'` re-renders through the SVG renderer path if the build has one. **This build ships the canvas renderer only, so `'svg'` rejects** with a message containing "SVG renderer not available". |
| `scale` | `number` | `2` | Device-pixel multiplier, clamped to `[0.1, 8]`. |
| `background` | `string` | theme surface | Background fill for the exported image. |

Renders the **target** frame (never a mid-animation interpolation) through an
offscreen renderer and resolves a `Blob`. Decorations and decorators appear
exactly as on screen, except anything that needs the live DOM: the export
context's `host` is `null`, so e.g. a zoom brush rectangle can never leak into a
PNG. Encoding prefers `canvas.toBlob` and falls back to `toDataURL`; when
neither works the promise rejects with an explicit environment message.

Full details and a live demo: [Export](../features/export.md).

### `exportData(opts?)`

```ts
exportData(opts?: { format?: 'csv' | 'json' }): string;
```

Emits **exactly the accessibility table's contents** — one table spec backs the
DOM table and the export, so they can never disagree.

- **CSV** (default): header row from the table's columns, then one row per table
  row with the row-header cell first. RFC 4180 quoting; `\n`-separated with **no**
  trailing newline; ragged rows padded to the column count.
- **JSON**: `{ "columns": string[], "rows": Array<Record<string, string>> }`, each
  row keyed by column name (the row header under the first column's name),
  pretty-printed with a 2-space indent and no trailing newline. Every value is a
  **string** — the export mirrors formatted table cells.

### `zoomTo(range)`

```ts
zoomTo(range: { x?: [number, number]; y?: [number, number] } | null): void;
```

The programmatic path for [zoom](../features/zoom-pan-brush.md). `null` resets.
Emits the [`zoom`](#events) event. Ranges are in **data units** (epoch ms on a
time axis) and apply to **continuous axes only** — band (category) axes ignore the
viewport. An axis that ends up spanning its full data bounds is dropped, and an
empty viewport normalizes to `null`.

### `el`

The container element you passed to `createChart` (readonly).

---

## `ChartOptions`

```ts
type ChartType =
  // v0.1
  | 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut'
  // v0.2
  | 'bubble' | 'sparkline' | 'histogram' | 'boxplot' | 'candlestick' | 'ohlc'
  | 'waterfall' | 'heatmap' | 'treemap' | 'sunburst' | 'funnel' | 'radar' | 'gauge'
  // v0.3
  | 'rangearea' | 'bullet' | 'dumbbell' | 'lollipop' | 'slope'
  | 'streamgraph' | 'marimekko' | 'pyramid' | 'calendar'
  | 'radialbar' | 'rose' | 'violin' | 'parallel'
  | 'icicle' | 'circlepack' | 'wordcloud' | 'sankey' | 'gantt'
  | 'choropleth' | 'network';
```

All **39** types plug into the same pipeline and deliver the full shared feature
set — tooltip, legend policy, keyboard navigation + aria table, theming,
animation, reduced-motion, resize. Per-type data shapes and rules are
summarized under [`DataValue`](#datavalue) and shown live in the
[examples](../examples/index.md).

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `ChartType` | — (required) | Chart type. `area` and `bar` support `stacked`; `bar` supports `horizontal`; `pie`/`donut` and the radial/hierarchy/geo/graph types ignore cartesian options. On roots `line`/`area`/`bar`/`scatter`/`rangearea`, individual series may override their mark via [`SeriesOptions.type`](#seriesoptions) (combo). |
| `data` | `ChartData` | — (required) | The data. See [Data types](#data-types). |
| `theme` | `'light' \| 'dark' \| 'auto' \| Theme` | `'auto'` | Built-in theme, live `prefers-color-scheme` tracking (`'auto'`), or a custom [`Theme`](#theme) object. |
| `title` | `string` | `undefined` | Rendered above the plot in primary ink. Also the default accessible name — [always set one](../accessibility.md#guidance-for-chart-authors). Not rendered by `sparkline`. |
| `subtitle` | `string` | `undefined` | Rendered under the title in secondary ink. |
| `width` | `number` | container size | Fixed width in px. Setting it opts this dimension out of responsiveness. |
| `height` | `number` | container size | Fixed height in px. |
| `padding` | `number \| { top?: number; right?: number; bottom?: number; left?: number }` | auto | Padding around the plot area, px. A single number applies to all sides; the object form sets sides individually (unset sides keep the automatic value). |
| `xAxis` | `AxisOptions` | see [`AxisOptions`](#axisoptions) | X-axis config on cartesian types. Note that axis options bind by **role**: on `bullet`, `pyramid` and other horizontal/mirrored types, `xAxis` is the **value/magnitude** axis. |
| `yAxis` | `AxisOptions` | see [`AxisOptions`](#axisoptions) | Y-axis config. On `pyramid` this is the **category** axis; `streamgraph` and `gantt` suppress their cross-axis chrome entirely. |
| `stacked` | `boolean` | `false` | Stack series. `bar` and `area` only (`lollipop` **throws**; `streamgraph` computes its own baseline and ignores it). |
| `horizontal` | `boolean` | `false` | Horizontal bars (categories on the y-axis, values on x). `bar` only; `bullet` forces it to `true`. With `horizontal: true`, per-series combo `type` overrides are ignored. |
| `legend` | `LegendOptions \| boolean` | auto | Default: shown when there are ≥ 2 series, hidden for 1 — with documented per-type exceptions ([`LegendOptions`](#legendoptions)). `true`/`false` force; object configures. |
| `tooltip` | `TooltipOptions \| boolean` | `true` | See [`TooltipOptions`](#tooltipoptions). |
| `animation` | `AnimationOptions \| boolean` | `true` | Entry/update/toggle animation. Auto-disabled under `prefers-reduced-motion: reduce`, and force-disabled by `candlestick`/`ohlc`. |
| `downsample` | `{ enabled?: boolean; threshold?: number }` | `{ enabled: true, threshold: 5000 }` | Automatic LTTB downsampling for `line`/`area`/`scatter` series beyond `threshold` points. Render-side only. With [zoom](../features/zoom-pan-brush.md), it re-runs against the visible window. `rangearea` band series and `streamgraph` are excluded. |
| `a11y` | `A11yOptions` | see [`A11yOptions`](#a11yoptions) | Accessibility configuration. |
| `dataLabels` | `DataLabelOptions \| boolean` | `false` | **v0.3.** Value labels on marks (cartesian types). See [`DataLabelOptions`](#datalabeloptions) and [Data labels](../features/data-labels.md). |
| `annotations` | `Annotation[]` | `[]` | **v0.3.** Reference lines, bands, labeled points and free text (cartesian types). See [`Annotation`](#annotation) and [Annotations](../features/annotations.md). |
| `zoom` | `ZoomOptions \| boolean` | `false` | **v0.3.** Zoom, pan and brush on continuous axes. See [`ZoomOptions`](#zoomoptions) and [Zoom, pan & brush](../features/zoom-pan-brush.md). |
| `histogram` | `{ bins?: number \| 'auto' }` | `{ bins: 'auto' }` | Histogram only. See [Per-type options](#histogram). |
| `heatmap` | `{ ramp?: string[]; min?: number; max?: number }` | ramp `sequentialPalette`, min/max data extent | Heatmap only. See [Per-type options](#heatmap). |
| `gauge` | `{ min?: number; max?: number; bands?: { to: number; color: string }[] }` | `{ min: 0, max: 100 }` | Gauge only. See [Per-type options](#gauge). |
| `waterfall` | `{ connectors?: boolean }` | `{ connectors: true }` | Waterfall only. See [Per-type options](#waterfall). |
| `rangearea` | `{ showBounds?: boolean }` | `{ showBounds: true }` | **v0.3.** Hairline edges on the band. See [`rangearea`](#rangearea). |
| `bullet` | `{ ranges?: number[]; target?: number }` | none | **v0.3.** Qualitative range boundaries (ascending) and a default target. See [`bullet`](#bullet). |
| `calendar` | `{ start?: Date \| number; end?: Date \| number; weekStart?: 0 \| 1; ramp?: string[] }` | data extent, `weekStart: 0`, `sequentialPalette` | **v0.3.** UTC day range and ramp. See [`calendar`](#calendar). |
| `violin` | `{ bandwidth?: number \| 'auto'; showBox?: boolean }` | `{ bandwidth: 'auto', showBox: true }` | **v0.3.** KDE bandwidth and inner box. See [`violin`](#violin). |
| `radialbar` | `{ innerRadius?: number; maxValue?: number; track?: boolean }` | `{ innerRadius: 0.3 }`, `maxValue` = data max | **v0.3.** See [`radialbar`](#radialbar). |
| `rose` | `{ startAngle?: number }` | `{ startAngle: 0 }` | **v0.3.** Degrees clockwise from 12 o'clock. See [`rose`](#rose). |
| `sankey` | `{ nodeWidth?: number; nodePadding?: number; align?: 'left' \| 'right' \| 'justify' }` | `{ nodeWidth: 16, nodePadding: 8 }` | **v0.3.** See [`sankey`](#sankey). |
| `gantt` | `{ rowHeight?: number; today?: Date \| number }` | `rowHeight` = fit | **v0.3.** See [`gantt`](#gantt). |
| `wordcloud` | `{ minFontSize?: number; maxFontSize?: number; rotate?: boolean }` | `{ minFontSize: 12, maxFontSize: 48, rotate: false }` | **v0.3.** See [`wordcloud`](#wordcloud). |
| `network` | `{ linkDistance?: number; charge?: number; iterations?: number; fixedSeed?: number }` | `{ linkDistance: 40, charge: -220, iterations: 300, fixedSeed: 1 }` | **v0.3.** Deterministic force layout. See [`network`](#network). |
| `choropleth` | `{ geojson: GeoFeatureCollection; projection?: …; featureKey?: string; ramp?: string[]; min?: number; max?: number; unmatched?: 'warn' \| 'strict' \| 'omit' }` | `projection: 'mercator'`, `featureKey: 'name'`, `unmatched: 'warn'` | **v0.3.** `geojson` is **required** — topology is never bundled. See [`choropleth`](#choropleth). |
| `parallel` | `{ axes?: string[] }` | `categories`, else the 1-based index | **v0.3.** Dimension names, in order. See [`parallel`](#parallel). |

---

## Data types

### `ChartData`

| Field | Type | Default | Description |
|---|---|---|---|
| `categories` | `(string \| number \| Date)[]` | `undefined` | Shared band x-axis labels — for `bar`, `line`/`area` with a category x, and most band-based v0.3 types (`dumbbell`, `lollipop`, `slope`, `streamgraph`, `marimekko`, `pyramid`, `radialbar`, `rose`, `violin`, and `parallel` dimension names). Plain-number `DataValue`s index into this array. |
| `series` | `SeriesOptions[]` | — (required) | One or more series. Some types render only the first visible series (`waterfall`, `bullet`, `rose`, `calendar`); `pyramid` requires exactly 2. |

### `SeriesOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | `name` | **Stable identity.** Drives palette-slot assignment (first-seen order), update matching/animation, and event payloads (`seriesId`). Set it explicitly when names can change or series lists are dynamic. |
| `name` | `string` | — (required) | Label shown in the legend and tooltip. |
| `data` | `SeriesData` | — (required) | The points, or — for `sankey`/`network` — the whole graph. See [`SeriesData`](#seriesdata). |
| `color` | `string` | palette slot | Overrides the palette color for this series. Otherwise the series gets the next free slot of the theme palette by first-seen identity. (Ignored where the type owns coloring: `dumbbell` endpoints, `bullet` ranges, hierarchy children, `network` groups.) |
| `visible` | `boolean` | `true` | Hidden series keep their palette slot and legend entry (dimmed). Legend toggling flips this. |
| `curve` | `'linear' \| 'monotone' \| 'step'` | `'linear'` | Interpolation between points. `line`/`area` only. **Deliberately ignored** by `slope` (a smoothed slope chart invents crossings) and `streamgraph` (a ribbon's thickness must be exactly its value). |
| `lineWidth` | `number` | `2` | Stroke width in px. `line`/`area` only. |
| `showMarkers` | `boolean \| 'auto'` | `'auto'` | Point markers on the line. `'auto'` shows markers when the series has ≤ 60 points. `line`/`area` only. |
| `type` | `SeriesKind` | root `type` | **Combo:** per-series mark override on charts whose root type is `line`/`area`/`bar`/`scatter`/`rangearea`. All series share **one** y-axis — no dual axes, ever. Vertical orientation only: with `horizontal: true` overrides are ignored. `lollipop` refuses overrides. See the [combo example](../examples/combo.md). |
| `sizeRange` | `[number, number]` | `[8, 40]` | `bubble` only: min/max marker **diameter** in px. The point's `r` value maps to marker **area**, never radius. |
| `errorBars` | `ErrorBarOptions` | `undefined` | **v0.3.** Opts this series into [error bars](../features/error-bars.md) (even `{}`). Root types `line`/`area`/`bar`/`scatter`/`bubble`. |
| `trendline` | `TrendlineOptions` | `undefined` | **v0.3.** Adds a fitted [trendline](../features/trendlines.md). Root types `line`/`scatter`/`bubble`. |
| `lowKey` | `string` | `'low'` | **v0.3.** Object-data field read into `low` (range types). On `dumbbell` it doubles as the **name of the low endpoint** in the legend and table. |
| `highKey` | `string` | `'high'` | **v0.3.** Object-data field read into `high`; on `dumbbell`, the high endpoint's name. |

```ts
type SeriesKind = 'line' | 'bar' | 'area' | 'scatter' | 'rangearea';
```

`'rangearea'` is a real mark kind, which is what makes the canonical forecast
chart (a band plus a line of the same color) **one** chart with **one** y-axis.
Bands paint first: `rangearea < area < bar < line < scatter`.

### `SeriesData`

```ts
type SeriesData = DataValue[] | GraphData;
```

A series carries either a list of data values or — for `sankey` and `network`,
whose whole series *is* the graph — a node/link payload. **Both typecheck; neither
needs a cast.**

```ts
interface GraphData {
  nodes: readonly GraphNodeInput[];
  links: readonly GraphLinkInput[];
}
interface GraphNodeInput { id?: string; label?: string; color?: string; group?: string; value?: number }
interface GraphLinkInput { source: string | number; target: string | number; value?: number; label?: string; color?: string }
```

`source`/`target` accept a node `id` **or** a 0-based node index. `GraphData`,
`GraphNodeInput` and `GraphLinkInput` are all exported.

### `DataValue`

```ts
type DataValue =
  | number | null                                  // y against categories/index (null = gap)
  | [number | Date, number | null]                 // [x, y] pair
  | [number | Date, number, number]                // [x, y, r] bubble triple OR [x, low, high] range
  | [number | Date, number, number, number, number] // [x, o, h, l, c] candlestick/ohlc
  | DataPoint;                                     // rich object form
```

The interchangeable shapes (a series may use any one of them):

| Shape | x comes from | Use for |
|---|---|---|
| `number \| null` | `categories[index]`, or the index itself | bars, category lines, heatmap rows, histogram raw samples, slope/streamgraph/parallel values |
| `[x, y]` | the tuple's first element (`number` or `Date`) | time series, scatter |
| `[x, y, r]` | first element | bubble triples — **or** `[x, low, high]` on range types (`rangearea`, `dumbbell`), which read a three-element tuple as a range |
| `[x, o, h, l, c]` | first element | candlestick/OHLC |
| `DataPoint` object | `x` if present (also accepts `string`), else category/index | pie/donut slices, per-point labels or color overrides, and every v0.2/v0.3 object shape below |

`y: null` is an explicit **gap**: lines break (no interpolation), no bar is
drawn, the value is excluded from auto min/max, and the data table shows an
empty cell. Object-shape extras: `label` overrides the point's tooltip/table
label; `color` overrides that single mark's color.

`y` also has documented **fallbacks** when absent: the close (`c`), then
`weight`, then `low` — so OHLC data, wordcloud terms and range points all carry a
sensible generic value for tables, announcements and events.

### `DataPoint`

The rich object form of a datum — a superset; all fields optional, with
per-type semantics:

| Field | Type | Used by | Description |
|---|---|---|---|
| `x` | `number \| Date \| string` | all cartesian, pie/donut, funnel, waterfall, calendar, gantt, wordcloud, choropleth | Position / category / stage label / term / feature name. |
| `y` | `number \| null` | all | Value (`null` = gap). |
| `label` | `string` | all | Tooltip/table label override. On `choropleth` it is matched against the feature key **before** `x`. |
| `color` | `string` | all | Single-mark color override. |
| `r` | `number` | `bubble`, `marimekko` | Bubble size value (maps to marker **area** via `sizeRange`); on `marimekko`, the column **width** measure on the first series. |
| `o`, `h`, `l`, `c` | `number` | `candlestick`, `ohlc` | Open / high / low / close. `y` is not required — when omitted it defaults to the close. |
| `min`, `q1`, `median`, `q3`, `max` | `number` | `boxplot` | Precomputed 5-number summary. Alternative: a raw `number[]` per category — **any** numeric-array entry (any length) is treated as raw samples and summarized (R-7 quartiles, whiskers to the most extreme samples within 1.5×IQR, dots beyond). Same rule for `violin` samples. |
| `outliers` | `number[]` | `boxplot` | Outlier dots accompanying a 5-number summary. |
| `isTotal` | `boolean` | `waterfall` | The value is an **absolute total**, not a delta: the bar rises from the baseline and resets the running total. |
| `children` | `TreeNode[]` | `treemap`, `sunburst`, `icicle`, `circlepack` | Hierarchy nesting. |
| `value` | `number` | hierarchy types | **v0.3.** The `TreeNode` value — declared here so a genuine `TreeNode[]` is assignable without a cast. Read from the raw data; `y` is honored as a fallback. |
| `low`, `high` | `number \| null` | `rangearea`, `dumbbell`, `bullet`, `gantt` | **v0.3.** Range bounds: a band's edges, a dumbbell's two endpoints, a per-row bullet range, or a gantt span. Both bounds join the value extent unconditionally. |
| `eLow`, `eHigh` | `number` | error bars | **v0.3.** Absolute lower/upper bound of this datum's interval (not deltas). |
| `target` | `number` | `bullet` | **v0.3.** Per-row target marker; overrides `bullet.target`. |
| `start`, `end` | `number \| Date` | `gantt` | **v0.3.** Task span (`low`/`high` also accepted). |
| `group` | `string` | `gantt`, `network`, `parallel` | **v0.3.** Swimlane / cluster / class. |
| `weight` | `number` | `wordcloud` | **v0.3.** Term weight — an alias of `y`. |
| `id` | `string` | `sankey`, `network` | **v0.3.** Node id (usually supplied via [`GraphData`](#seriesdata) instead). |

### `TreeNode`

```ts
interface TreeNode { label: string; value?: number; color?: string; children?: TreeNode[] }
```

Hierarchy data (`treemap`, `sunburst`, `icicle`, `circlepack`) is one series of
`TreeNode[]`. `value` is optional when `children` are present (the parent's value
is the sum of its children).

::: tip No cast needed since v0.3
`DataPoint` declares `value?: number`, so a genuine `TreeNode[]` is assignable to
`DataValue[]` directly. The hierarchy types read their nodes from the **raw**
options data (the generic normalizer maps object data through `y`, so a top-level
`value` would otherwise be lost).

**Nested-node event caveat:** point events are built from the backing *top-level*
datum, so for a nested node `x`/`y` describe that top-level datum, and no event
fires for indices beyond the top-level count. Tooltips, hit-testing, focus
announcements and the a11y table always describe the correct node.
:::

::: warning Raw sample arrays still need an assertion
`histogram` takes `number[]` per series, and `boxplot`/`violin` take a raw
`number[]` **per category**. The `DataValue` union only names the 2/3/5-element
tuple shapes, so a longer per-category array needs
`values as unknown as DataValue`. This is the one remaining shape the public types
cannot express.
:::

---

## Per-type options

### `histogram`

Data is **raw samples** (`number[]` per series); the chart bins them.

| Field | Type | Default | Description |
|---|---|---|---|
| `bins` | `number \| 'auto'` | `'auto'` | `'auto'` = Freedman–Diaconis, clamped 5..60, with the width snapped **up** to a nice 1/2/5 step and the first edge aligned to a multiple of it — for ≤ 12 bins, axis ticks land exactly on every bin edge. An explicit `number` splits the raw data extent equally; those edges are generally not nice values, so ticks stay at the axis's own nice positions. |

Bins are the interaction unit: `dataIndex` is the **bin index** (the event's
`x`/`y` carry the backing raw sample), while tooltip, announcements and the a11y
table carry the bin range + count.

### `heatmap`

Each series is one **row**; its `data: number[]` aligns to `categories`.

| Field | Type | Default | Description |
|---|---|---|---|
| `ramp` | `string[]` | `sequentialPalette` | Sequential color ramp for cell values. |
| `min` | `number` | data extent | Value mapped to the ramp start. Pin it to share one scale across charts. |
| `max` | `number` | data extent | Value mapped to the ramp end. |

The legend is a gradient color-scale bar (non-toggleable) shown **even for a
single row**.

### `gauge`

Single series, single value, 270° arc; the subtitle carries the units.

| Field | Type | Default | Description |
|---|---|---|---|
| `min` | `number` | `0` | Range start. |
| `max` | `number` | `100` | Range end. |
| `bands` | `{ to: number; color: string }[]` | none | Optional colored ranges (each band runs from the previous `to` up to its own). With bands, the track shows band colors at 0.35 alpha and the value arc overlays them at full alpha in the color of the band the value falls in. Without bands, the value arc is `theme.series[0]` over a gridline-colored track. |

### `waterfall`

Single series of **deltas**; `isTotal: true` points are absolute totals.

| Field | Type | Default | Description |
|---|---|---|---|
| `connectors` | `boolean` | `true` | Hairline connectors between consecutive bars. |

Increases render in `theme.up`, decreases in `theme.down`, totals in
`theme.neutral`; a total bar rises from zero and **resets** the running total.
Only the first visible series renders.

### `rangearea`

| Field | Type | Default | Description |
|---|---|---|---|
| `showBounds` | `boolean` | `true` | Hairline edges on the band. `false` leaves the 0.18-alpha fill alone. |

On a `rangearea` root, a series renders as a band exactly when its data carries
**both** bounds; a half-open point is a gap. [Details](../examples/rangearea.md).

### `bullet`

| Field | Type | Default | Description |
|---|---|---|---|
| `ranges` | `number[]` | none | Qualitative range boundaries, **ascending**. Drawn as nested grey lightness steps from `theme.axisLine` (innermost) to `theme.gridline` (outermost) — never hues. A datum's own `low`/`high` replaces these for that row. |
| `target` | `number` | none | Default target tick for rows whose datum has no `target`. |

The type forces `horizontal: true` and an **exact** `[0, max]` value axis (no
`nice()` widening). [Details](../examples/bullet.md).

### `calendar`

| Field | Type | Default | Description |
|---|---|---|---|
| `start` | `Date \| number` | data extent | First day shown. **Interpreted in UTC**; a plain number is epoch ms. |
| `end` | `Date \| number` | data extent | Last day shown (UTC). |
| `weekStart` | `0 \| 1` | `0` (Sunday) | `1` starts weeks on Monday. |
| `ramp` | `string[]` | `sequentialPalette` | Cell color ramp. There is no `min`/`max`, so the color extent is always the data extent. |

Days in range with no datum are filled `theme.gridline` and are not hoverable.
[Details](../examples/calendar.md).

### `violin`

| Field | Type | Default | Description |
|---|---|---|---|
| `bandwidth` | `number \| 'auto'` | `'auto'` | KDE bandwidth. `'auto'` = Silverman's rule (`0.9 · min(sd, IQR/1.34) · n^(-1/5)`). A non-positive explicit value is rejected. |
| `showBox` | `boolean` | `true` | Inner box plot (median, quartiles, Tukey whiskers) in `theme.neutral`. |

Each violin is normalized to its **own** peak density; the density is trimmed to
each sample's `[min, max]`. [Details](../examples/violin.md).

### `radialbar`

| Field | Type | Default | Description |
|---|---|---|---|
| `innerRadius` | `number` | `0.3` | Inner radius as a fraction (0..1) of the outer radius. |
| `maxValue` | `number` | data max | Value that fills a full sweep. |
| `track` | `boolean` | `false` | Draw the unreached remainder of each track at gridline color. |

Arc thickness and gaps are **computed** to fill the band exactly. Negative
values throw. [Details](../examples/radialbar.md).

### `rose`

| Field | Type | Default | Description |
|---|---|---|---|
| `startAngle` | `number` | `0` | **Degrees clockwise from 12 o'clock.** A non-finite value throws. |

Radius ∝ √value (area-true). Negative values throw; only the first visible
series is drawn. [Details](../examples/rose.md).

### `sankey`

| Field | Type | Default | Description |
|---|---|---|---|
| `nodeWidth` | `number` | `16` | Node bar width in px. |
| `nodePadding` | `number` | `8` | Vertical gap between node bars, clamped to a **2px minimum**. |
| `align` | `'left' \| 'right' \| 'justify'` | `'justify'` | Layer alignment of nodes. |

Data is `{ nodes, links }` on the first series; **cycles throw**.
[Details](../examples/sankey.md).

### `gantt`

| Field | Type | Default | Description |
|---|---|---|---|
| `rowHeight` | `number` | fit | Row height in px. The default divides the rows area by the row count (swimlane headers included); an explicit value is used verbatim. |
| `today` | `Date \| number` | none | 2px dashed marker labeled "Today". **Drawn only when it falls inside the schedule's extent** — a marker outside the data is simply absent. |

Tasks are `{ x, start, end, group? }` (or `low`/`high`).
[Details](../examples/gantt.md).

### `wordcloud`

| Field | Type | Default | Description |
|---|---|---|---|
| `minFontSize` | `number` | `12` | Font size for the lowest weight. Swapped bounds are normalized. |
| `maxFontSize` | `number` | `48` | Font size for the highest weight. A degenerate weight range puts every term at this size. |
| `rotate` | `boolean` | `false` | Rotate **odd ranks** by 90° (deterministic alternation, not a random draw). |

`dataIndex` is a **rank**, and unplaceable terms are dropped from the picture but
kept in the table and keyboard walk. [Details](../examples/wordcloud.md).

### `network`

| Field | Type | Default | Description |
|---|---|---|---|
| `linkDistance` | `number` | `40` | Target link length in abstract layout units. |
| `charge` | `number` | `-220` | Repulsion strength (negative repels). |
| `iterations` | `number` | `300` | Fixed simulation steps — run to completion, no early exit, no animation loop. |
| `fixedSeed` | `number` | `1` | Seed for the layout's only pseudo-random term. Same seed + same graph = same picture. |

Node radius is area-true (`√value`); legend "auto" keys off the **group** count.
[Details](../examples/network.md).

### `choropleth`

| Field | Type | Default | Description |
|---|---|---|---|
| `geojson` | `GeoFeatureCollection` | — **(required)** | Your topology. ChartCraft bundles none and fetches none. Only `Polygon`, `MultiPolygon` and the polygon members of a `GeometryCollection` are drawn. |
| `projection` | `'mercator' \| 'equirectangular' \| 'albersUsa' \| 'orthographic'` | `'mercator'` | Fitted to the plot rect. |
| `featureKey` | `string` | `'name'` | GeoJSON property matched **exactly** against each datum's `label ?? x` (looked up in `properties[key]`, then the feature, then `feature.id` for `'id'`). |
| `ramp` | `string[]` | `sequentialPalette` | Fill ramp. |
| `min` / `max` | `number` | data extent | Ramp ends. |
| `unmatched` | `'warn' \| 'strict' \| 'omit'` | `'warn'` | Policy for a data row matching **no** feature: `'warn'` = one structured `console.warn` (per distinct diagnostic) plus a sentence in the accessible description; `'strict'` = throw; `'omit'` = silent. Under every policy the row keeps its a11y table entry, so `exportData()` loses nothing. |

```ts
interface GeoFeatureCollection { type: 'FeatureCollection'; features: unknown[] }
```

Features with **no datum** are always filled `theme.gridline`, are not hoverable,
and appear in the table as `no data`. [Details](../examples/choropleth.md).

### `parallel`

| Field | Type | Default | Description |
|---|---|---|---|
| `axes` | `string[]` | `categories`, else the 1-based index | Dimension names, in order. Each series' `data` carries one value per dimension. |

Every axis is scaled to the raw extent of its own dimension, with **no** `nice()`
widening. [Details](../examples/parallel.md).

---

## Feature options

### `ErrorBarOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | — | Uniform absolute delta (`y ± value`). Wins over `percent`. |
| `percent` | `number` | — | Uniform relative delta, as a percentage of `\|y\|`. |
| `capWidth` | `number` | `6` | Cap width in px. |
| `color` | `string` | series color darkened 30% | Whisker color; falls back to `theme.textSecondary` for non-hex series colors. |

Per-point `eLow`/`eHigh` win over both uniform forms. The interval joins the
value domain, the tooltip (`value (low–high)`) and the a11y table (`± low` /
`± high` columns, therefore also `exportData()`).
[Full page](../features/error-bars.md).

### `TrendlineOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `'linear' \| 'movingAverage' \| 'exponential'` | `'linear'` | Least squares / centered window / `y = ae^{bx}` fitted on `ln y`. |
| `period` | `number` | `7` | `movingAverage` window; clamped at the series edges (partial averages). |
| `color` | `string` | series color | Line color. |
| `dashed` | `boolean` | `true` | Dashed `[6, 4]` — a trendline must never read as data. |
| `label` | `string \| false` | `"<series> trend"` | Legend entry; `false` removes it. |

**Excluded from the value domain, unconditionally**, and clipped to the plot.
[Full page](../features/trendlines.md).

### `DataLabelOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | `false` | Master switch (`dataLabels: true/false` is shorthand). |
| `format` | `(point: TooltipPoint) => string` | axis-formatted value | Label text, as **plain text**. |
| `select` | `'auto' \| 'all' \| 'extremes' \| 'endpoints' \| 'last'` | `'auto'` | `'auto'` = endpoints ∪ extremes, then **measured** collision filtering (drop priority max → min → last → first, 2px clearance). `'all'` skips the filtering. |
| `position` | `'outside' \| 'inside' \| 'auto'` | `'auto'` | `'auto'` prefers outside and flips inside when the box would leave the plot. |

Labels wear `theme.textPrimary` (ink), never the series color. Cartesian types
only. [Full page](../features/data-labels.md).

### `Annotation`

```ts
type Annotation =
  | { kind: 'line'; axis: 'x' | 'y'; value: number | Date; label?: string; color?: string; dashed?: boolean }
  | { kind: 'band'; axis: 'x' | 'y'; from: number | Date; to: number | Date; label?: string; color?: string }
  | { kind: 'point'; x: number | Date | string; y: number; label: string; color?: string }
  | { kind: 'text'; x: number | Date | string; y: number; text: string; color?: string };
```

`axis: 'x'` is the **data** axis, `axis: 'y'` the **value** axis, whichever screen
direction each is. Bands draw **under** the marks at 0.55 alpha; lines (dashed by
default), points and text draw **above** everything, clipped to the plot.
Unplaceable annotations are dropped, not clamped. Clicks are consumed and emit
[`annotationclick`](#events). Annotations join the accessible **description**,
never the data table. [Full page](../features/annotations.md).

### `ZoomOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master switch (`zoom: true/false` is shorthand). |
| `axis` | `'x' \| 'y' \| 'xy'` | `'x'` | Zoomable axes. **Continuous axes only** — band axes ignore the viewport. |
| `wheel` | `boolean` | `true` | ctrl/⌘ + wheel zooms about the pointer. |
| `drag` | `boolean` | `true` | Drag brushes a region and zooms on release. |
| `pan` | `boolean` | `true` | Once zoomed, a plain drag pans (`Shift`+drag brushes). |
| `minSpan` | `number` | none | Smallest zoomable **x** span in data units. |

```ts
type ZoomRange = { x?: [number, number]; y?: [number, number] } | null;
```

Keyboard: `+`/`-` zoom, **`Shift`+arrows** pan (plain arrows always stay with
point navigation), `Escape` resets. [Full page](../features/zoom-pan-brush.md).

---

## Component options

### `AxisOptions`

Applies to `xAxis` and `yAxis` on cartesian types. Axis options bind by **role**,
not screen direction — see the note in [`ChartOptions`](#chartoptions).

| Field | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | `undefined` | Axis title. |
| `min` | `number \| 'auto'` | `'auto'` | Domain minimum. `'auto'` fits the data; bar/area baselines anchor at 0 for non-negative data. Must be > 0 on a `log` axis. |
| `max` | `number \| 'auto'` | `'auto'` | Domain maximum. `'auto'` adds headroom above the data. |
| `type` | `'linear' \| 'time' \| 'log' \| 'category'` | inferred | Inferred from the data: categories/string x → `category`, `Date` x → `time`, numeric → `linear`. **`log` is never inferred.** `gantt` pins `'time'`. |
| `ticks.count` | `number` | from axis size | Approximate tick count; the scale picks "nice" values near it. |
| `ticks.format` | `(value: number \| Date \| string) => string` | locale default | Tick label formatter. Also used for tooltip `formattedX`/`formattedY` and the data table. |
| `grid` | `boolean` | `true` on y, `false` on x | Hairline gridlines for this axis. `gantt` defaults its **time** axis grid to `true` (its cross axis is a list of rows with nothing to grid). |

Some types suppress axis chrome by design: `sparkline` (all), `streamgraph` (the
value axis, margin included), `gantt` (the row axis), `marimekko` and `pyramid`
(their own layouts). See [Scales and axes](../concepts/scales-and-axes.md).

### `LegendOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | auto | Default: visible when ≥ 2 series, hidden for 1 — with per-type exceptions below. |
| `position` | `'top' \| 'bottom' \| 'right'` | `'top'` | Placement relative to the plot. |
| `interactive` | `boolean` | `true` | Clicking (or keyboard-activating) an item toggles the series' `visible` flag and emits `legendtoggle`. |

`legend: boolean` is shorthand for `{ show: boolean }`. Documented per-type
policies:

| Type | Policy |
|---|---|
| `pie` / `donut` / `radialbar` (1 series) / `rose` | Items are **slices/categories**, non-toggleable; auto keys off the slice count (shown from 2). |
| `heatmap` / `calendar` / `choropleth` | A gradient color-scale bar, non-toggleable, shown **even for one series** — it is the only key to the colors. |
| `dumbbell` | The two **endpoints**, non-toggleable, shown even for one series. |
| `network` | **Groups**, non-toggleable; auto keys off the group count (shown from 2). |
| `funnel` / `bullet` / `wordcloud` / `sankey` / `gantt` | Hidden by default (marks are directly labeled). An explicit `legend: true` lists terms / nodes / swimlanes, non-toggleable. |
| `slope` | Hidden when direct end labels fit; otherwise shown. |
| `sparkline` | Off by default; an explicit `legend: true` is honored. |

### `TooltipOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | `true` | |
| `shared` | `boolean` | `true` on `line`/`area`; `false` elsewhere | Shared: one crosshair-anchored tooltip listing every visible series at the nearest x. Per-mark: describes the single mark under the pointer. `shared` is only meaningful for cartesian line-likes. |
| `format` | `(points: TooltipPoint[]) => string` | built-in | Returns an **HTML string** for the tooltip body. Escape user-provided strings. |

`tooltip: boolean` is shorthand for `{ show: boolean }`. Features enrich the
points *before* `format` runs (error bars turn `10` into `10 (8–12)`), so your
formatter never has to know about them.

#### `TooltipPoint`

| Field | Type | Description |
|---|---|---|
| `seriesId` | `string` | Series identity (`id` ?? `name`). |
| `seriesName` | `string` | Display name. |
| `color` | `string` | The series' resolved color (for swatches). |
| `x` | `number \| Date \| string \| null` | Raw x value. |
| `y` | `number \| null` | Raw y value (`null` = gap). |
| `formattedX` | `string` | x formatted with the axis formatter. |
| `formattedY` | `string` | y formatted with the axis formatter. |

### `AnimationOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `duration` | `number` | `300` | Milliseconds. |
| `easing` | `'linear' \| 'ease-out' \| 'ease-in-out'` | library default | Easing curve. |

`animation: boolean` toggles animation entirely. Regardless of settings,
animation is disabled under `prefers-reduced-motion: reduce`, and
`candlestick`/`ohlc` force it off (there is no legal animated presentation for
those marks). Geometry that lives outside the interpolated model — heatmap and
calendar cells, treemap/icicle cells, sankey ribbons, gantt bars — is drawn at its
target values every frame.

### `A11yOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `options.title`, else generated | The chart's `aria-label`. |
| `description` | `string` | `undefined` | Longer prose description. Concatenated with the chart type's own description and any decorator's (annotations, unmatched choropleth rows) into **one** visually-hidden node. |
| `table` | `'hidden' \| 'visible' \| 'off'` | `'hidden'` | The parallel data `<table>`. `'off'` removes the DOM table; `exportData()` still works. |
| `keyboard` | `boolean` | `true` | Arrow-key navigation with `aria-live` announcements. All 39 types ship a keyboard order. |

Full behavior in [Accessibility](../accessibility.md).

---

## Events

```ts
interface ChartEventMap {
  pointenter: PointEvent;
  pointleave: PointEvent;
  pointclick: PointEvent;
  legendtoggle: { seriesId: string; visible: boolean };
  render: { reason: 'init' | 'update' | 'resize' | 'toggle' };
  destroy: Record<string, never>;
  // v0.3
  zoom: { x?: [number, number]; y?: [number, number] } | null;
  annotationclick: { index: number; annotation: Annotation };
}
```

| Event | Payload | Fires when |
|---|---|---|
| `pointenter` | `PointEvent` | Pointer hover **or keyboard focus** enters a datum. |
| `pointleave` | `PointEvent` | Pointer/focus leaves the datum. |
| `pointclick` | `PointEvent` | Click, tap, or Enter on the focused datum. Suppressed when a decorator consumes the click (an annotation hit). |
| `legendtoggle` | `{ seriesId: string; visible: boolean }` | A legend item toggles a series. `visible` is the new state. |
| `render` | `{ reason: 'init' \| 'update' \| 'resize' \| 'toggle' }` | After each committed render, with why. |
| `destroy` | `Record<string, never>` (empty) | Once, from `destroy()`. Last event ever. |
| `zoom` | `ZoomRange` (`null` = reset) | **v0.3.** Once per completed zoom/pan/brush gesture, from `zoomTo()`, and on every reset — and only when the window actually changed. A pan emits on release, not per pointermove. |
| `annotationclick` | `{ index: number; annotation: Annotation }` | **v0.3.** An annotation mark is clicked; `index` is its position in your `annotations` array. The click is consumed. |

### `PointEvent`

| Field | Type | Description |
|---|---|---|
| `seriesId` | `string` | Series identity. |
| `seriesName` | `string` | Series display name. |
| `dataIndex` | `number` | Index of the datum within `series.data` — **or the type's natural mark index**: a bin (histogram), a depth-first node (treemap/sunburst/icicle/circlepack), a rank (wordcloud, network by degree), a row (bullet, gantt), a reading-order mark (sankey). |
| `x` | `number \| Date \| string \| null` | The datum's x value. |
| `y` | `number \| null` | The datum's y value. |
| `clientX`, `clientY` | `number` | Viewport coordinates of the pointer. **`-1` for keyboard-originated events.** |
| `native` | `Event \| null` | The originating DOM event; `null` when synthesized (keyboard paths). |

::: warning `dataIndex` and the backing datum
Payloads are built from `series.points[dataIndex]`. Where a type's mark index is
*not* a data index (nested hierarchy nodes, wordcloud ranks, histogram bins) the
event's `x`/`y` describe the datum **at that index**, which may not be the mark
you clicked, and no event fires for indices beyond the point count. The tooltip,
the announcement and the a11y table always describe the correct mark.
`sankey`, `gantt` and `network` do **not** have this limitation — they normalize
every mark into a real backing point.
:::

---

## Theming

### `Theme`

| Field | Type | Description |
|---|---|---|
| `colorScheme` | `'light' \| 'dark'` | Which scheme this theme is. |
| `surface` | `string` | Chart surface color. |
| `textPrimary` | `string` | Title ink. Also data labels and the bullet measure/target marks. |
| `textSecondary` | `string` | Subtitle ink. Also annotation labels, gantt swimlane headers and the today marker. |
| `textMuted` | `string` | Axis tick label ink. Also network links (at 0.35 alpha). |
| `gridline` | `string` | Hairline gridline color. Also "no data" fills (choropleth features, empty calendar days), dumbbell connectors, and the lightest bullet range step. |
| `axisLine` | `string` | Axis line color. Also the darkest bullet range step and the brush rectangle's edge. |
| `series` | `string[]` | **8 categorical slots in validated order — never re-sort.** See [Theming](../concepts/theming.md#why-the-order-must-not-change). |
| `fontFamily` | `string` | Default: `system-ui, -apple-system, "Segoe UI", sans-serif`. |
| `fontSize` | `number` | Base size in px. Default `12`. |
| `up` | `string` | Financial rise / waterfall increase. Light `#0ca30c`, dark `#0ca30c`. Status color — never impersonates a series slot. A doji candle (`close === open`) also renders in `up`. |
| `down` | `string` | Financial fall / waterfall decrease. Light `#d03b3b`, dark `#d03b3b`. |
| `neutral` | `string` | Waterfall totals & neutral marks, and the violin's inner box. Light `#52514e`, dark `#c3c2b7`. |

A custom theme must provide **every** field, `up`/`down`/`neutral` included — the
v0.2 status colors are part of the shape, and the v0.3 types lean on the chrome
colors above for their non-series marks.

### Built-in values

`lightTheme` / `darkTheme` use these validated values (do not alter hexes or
order):

| Slot | Light | Dark | | Chrome | Light | Dark |
|---|---|---|---|---|---|---|
| 1 | `#2a78d6` | `#3987e5` | | surface | `#fcfcfb` | `#1a1a19` |
| 2 | `#eb6834` | `#d95926` | | textPrimary | `#0b0b0b` | `#ffffff` |
| 3 | `#1baf7a` | `#199e70` | | textSecondary | `#52514e` | `#c3c2b7` |
| 4 | `#eda100` | `#c98500` | | textMuted | `#898781` | `#898781` |
| 5 | `#e87ba4` | `#d55181` | | gridline | `#e1e0d9` | `#2c2c2a` |
| 6 | `#008300` | `#008300` | | axisLine | `#c3c2b7` | `#383835` |
| 7 | `#4a3aa7` | `#9085e9` | | | | |
| 8 | `#e34948` | `#e66767` | | | | |

`categoricalPalette` exposes the same slot arrays as
`{ light: string[]; dark: string[] }`.

`sequentialPalette` is the single-hue blue ramp, light → dark:

```
#cde2fb #b7d3f6 #9ec5f4 #86b6ef #6da7ec #5598e7 #3987e5
#2a78d6 #256abf #1c5cab #184f95 #104281 #0d366b
```

It is the default ramp for `heatmap`, `calendar` and `choropleth`, and the source
of `funnel`'s ordinal stage steps.

---

## Utilities

### Scale classes

```ts
import { LinearScale, TimeScale, BandScale, LogScale } from '@chartcraft/core';
```

The scale implementations behind axis rendering, exported for advanced use —
building coordinated custom overlays, computing tick positions outside the
chart, or writing formatters that need domain knowledge:

- `LinearScale` — continuous numeric domain → pixel range; "nice" 1/2/5×10ⁿ
  ticks.
- `TimeScale` — `Date`/timestamp domain; calendar-aware tick generation (what
  `gantt` runs on).
- `BandScale` — discrete category domain → equal-width bands (bar layout).
- `LogScale` — base-10 logarithmic; positive domains only.

Which axis `type` maps to which scale is contract-fixed (see
[`AxisOptions`](#axisoptions)); the classes' constructor and method details
are part of the shipped `.d.ts` declarations rather than this contract
page, and are stable within a minor version.

### `downsampleLTTB`

```ts
import { downsampleLTTB } from '@chartcraft/core';
```

The Largest-Triangle-Three-Buckets implementation the chart uses internally
(see [Performance](../performance.md#lttb-downsampling)), exported so you can
downsample in your own pipeline — e.g. before persisting or transmitting
series data. It reduces a series to a target number of points while
preserving visual shape (peaks, troughs, outliers), keeping first and last
points and preserving `null` gaps.

### Decorators (experimental)

```ts
import { registerDecorator, unregisterDecorator, decorators, clearDecorators } from '@chartcraft/core';
import type { Decorator, DecoratorContext, DecoratorHost, DecorationLayer, Viewport } from '@chartcraft/core';
```

The pipeline-level overlay surface the five cross-cutting features are built on.
**Experimental — may change in a minor release.** Hook semantics, a worked
example and the rules a decorator must respect are on the
[Extensibility](../extensibility.md) page.

### `version`

```ts
import { version } from '@chartcraft/core';
```

The package version string — useful in bug reports and runtime feature checks.

::: warning Version string in this build
`version` still reports **`'0.2.0'`** even though this is the v0.3 feature set:
bumping the published version is a release step, not a plumbing one. Don't
feature-detect v0.3 with `version`; detect a capability instead (e.g.
`typeof chart.exportData === 'function'`).
:::
