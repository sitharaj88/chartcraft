# ChartCraft public API contract (v0.1)

This file is the **source of truth** for the public surface of
`@chartcraft/core` and the wrappers. Core implements exactly this; wrappers and
docs consume exactly this. Record any necessary deviation in `/DEVIATIONS.md`.

## Entry points (`@chartcraft/core`)

```ts
export function createChart(container: HTMLElement, options: ChartOptions): Chart;
export const version: string;

// Themes & palette (all exported)
export const lightTheme: Theme;
export const darkTheme: Theme;
export const categoricalPalette: { light: string[]; dark: string[] }; // 8 slots each
export const sequentialPalette: string[];   // blue ramp 100→700, as written light→dark
export function sequentialRampFor(scheme: 'light' | 'dark'): string[]; // the ramp DIRECTED for a surface

// Utilities (exported for advanced users & wrappers)
export { LinearScale, TimeScale, BandScale, LogScale } from './scales';
export { downsampleLTTB } from './data/downsample';
```

## The `Chart` instance

```ts
interface Chart {
  update(options: Partial<ChartOptions>): void;   // deep-merged, diffed re-render
  setData(data: ChartData): void;                 // convenience for update({ data })
  resize(): void;                                 // manual; auto via ResizeObserver by default
  destroy(): void;                                // removes DOM, observers, listeners
  on<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): () => void; // returns unsubscribe
  off<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): void;
  getOptions(): Readonly<ChartOptions>;           // resolved options snapshot
  readonly el: HTMLElement;                       // the container
}
```

## Options

```ts
type ChartType =
  // v0.1
  | 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut'
  // v0.2 (see "v0.2 chart types" section below for per-type specs)
  | 'bubble' | 'sparkline' | 'histogram' | 'boxplot' | 'candlestick' | 'ohlc'
  | 'waterfall' | 'heatmap' | 'treemap' | 'sunburst' | 'funnel' | 'radar' | 'gauge'
  // v0.3 (see "v0.3 chart types & features" section below)
  | 'rangearea' | 'bullet' | 'dumbbell' | 'lollipop' | 'slope'
  | 'streamgraph' | 'marimekko' | 'pyramid' | 'calendar'
  | 'radialbar' | 'rose' | 'violin' | 'parallel'
  | 'icicle' | 'circlepack' | 'wordcloud' | 'sankey' | 'gantt'
  | 'choropleth' | 'network';

interface ChartOptions {
  type: ChartType;
  data: ChartData;
  // Presentation
  theme?: 'light' | 'dark' | 'auto' | Theme;      // default 'auto' (follows prefers-color-scheme)
                                                 // OVERRIDDEN, at any setting, by forced-colors: active
  title?: string;                                  // rendered above plot, primary ink
  subtitle?: string;                               // secondary ink
  width?: number;                                  // px; default: container size (responsive)
  height?: number;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  // Cartesian only (ignored by pie/donut)
  xAxis?: AxisOptions;
  yAxis?: AxisOptions;
  stacked?: boolean;                               // bar/area stacking
  horizontal?: boolean;                            // bar only: horizontal bars
  // Components
  legend?: LegendOptions | boolean;                // default: auto (shown when series >= 2, hidden for 1;
                                                   // pie/donut: legend lists slices, auto keys off slice count,
                                                   // slice items are non-toggleable)
  tooltip?: TooltipOptions | boolean;              // default: true
  // Behavior
  animation?: AnimationOptions | boolean;          // default: true; auto-disabled by prefers-reduced-motion
  downsample?: { enabled?: boolean; threshold?: number }; // default { enabled: true, threshold: 5000 } (line/area/scatter)
  a11y?: A11yOptions;
}

interface ChartData {
  categories?: (string | number | Date)[];         // band x-axis (bar, or line/area with category x)
  series: SeriesOptions[];
}

interface SeriesOptions {
  id?: string;                                     // stable identity; defaults to name
  name: string;                                    // legend & tooltip label (required)
  data: DataValue[];
  color?: string;                                  // override; otherwise palette slot by first-seen identity
  visible?: boolean;                               // default true; legend toggles this
  // line/area only:
  curve?: 'linear' | 'monotone' | 'step';          // default 'linear'
  lineWidth?: number;                              // default 2
  showMarkers?: boolean | 'auto';                  // 'auto': markers when point count <= 60
}

type DataValue =
  | number | null                                  // y against categories/index (null = gap)
  | [number | Date, number | null]                 // [x, y] pair
  | { x?: number | Date | string; y: number | null; label?: string; color?: string };

interface AxisOptions {
  label?: string;                                  // axis title
  min?: number | 'auto';
  max?: number | 'auto';
  type?: 'linear' | 'time' | 'log' | 'category';   // default inferred from data
  ticks?: { count?: number; format?: (value: number | Date | string) => string };
  grid?: boolean;                                  // default: true on y, false on x
}

interface LegendOptions {
  show?: boolean;
  position?: 'top' | 'bottom' | 'right';           // default 'top'
  interactive?: boolean;                            // click toggles series; default true
}

interface TooltipOptions {
  show?: boolean;
  shared?: boolean;    // default: true on line/area (crosshair, all series at x), false on bar/scatter/pie
  format?: (points: TooltipPoint[]) => string;     // returns HTML string
}
interface TooltipPoint {
  seriesId: string; seriesName: string; color: string;
  x: number | Date | string | null; y: number | null;
  formattedX: string; formattedY: string;
}

interface AnimationOptions { duration?: number /* ms, default 300 */; easing?: 'linear' | 'ease-out' | 'ease-in-out'; }

interface A11yOptions {
  title?: string;         // aria label; defaults to options.title or a generated summary
  description?: string;   // longer text description
  table?: 'hidden' | 'visible' | 'off';  // data table fallback; default 'hidden' (visually hidden, AT-readable)
  keyboard?: boolean;     // arrow-key point navigation + live announcements; default true
  tableMaxRows?: number;  // rows MATERIALIZED into the DOM table; default 2000, Infinity allowed
}
```

`tableMaxRows` bounds the DOM table only. Building the table costs ~115 &micro;s
per row (one `<tr>` per datum, rebuilt on every data change), so raising it to
100,000 buys an ~11.5-second synchronous stall and 1,000,000 exhausts the heap
— which is why the default exists. Whatever the bound:

- the truncation is stated in the table's own `<caption>` **and** in the chart's
  accessible description, each naming `exportData()` as the complete source;
- **`exportData()` is never capped** — it returns every row, always;
- the bound is pushed DOWN into the chart type, not applied after the fact: a
  type whose rows are expensive to build (one formatted row object per datum)
  builds only the rows the DOM can show and reports the true total alongside
  them, so a bounded table no longer costs a full row build on mount. Types that
  do not opt in are bounded by the pipeline instead and behave identically.

```ts
```

### `type: 'log'` — a log axis derives its domain from the positive data only

`log10` is undefined at and below zero, so a log axis has no zero, no negative
half and no "outward" direction toward either. Every stage that widens a value
domain therefore behaves differently on one (v0.4.0):

- **zero anchoring does not apply.** Bars and areas are measured from zero on a
  linear axis; the bottom of a log plot is a decade, not zero.
- **rounding is to whole DECADES**, not to nice linear multiples. A 1.2 … 260
  extent becomes 1 … 1000 on a log axis and 0 … 300 on a linear one. This covers
  every type that widens its own contribution (`boxplot`, `violin`,
  `candlestick`/`ohlc`) and a stack's zero floor.
- **a non-positive bound is discarded, never clamped.** That includes an explicit
  `min`/`max` and a zoom viewport edge: the data-derived bound stands in instead.
  (Clamping a 0 floor to a tiny epsilon is what produced a 1e-12 … 1e3 axis with
  every mark squashed into the top tenth of the plot.)
- **a value ≤ 0 in the DATA is dropped**: it becomes a gap — `null`, the same
  representation `NaN`/`±Infinity` already fold to — is excluded from the domain,
  and is listed as "no value" in the accessible table and in `exportData()`. The
  chart says so **once** on the console, naming the two ways out (a linear axis,
  or shifting the data into positive territory). It is not an error: the library
  throws for STRUCTURAL impossibilities (a `pyramid` without two series, a cyclic
  `sankey`) because there is nothing to draw at all, and one non-positive row is
  not that — a live dashboard must not go blank when a linear axis is switched to
  log. A log axis with no positive data at all shows one empty decade.

The same guarantee applies to a log **data** (x) axis: non-positive x positions
are excluded from its extent.

## Events

```ts
interface ChartEventMap {
  pointenter: PointEvent;   // pointer or keyboard focus enters a datum
  pointleave: PointEvent;
  pointclick: PointEvent;   // click / Enter on focused datum
  legendtoggle: { seriesId: string; visible: boolean };
  render: { reason: 'init' | 'update' | 'resize' | 'toggle' };
  destroy: Record<string, never>;
}
interface PointEvent {
  seriesId: string; seriesName: string;
  dataIndex: number;
  x: number | Date | string | null; y: number | null;
  color: string;                      // v0.4.0 — the colour of the MARK, as drawn
  clientX: number; clientY: number;   // -1 for keyboard-originated events
  native: Event | null;
}
```

`PointEvent.color` (v0.4.0) is resolved by the same code path as
`TooltipPoint.color`, so a click swatch and a tooltip swatch can never disagree:
a per-datum `color` override wins, then the mark's own palette slot for the types
that assign one per mark (`pie`/`donut`, `rose`, `radialbar`, `sunburst`), then
the series' slot. It exists so a detail panel never has to re-derive it —
re-derivation is not merely tedious but wrong, because palette slots follow
series **identity** (stable across filtering and updates), not the series' index
in `data.series`.

`color` is **required**, matching `TooltipPoint.color`: the pipeline always knows
the colour of the mark it just hit, and an optional field would put a `?.` on the
common read path forever to accommodate a rare mock. Handlers only ever READ a
`PointEvent`, so this is source-compatible for them — but **constructing** one (a
test fixture, a synthetic event, a mock chart) now requires the field, which is
why the release carrying it is a minor and not a patch.

## Theme shape

```ts
interface Theme {
  colorScheme: 'light' | 'dark';
  surface: string;            // chart surface
  textPrimary: string;
  textSecondary: string;
  textMuted: string;          // axis tick labels
  gridline: string;           // hairline
  axisLine: string;
  series: string[];           // 8 categorical slots, validated order — never re-sort
  fontFamily: string;         // default: system-ui, -apple-system, "Segoe UI", sans-serif
  fontSize: number;           // base px, default 12
  // status colours (v0.2 / v0.4.0) — see the v0.2 Theme block below.
  up: string; down: string; neutral: string; warning?: string;
}
```

### Default palette values (validated — do not alter hexes or order)

| Slot | Light | Dark |    | Chrome | Light | Dark |
|---|---|---|---|---|---|---|
| 1 | `#2a78d6` | `#3987e5` | | surface | `#fcfcfb` | `#1a1a19` |
| 2 | `#eb6834` | `#d95926` | | textPrimary | `#0b0b0b` | `#ffffff` |
| 3 | `#1baf7a` | `#199e70` | | textSecondary | `#52514e` | `#c3c2b7` |
| 4 | `#eda100` | `#c98500` | | textMuted | `#898781` | `#898781` |
| 5 | `#e87ba4` | `#d55181` | | gridline | `#e1e0d9` | `#2c2c2a` |
| 6 | `#008300` | `#008300` | | axisLine | `#c3c2b7` | `#383835` |
| 7 | `#4a3aa7` | `#9085e9` | | | | |
| 8 | `#e34948` | `#e66767` | | | | |

Status colours (identical in both schemes — a status colour carries a meaning, so
it must not shift hue with the surface): `up` `#0ca30c`, `warning` `#fab219`,
`down` `#d03b3b`. `neutral` is chrome, not status: `#52514e` light, `#c3c2b7`
dark. A status colour never impersonates a categorical slot. `warning` is the one
**optional** slot on `Theme` (see the v0.2 Theme block): a theme that omits it
resolves to `#fab219`.

Sequential ramp (as written, light→dark): `#cde2fb #b7d3f6 #9ec5f4 #86b6ef #6da7ec #5598e7 #3987e5 #2a78d6 #256abf #1c5cab #184f95 #104281 #0d366b`

### Sequential encoding DIRECTION is per colour scheme

A sequential ramp encodes magnitude, and the rule is asymmetric: **the
near-zero end of the ramp may recede toward the surface; the high end must
never be the one that recedes.** The array above satisfies that on a light
surface only — `#0d366b` measures 11.64:1 against `#fcfcfb` but **1.46:1**
against the dark surface `#1a1a19`.

So the default ramp's direction follows `theme.colorScheme`:

| scheme | low (near zero) | high (maximum) | high-end contrast |
|---|---|---|---|
| `light` | `#cde2fb` (1.29:1 — recedes, as intended) | `#0d366b` | **11.64:1** |
| `dark` | `#0d366b` (1.46:1 — recedes, as intended) | `#cde2fb` | **13.16:1** |

The steps are identical; only the mapping reverses. This applies to every
consumer of the DEFAULT ramp — `heatmap`, `calendar`, `choropleth` — and matches
what `funnel` already does with its ordinal span. A ramp the CALLER supplies
(`heatmap.ramp`, `calendar.ramp`, `choropleth.ramp`) is used **verbatim in both
schemes**: the caller chose the direction, and silently reversing their array
would be the more surprising behaviour.

### `forced-colors: active`

When the user agent reports `forced-colors: active` (Windows High Contrast and
equivalents), the resolved theme is re-expressed in **CSS system colors** before
anything is painted, and `theme.forcedColors` is set:

| token | forced value |
|---|---|
| `surface` | `Canvas` |
| `textPrimary` / `textSecondary` / `axisLine` | `CanvasText` |
| `textMuted` / `gridline` / `neutral` | `GrayText` |
| `series` | `CanvasText`, `LinkText`, `Highlight` (3 slots) |
| `up` / `down` / `warning` | `CanvasText` |

This is a **user** preference, so it overrides `theme: 'dark'` and a fully custom
`Theme` object alike, and it is watched live for the chart's whole lifetime (a
canvas's pixels are not re-mapped by the browser the way DOM colors are, so a
chart that ignored the change would keep painting its authored palette into a
high-contrast desktop). With only three series colors available, series 4+ fall
back to the same composite encoding used past palette slot 8, and `up`/`down`
collapsing to one color is why `candlestick` carries direction in its FILL.

## Mark & interaction spec (visual quality bar)

- Bars: 4px rounded corners on the **data end only** (baseline corners square);
  2px surface-colored gap between adjacent/stacked bars.
- Lines: 2px width; markers ≥ 8px diameter with 2px surface ring.
- Grid: hairline, y-only by default; axis text in `textMuted`; no chart junk.
- Tooltip: follows pointer, never clips viewport, surface bg + hairline border.
  Placed below a cursor, **above** a touch contact (a finger covers what is
  under it).
- Hover hit targets larger than marks (nearest-point within 24px for line/scatter,
  full column band for bar). A **coarse** pointer gets **44px** instead of 24px;
  the choice is made per event from `PointerEvent.pointerType`, so a mouse on a
  touchscreen device keeps mouse precision.
- **Touch is a first-class input, not synthesized mouse:**
  - the canvas is `touch-action: pan-y` — vertical page scrolling over a chart is
    never blocked. It escalates to `none` only for `zoom` with
    `axis: 'y' | 'xy'` and a drag gesture enabled, and for the duration of a
    brush/pan drag;
  - `pointerdown` with `pointerType` `touch`/`pen` sets hover, emits
    `pointenter` and shows the tooltip; `pointermove` while down scrubs;
  - the tooltip survives the finger lifting and is dismissed by the next tap
    outside the chart or by a scroll (a tap inside replaces it);
  - `pointercancel` clears hover/tooltip and aborts an in-progress brush;
  - drag gestures take pointer capture so a finger leaving the canvas does not
    end them.
- Legend text in ink colors, never in series color; swatch carries the color.

## Wrapper contracts

Each wrapper exposes one idiomatic component wrapping `createChart`:

- **React** (`@chartcraft/react`): `<Chart {...options} className style onPointClick onPointEnter onPointLeave onLegendToggle />`
  plus convenience aliases `<LineChart> <AreaChart> <BarChart> <ScatterChart> <PieChart> <DonutChart>`
  (same props minus `type`). Options changes call `chart.update`; unmount calls
  `destroy`. `ref` exposes the `Chart` instance via `useImperativeHandle`.
- **Vue** (`@chartcraft/vue`): `<Chart :options="opts" @point-click @point-enter @point-leave @legend-toggle />`;
  deep-watches `options`; exposes `chart` via template ref. Same per-type aliases.
- **Svelte** (`@chartcraft/svelte`): `<Chart {options} on:pointclick …>` (v4 syntax
  compatible with v5); reactive updates; same aliases.
- **Angular** (`@chartcraft/angular`): `<cc-chart [options]="opts" (pointClick) (pointEnter) (pointLeave) (legendToggle) (zoom) (annotationClick) />`;
  standalone and signal-based (`input.required<ChartOptions>()`, `output<T>()`),
  no `NgModule` and no `zone.js` dependency. An `effect()` on the `options`
  signal calls `chart.update` on every **reference** change (immutable update
  contract, as in React); the instance is a public `chart` signal reached with
  `viewChild`/`@ViewChild`. Same per-type components under the `cc-` selector
  prefix (`<cc-line-chart>`, `<cc-sankey-chart>`, …, `Cc*Chart` class names).

All wrappers: SSR-safe (no window access at import time; chart mounts in
effect/onMounted/`afterNextRender`), and they re-export all core types.

---

# v0.2 chart types

Thirteen new types plus combo (per-series type mixing). Every type plugs into
the shared pipeline and MUST deliver the full shared feature set: tooltip,
legend policy, keyboard navigation + aria table, theming, animation,
reduced-motion, resize. Internally each type is a `ChartTypeDefinition`
registered in `src/charts/registry.ts` (layout, render, hit-test, legend
items, a11y table rows, keyboard geometry) — `chart.ts` dispatches through
the registry and contains no per-type branching.

## Additions to existing interfaces

```ts
interface SeriesOptions {
  // ... v0.1 fields ...
  type?: SeriesKind;                           // COMBO: per-series override on cartesian
      // charts whose root type is line/area/bar/scatter. All series share ONE y-axis
      // (the one-axis rule is non-negotiable — no dual axes, ever).
      // v0.2: 'line' | 'bar' | 'area' | 'scatter'. v0.3 adds 'rangearea' (see below).
  sizeRange?: [number, number];                // bubble only: min/max marker DIAMETER px
                                               // (value maps to AREA, never radius); default [8, 40]
}

// DataValue gains richer object fields (superset; all optional, per-type semantics):
interface DataPoint {
  x?: number | Date | string; y?: number | null; label?: string; color?: string;
  r?: number;                                   // bubble: size value (maps to area)
  o?: number; h?: number; l?: number; c?: number; // candlestick/ohlc (y unused)
  min?: number; q1?: number; median?: number; q3?: number; max?: number;
  outliers?: number[];                          // boxplot 5-number summary (alt: raw number[] per category)
  isTotal?: boolean;                            // waterfall: value is an absolute total, not a delta
  children?: TreeNode[];                        // treemap/sunburst nesting
}
interface TreeNode { label: string; value?: number; color?: string; children?: TreeNode[] }
    // value optional when children present (parent value = sum of children)

interface ChartOptions {
  // ... v0.1 fields ...
  histogram?: { bins?: number | 'auto' };       // 'auto' = Freedman–Diaconis, clamped 5..60
  heatmap?: { ramp?: string[]; min?: number; max?: number };
    // default ramp: sequentialPalette, DIRECTED by theme.colorScheme (light: low=lightest,
    // high=darkest; dark: reversed). A supplied ramp is used verbatim in both schemes.
  gauge?: { min?: number; max?: number;         // default 0..100
            bands?: { to: number; color?: string }[] };  // v0.4.0: color is OPTIONAL —
    // a band with none takes the themed status default for its POSITION: first band
    // theme.up, last theme.down, every band between them theme.warning (a lone band
    // is theme.neutral). The default reads ascending value ranges as ascending
    // SEVERITY (low good, high bad — capacity/utilization/error-rate gauges); a gauge
    // whose polarity runs the other way must name its colours.
  waterfall?: { connectors?: boolean };         // hairline connectors between bars, default true
}

interface Theme {
  // ... v0.1 fields ...
  up: string;    // financial rise / waterfall increase.  light '#0ca30c', dark '#0ca30c'
  down: string;  // financial fall / waterfall decrease.  light '#d03b3b', dark '#d03b3b'
  neutral: string; // waterfall totals & neutral marks.    light '#52514e', dark '#c3c2b7'
  warning?: string; // v0.4.0 — the CAUTION step between up and down (a gauge's middle
                    // band, a threshold approaching). light '#fab219', dark '#fab219':
                    // the status palette's validated warning step. Identical in both
                    // schemes, exactly as up/down are — a status colour carries a
                    // MEANING and must not shift hue between light and dark.
                    // OPTIONAL, unlike its siblings: `Theme` is a type callers
                    // CONSTRUCT, so a custom theme written before this slot existed
                    // must keep compiling. Absent, it resolves to the same validated
                    // value in ONE place (`theme#warningColor`), so a gauge band still
                    // themes and no consumer ever handles `undefined`. `resolveTheme`
                    // completes it on a partial custom theme, exactly as it does
                    // `series`.
  forcedColors?: boolean; // set BY THE PIPELINE when `forced-colors: active`; every color above
                          // is then a CSS system-color keyword. Never set by a caller.
}
```

## Per-type specification

| Type | Data shape | Rendering & rules |
|---|---|---|
| `bubble` | `{x, y, r}` or `[x, y, r]` triples | Scatter + size channel. `r` maps to marker **area** via `sizeRange`. Legend = series. Tooltip shows x, y, r. |
| `sparkline` | same as `line`, single series | Chrome-free preset: no axes, grid, legend, title padding; tooltip optional (default off); fills container (inline heights ~24–48px). Keyboard/table a11y still on. |
| `histogram` | series `data: number[]` = raw samples | Bins per `histogram.bins`, renders as full-width bars (no inter-bar gap except 1px hairline), x = linear bin edges, y = count. Multi-series → translucent overlay (alpha 0.7). |
| `boxplot` | per category: 5-number object or raw `number[]` (summary computed) | Box q1–q3, median line, whiskers to min/max, outlier dots (≥8px). Uses `categories` on x. Legend = series. |
| `candlestick` | `{x, o, h, l, c}` or `[x, o, h, l, c]` | Body o→c in `theme.up`/`theme.down`, **hollow when rising** (1px outline, surface-filled) and **solid when falling**; wick h→l 1px. **Time x-axis: the type declares it, so a numeric `x` is epoch milliseconds** — tick labels, tooltip header, the table's `Time` column and the announcement all read as times. Never animated sweeps (reduced-motion irrelevant — appear instantly). Data carrying no open/high/low/close at all is rejected with a clear error naming the shape. |
| `ohlc` | same as candlestick | Open/close ticks left/right on the h–l bar; same colors and the same declared time x-axis and shape rejection. No body to fill — direction is carried by the tick geometry (close tick above open when rising). |
| `waterfall` | single series; values = deltas; `isTotal: true` points are absolute totals | Floating bars: increase `theme.up`, decrease `theme.down`, totals `theme.neutral`; hairline connectors per `waterfall.connectors`. |
| `heatmap` | each series = one row; `data: number[]` aligned to `categories` (columns) | Cell color from sequential `heatmap.ramp` scaled `min..max` (default data extent). 1px surface gaps between cells. Legend = horizontal gradient color-scale bar with min/max labels (non-toggleable). Value visible in tooltip + a11y table (relief for low-contrast steps). |
| `treemap` | one series, `data: TreeNode[]` | Squarified layout, top-level nodes take categorical slots in palette order, children = lightness steps of parent hue; 2px surface gaps; direct labels on cells that fit (ink, ellipsized), tooltip for the rest. Legend = top-level nodes, non-toggleable. |
| `sunburst` | one series, `data: TreeNode[]` | Radial treemap: depth = ring. Same coloring/legend rules as treemap. Center shows root total (donut-style). |
| `funnel` | one series, ordered `{x: stage, y: value}` | Ordered horizontal segments, widths ∝ value, centered; colors = ordinal steps of the sequential ramp (start no lighter than step 250 light / no darker than 600 dark). Stage label + value directly on/beside each segment. Legend hidden (stages are labeled directly). |
| `radar` | `categories` = spokes (3–12); series values ≥ 0 | Polar grid (recessive), 2px series outlines with 0.15-alpha fills, ≥8px vertex markers on hover/focus. Legend = series, toggleable. |
| `gauge` | single series, single value | 270° arc, value needle/arc fill in series-1 blue unless `gauge.bands` given; big center value in `textPrimary` (proportional figures), min/max in `textMuted`. No legend. Not a dashboard toy: subtitle carries units. |

## Cross-cutting requirements (every new type)

- **A11y:** meaningful generated aria summary; data table columns appropriate
  to the shape (e.g. OHLC table has open/high/low/close columns; treemap table
  is indented label + value + share); arrow-key navigation walks the type's
  natural reading order (cells row-major for heatmap, stages for funnel, …);
  Enter fires `pointclick` with `dataIndex` meaningful for the type.
- **Events:** `pointenter/leave/click` fire per mark (cell, node, candle, …);
  `seriesId` + `dataIndex` identify the mark; `x`/`y` carry the natural values.
- **Tooltips:** per-mark (`shared` only meaningful for cartesian line-likes;
  candlestick/ohlc default to per-mark with an OHLC block).
- **Dataviz rules:** no dual axes; categorical hues in slot order; a 9th series
  is never a GENERATED hue — the order is reused with a **composite encoding**
  (dash pattern + marker shape) and a one-time console recommendation to fold
  the tail into "Other" or use small multiples (see `ARCHITECTURE.md` §4);
  hierarchies use lightness steps within a hue; sequential = one hue, directed by
  the colour scheme (above); status/up/down colors never impersonate series
  slots, and on `candlestick`/`ohlc` never carry direction alone; text in
  ink colors, never mark colors; ≥ 2:1 contrast for ordinal ramp starts;
  direct labels are selective, not exhaustive.
- **Tests:** every type ships unit tests for its layout math (bins, squarify,
  polar transforms, 5-number summaries, waterfall running totals…), legend
  policy, a11y table content, and a renderer call-log smoke test.

---

# v0.3 chart types & features

Twenty new types (39 total) plus six cross-cutting features. Everything in
this section obeys the v0.2 "Cross-cutting requirements" verbatim — a type
that skips keyboard navigation, an aria table, theming, or tests is not done.

## Additions to existing interfaces

```ts
interface SeriesOptions {
  // ... v0.1/v0.2 fields ...
  data: SeriesData;                 // widened: see SeriesData below
  errorBars?: ErrorBarOptions;      // decoration on line/area/bar/scatter/bubble
  trendline?: TrendlineOptions;     // decoration on line/scatter/bubble
  lowKey?: string; highKey?: string; // rangearea: field names when using object data (default 'low'/'high')
}

// A range band is a real MARK KIND, so `SeriesOptions.type: 'rangearea'` is a
// legal per-series combo override on any cartesian root — the canonical
// forecast chart (a confidence band plus a line of the same color) is one
// chart, one y-axis. Bands paint first: rangearea < area < bar < line < scatter.
type SeriesKind = 'line' | 'bar' | 'area' | 'scatter' | 'rangearea';

// What a series carries: a list of data values, or — for `sankey` / `network`,
// whose whole series IS the graph — the node/link payload the per-type specs
// describe. Both forms typecheck; neither needs a cast.
type SeriesData = DataValue[] | GraphData;
interface GraphData {
  nodes: readonly { id?: string; label?: string; color?: string; group?: string; value?: number }[];
  links: readonly { source: string | number; target: string | number; value?: number;
                    label?: string; color?: string }[];
}

interface DataPoint {
  // ... v0.2 fields ...
  value?: number;                              // TreeNode value (hierarchy types); falls back to y
  low?: number | null; high?: number | null;   // rangearea / bullet range / gantt span
  eLow?: number; eHigh?: number;               // asymmetric error bar bounds (absolute values)
  target?: number;                             // bullet: target marker
  start?: number | Date; end?: number | Date;  // gantt: task span
  group?: string;                              // gantt swimlane / network cluster / parallel class
  weight?: number;                             // wordcloud term weight (alias of y)
  id?: string;                                 // network node id, sankey node id
}

interface ChartOptions {
  // ... v0.1/v0.2 fields ...
  dataLabels?: DataLabelOptions | boolean;     // default false; see Data labels
  annotations?: Annotation[];                  // reference lines/bands/points/text
  zoom?: ZoomOptions | boolean;                // default false; see Zoom, pan & brush
  // per-type blocks
  rangearea?: { showBounds?: boolean };        // hairline edges on the band, default true
  bullet?: { ranges?: number[]; target?: number };  // qualitative range boundaries (ascending)
  calendar?: { start?: Date | number; end?: Date | number; weekStart?: 0 | 1; ramp?: string[] };
  violin?: { bandwidth?: number | 'auto'; showBox?: boolean };  // KDE bandwidth; box overlay default true
  radialbar?: { innerRadius?: number; maxValue?: number; track?: boolean };  // innerRadius 0..1 of outer, default 0.3
  rose?: { startAngle?: number };
  sankey?: { nodeWidth?: number; nodePadding?: number; align?: 'left' | 'right' | 'justify' };
  gantt?: { rowHeight?: number; today?: Date | number };
  wordcloud?: { minFontSize?: number; maxFontSize?: number; rotate?: boolean };
  network?: { linkDistance?: number; charge?: number; iterations?: number; fixedSeed?: number };
  choropleth?: {
    geojson: GeoFeatureCollection;             // REQUIRED — caller supplies topology (never bundled)
    projection?: 'mercator' | 'equirectangular' | 'albersUsa' | 'orthographic';
    featureKey?: string;                       // GeoJSON property matched against data labels; default 'name'
    ramp?: string[]; min?: number; max?: number;
    unmatched?: 'warn' | 'strict' | 'omit';    // data row matching NO feature; default 'warn'
  };
  parallel?: { axes?: string[] };              // dimension order; default = data key order
}

interface ErrorBarOptions {
  // Absolute bounds per point (eLow/eHigh) win; otherwise a uniform value/percent.
  value?: number; percent?: number;
  capWidth?: number;                           // px, default 6
  color?: string;                              // default: the series color darkened, else textSecondary
}
interface TrendlineOptions {
  type?: 'linear' | 'movingAverage' | 'exponential';  // default 'linear'
  period?: number;                             // movingAverage window, default 7
  color?: string;                              // default: series color
  dashed?: boolean;                            // default true — a trendline must never read as data
  label?: string | false;                      // legend entry; default the series name + " trend"
}
interface DataLabelOptions {
  show?: boolean;
  format?: (point: TooltipPoint) => string;
  // Selectivity is mandatory: 'all' is legal but 'auto' (default) labels only
  // extremes/endpoints and drops labels that would collide.
  select?: 'auto' | 'all' | 'extremes' | 'endpoints' | 'last';
  position?: 'outside' | 'inside' | 'auto';    // default 'auto'
}
type Annotation =
  | { kind: 'line'; axis: 'x' | 'y'; value: number | Date; label?: string; color?: string; dashed?: boolean }
  | { kind: 'band'; axis: 'x' | 'y'; from: number | Date; to: number | Date; label?: string; color?: string }
  | { kind: 'point'; x: number | Date | string; y: number; label: string; color?: string }
  | { kind: 'text'; x: number | Date | string; y: number; text: string; color?: string };
interface ZoomOptions {
  enabled?: boolean;
  axis?: 'x' | 'y' | 'xy';                     // default 'x'
  wheel?: boolean;                             // ctrl/⌘+wheel zoom, default true
  drag?: boolean;                              // drag a brush region to zoom, default true
  pan?: boolean;                               // drag to pan once zoomed, default true
  minSpan?: number;                            // smallest zoomable x-span in data units
}
interface GeoFeatureCollection { type: 'FeatureCollection'; features: unknown[] }
```

## New `Chart` methods

```ts
interface Chart {
  // ... v0.1 methods ...
  exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob>;
  exportData(opts?: { format?: 'csv' | 'json' }): string;   // mirrors the a11y table
  zoomTo(range: { x?: [number, number]; y?: [number, number] } | null): void;  // null resets
}
```

## Per-type specification

| Type | Data shape | Rendering & rules |
|---|---|---|
| `rangearea` | `{x, low, high}` or `[x, low, high]` | Filled band low→high at 0.18 alpha in the series color; hairline edges per `rangearea.showBounds`. Pairs with a `line` series of the same color for forecast/CI charts (combo). Tooltip lists low & high. |
| `bullet` | one series, `{x: label, y: value, target?}`; ranges from `bullet.ranges` | Horizontal rows: qualitative ranges as nested grey steps (lightness ramp, never hues), the measure a thin dark bar centered in the row, the target a 2px perpendicular tick. Legend hidden — rows are labeled. |
| `dumbbell` | per category two values: `{x, low, high}` | Hairline connector between two ≥10px dots (slots 1 & 2 or series colors); category axis band. Legend = the two endpoint names. |
| `lollipop` | like `bar` | 1px stem from baseline + ≥10px terminal dot. Same layout/stacking rules as bar minus stacking (unsupported — error if `stacked`). |
| `slope` | `categories` = 2+ ordered stages; one point per stage per series | Straight lines between stage columns, ≥8px endpoint dots, direct series labels at both ends (no legend when labels fit), colors by series identity. Rank changes must be readable — no smoothing. |
| `streamgraph` | like stacked `area` | Stacked area with an "inside-out" (wiggle-minimizing) baseline offset; no y-axis ticks (the baseline is meaningless) — y-axis labels suppressed, values live in tooltip + table. |
| `marimekko` | series with `{x: column, y: value}` + per-column width from series `data[i].r` or a `widths` categories parallel | Variable-width 100%-stacked columns: column width ∝ column total, segment height ∝ share. 2px surface gaps. Both dimensions in the tooltip and table. |
| `pyramid` | exactly 2 series (e.g. male/female) over shared `categories` | Mirrored horizontal bars around a centered category axis; x-axis shows absolute magnitude on both arms. Legend = the 2 series. |
| `calendar` | one series, `{x: Date, y: value}` | Day cells laid out in week columns, month boundaries hairline-separated, weekday labels in `textMuted`; color from `calendar.ramp` (default: the sequential palette, directed by `theme.colorScheme`). Keyboard walks days; table = date + value. |
| `radialbar` | `categories` + one value each (or series) | Concentric arcs from `radialbar.innerRadius` outward, each track optionally shown at gridline color; value arcs in categorical slots; direct labels at arc starts. `maxValue` default = data max. |
| `rose` | `categories` = sectors, values ≥ 0 | Nightingale rose: equal-angle sectors, **radius ∝ √value** (area-true — never radius ∝ value), 2px gaps, sector labels around the perimeter. |
| `violin` | per category raw `number[]` | Gaussian-KDE density mirrored around each category axis (Silverman bandwidth for `'auto'`), 0.35-alpha fill + 1px outline, optional inner box plot per `violin.showBox`. Table = the 5-number summary + n. |
| `parallel` | series = lines; `data` = one value per dimension, dimensions named by `parallel.axes` or `categories` | One vertical axis per dimension (each independently scaled, labeled top and bottom), polylines across them at 0.7 alpha, 2px on hover/focus. **Axis brushing (drag on an axis to filter lines) is NOT in v0.3** — the layout exposes a documented seam for it (`ParallelFrame`, `parallelAxisAtX`, `parallelYToValue`) and it is on the roadmap. |
| `icicle` | `TreeNode[]` (as treemap) | Rectangular partition: depth = row, width ∝ value; same palette rules as treemap (top-level slots, children lightness steps); direct labels when they fit. |
| `circlepack` | `TreeNode[]` | Enclosing-circle packing (Welzl-style enclosure), leaves filled, parents outlined hairline; same palette rules; labels on leaves that fit. |
| `wordcloud` | one series, `{x: term, y: weight}` | Spiral placement with collision avoidance, font size interpolated `minFontSize..maxFontSize` by weight, optional 90° rotation per `wordcloud.rotate`; colors cycle the categorical slots **in order by rank**, text is the mark here (the one place text wears series color). Deterministic layout (seeded) — no `Math.random`. |
| `sankey` | `data: { nodes: {id, label, color?}[]; links: {source, target, value}[] }` on the first series | Layered node/link layout (longest-path layering, iterative crossing reduction), node bars in categorical slots, links as cubic ribbons at 0.45 alpha colored by source, 2px node gaps. Keyboard walks nodes then their links. Cycles rejected with a clear error. |
| `gantt` | one series per swimlane or `group` per point; `{x: label, start, end, group?}` | Horizontal task bars on a time x-axis, rows = tasks (or grouped by `group`), 4px rounded ends, optional `gantt.today` marker (2px dashed). Table = task, start, end, duration. |
| `choropleth` | one series, `{x: featureName, y: value}`; topology via `choropleth.geojson` | Project features per `choropleth.projection`, fit to plot; fill from the sequential ramp (directed by `theme.colorScheme`); features with no datum get `theme.gridline` fill; borders hairline `theme.axisLine`. Gradient scale legend (the heatmap legend hook). Keyboard walks features in data order. GeoJSON is caller-supplied — **never bundled**. A data row matching NO feature follows `choropleth.unmatched` (below). |
| `network` | `data: { nodes: {id, label, group?, value?}[]; links: {source, target, value?}[] }` | Deterministic force layout (seeded, fixed iteration count — `network.fixedSeed` default 1; no `Math.random`, no animation loop: simulate then draw), node radius ∝ √value, node color by `group` (categorical slots), links hairline at 0.35 alpha. **Keyboard walks each node by degree, then that node's links** (sankey's rule); table = `node / link, group, degree, source, target, value`, links indented under their source. Data of any other shape is rejected with a clear error naming this shape. |

## Feature specification

1. **Error bars** — `SeriesOptions.errorBars` on line/area/bar/scatter/bubble.
   Vertical whiskers with `capWidth` caps, 1px, drawn above marks. Included in
   the y-domain. A11y table gains ± columns; tooltip shows the interval.
2. **Trendlines** — `SeriesOptions.trendline`. Computed in a pure, tested
   function (least-squares for `'linear'`, centered window for
   `'movingAverage'`, `y = ae^{bx}` for `'exponential'`). Dashed by default and
   labeled in the legend so it can never be mistaken for observed data.
   Excluded from the y-domain by default.
3. **Data labels** — `dataLabels`. `'auto'` (the default when enabled) labels
   endpoints/extremes only and **drops any label that would collide** with
   another label or the plot edge; measured, not guessed. Labels wear ink
   colors, not series colors.
4. **Annotations** — `annotations[]`: reference lines, bands, labeled points,
   free text. Drawn beneath marks (bands) or above (lines/points), clipped to
   the plot, labels in `textSecondary` with a surface halo for legibility.
   Included in the a11y description; not in the data table.
5. **Zoom, pan & brush** — `zoom`. Drag draws a brush rectangle (surface-tinted,
   hairline edge) and zooms on release; ctrl/⌘+wheel zooms about the pointer;
   drag pans when zoomed; double-click and `Escape` reset. Keyboard: `+`/`-`
   zoom, arrows pan when zoomed. `zoomTo()` is the programmatic path and emits
   a `zoom` event `{ x?: [number, number]; y?: [number, number] } | null`.
   Downsampling re-runs against the visible window, so zooming into 1M points
   reveals real detail.

   **An `update()` preserves the viewport unless the new data makes it
   meaningless** (v0.4.0). The discriminator is the DOMAIN, not which keys the
   payload happened to carry: the chart type and the x-axis kind must be
   unchanged, an `x` window requires an unchanged x extent and a `y` window an
   unchanged value extent. So a theme change, an equivalent re-send, or new
   values on the same timestamps all keep the window, while a range switch or a
   type change resets it. **A reset always emits the `zoom` event (`null`)**, so
   an app's Reset-zoom affordance can never disagree with the actual state.
   This matters most through the wrappers, which re-send the whole `options`
   object — including `data` — on any change.
6. **Export** — `exportImage()` renders at `scale` (default 2) onto an
   offscreen surface and resolves a `Blob`; `'svg'` re-renders through the SVG
   renderer path if available, else rejects with a clear error. `exportData()`
   emits exactly the a11y table's contents as CSV/JSON.

## New `ChartEventMap` entries

```ts
zoom: { x?: [number, number]; y?: [number, number] } | null;  // null = reset
annotationclick: { index: number; annotation: Annotation };
```

## Choropleth: unmatched data rows

Real-world GeoJSON name mismatches ("USA" vs "United States of America") are the
norm, so a data row whose label matches no map feature is **loud but not fatal**
by default. `choropleth.unmatched` picks the policy:

| value | behavior |
|---|---|
| `'warn'` (default) | The row is not shaded, and it is REPORTED: one structured `console.warn` naming the unmatched labels, the `featureKey` used and the feature count, plus a sentence in the chart's accessible description ("2 data rows could not be placed on the map: …"). The rows keep their a11y table entries, so `exportData()` still carries every datum. Warned once per distinct diagnostic, not once per frame. |
| `'strict'` | Throws, with the same message the warning uses. For CI and data pipelines, where a typo'd region must fail the build rather than ship a plausible-looking map. |
| `'omit'` | Silent. For deliberately partial datasets. |

Features with no datum are unaffected by this option: they are always filled
`theme.gridline` and listed in the a11y table as `no data`.

---

# Extensibility: the decorator API

`@chartcraft/core` exports a plugin surface for **type-agnostic overlay passes**:

```ts
export { registerDecorator, unregisterDecorator, decorators, clearDecorators } from '@chartcraft/core';
export type { Decorator, DecoratorContext, DecoratorHost, DecorationLayer, Viewport };
```

A `Decorator` is a pass the pipeline walks for every mounted chart. The five
cross-cutting v0.3 features (error bars, trendlines, data labels, annotations,
zoom/pan/brush) are implemented as decorators and get no special treatment: a
chart type never knows any of them exist, and nothing is registered by default.

```ts
interface Decorator {
  readonly id: string;                  // stable; re-registering an id REPLACES it
  readonly layer: 'under' | 'over';     // beneath or above the type's marks
  readonly order?: number;              // ascending within a layer; ties keep reg. order
  appliesTo?(ctx): boolean;             // cheap opt-out
  draw(ctx): void;                      // paint through ctx.r, never the canvas API
  extendYDomain?(model, opts): [number, number] | null;
  legendItems?(ctx): LegendItem[];
  a11yTable?(ctx, spec): A11yTableSpec;
  tooltipPoints?(ctx, hit, points): TooltipPoint[];
  a11yDescription?(ctx): string | null;
  onClick?(ctx, px, py, native): boolean;
  attach?(host): (() => void) | void;
}
```

| hook | when | semantics |
|---|---|---|
| `draw` | once per frame, in the decorator's layer | Clip to `ctx.plot` yourself when the feature must not bleed into the margins. |
| `appliesTo` | before `draw`, `legendItems`, `onClick`, `a11yTable`, `tooltipPoints`, `a11yDescription` | Return false to skip this chart entirely. |
| `extendYDomain` | while the MODEL is built, before scales exist | The pipeline **unions** the result with the data extent; it never narrows. Error-bar whiskers land inside the value domain this way. |
| `legendItems` | when the legend is built | Appended **after** the type's items (a trendline must be legend-labeled so it can never read as observed data). Skipped when the type supplies a `legendCustomEl`. |
| `a11yTable` | between the type's `a11yTable` stage and BOTH the DOM table and `exportData()` | There is exactly ONE table spec, so the DOM table and the CSV/JSON export can never disagree. |
| `tooltipPoints` | after the type's `tooltipPoints`, BEFORE `tooltip.format` | Enrich values without wrapping the caller's formatter or mutating resolved options. |
| `a11yDescription` | when the description node is synced | Concatenated with `a11y.description` and the chart type's own description into ONE visually-hidden node and ONE `aria-describedby` token. |
| `onClick` | before datum hit-testing, topmost-registered first | Return true to consume the click, suppressing `pointclick`. |
| `attach` | once per chart instance, on mount | The returned function runs on `destroy`. **The only sanctioned place for DOM listeners.** `DecoratorHost` exposes `canvas`, `root`, `el`, `context()`, `requestRender()`, `setViewport()`, `getViewport()`, `emit()`; its identity is stable for the chart's lifetime, so keying per-chart state on it is safe. |

`DecoratorContext` is read-only and carries `r` (the `Renderer`), `theme`,
`opts`, `model`, `layout`, `plot`, `xScale`, `yScale`, `geom` (this frame's
animation-interpolated geometry), `hover`, `def`, `viewport`, `emit`, and
`host`.

**`host` is null on the export path.** `exportImage()` paints through an
offscreen renderer and hands decorators a context whose `host` is `null`, so an
export can never reach the live DOM. Treat a null host as "draw only, touch
nothing".

**Stability.** This surface is **experimental** in v0.3 and may change in a
minor release. It is exported because the five built-in features are built on it
and the seams should be usable, not because the shape is settled: the four hooks
above `onClick` were added during v0.3 in response to real feature needs, and
more may follow. `registerDecorator` / `unregisterDecorator` / `decorators` /
`clearDecorators` and the `Decorator` shape are what may move; nothing a
decorator can do is reachable any other way, so pin your core version if you
ship one.

---

## Non-negotiables restated for v0.3

- **No dual axes, ever** — this includes Pareto charts. A cumulative line
  belongs on the same normalized scale as its bars, or in a small multiple.
- **Area-true encodings**: rose radius ∝ √value, bubble/network radius ∝
  √value. Radius-linear encoding is a bug, not a style choice.
- **No `Math.random()` in layout** — wordcloud, network and any other
  stochastic layout must be seeded and deterministic, so renders are
  reproducible and testable.
- **Hierarchy coloring never invents hues** — children are lightness steps of
  the parent's slot, **clamped to the same ≥ 2:1 floor as an ordinal ramp**. A
  hierarchy cell is a large area fill separated from its neighbours by a 2px
  SURFACE-coloured gap, so a fill that approaches the surface erases the cell's
  own boundary. Where a hue has no headroom left to lighten (slot 4, `#eda100`,
  sits at 2.11:1 on the light surface), the step REVERSES — the child mixes away
  from the surface instead — rather than shrinking toward invisibility: depth
  must stay legible without the fill vanishing.
- **Trendlines and annotations must be visually distinguishable from data.**
