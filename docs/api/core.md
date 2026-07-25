# `@chartcraft/core` API reference

Complete reference for the public surface of `@chartcraft/core` v0.1, as
defined by the [API contract](../api-contract.md). Every type below is
exported from the package root.

Sections:

- [Entry points](#entry-points)
- [The `Chart` instance](#the-chart-instance)
- [`ChartOptions`](#chartoptions)
- [Data types](#data-types) — `ChartData`, `SeriesOptions`, `DataValue`
- [Component options](#component-options) — axes, legend, tooltip, animation, a11y
- [Events](#events) — `ChartEventMap`, `PointEvent`
- [Theming](#theming) — `Theme`, palettes
- [Utilities](#utilities) — scales, `downsampleLTTB`, `version`

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
never mutates the object you pass, and later changes go through
[`update`](#updateoptions).

### Other exports

```ts
export const version: string;                     // package version, e.g. '0.1.0'

export const lightTheme: Theme;                   // built-in light theme
export const darkTheme: Theme;                    // built-in dark theme
export const categoricalPalette: { light: string[]; dark: string[] }; // 8 slots each
export const sequentialPalette: string[];         // blue ramp, light → dark

export { LinearScale, TimeScale, BandScale, LogScale };  // scale classes
export { downsampleLTTB };                               // LTTB downsampling
```

See [Theming](#theming) and [Utilities](#utilities).

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
`categories`) are replaced wholesale. Series are matched across updates by
identity (`id` ?? `name`) — see
[stable identity](../concepts/data-model.md#stable-series-identity).

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
included). Fires the `destroy` event last. The instance must not be used
afterwards. Framework wrappers call this on unmount.

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

### `el`

The container element you passed to `createChart` (readonly).

---

## `ChartOptions`

```ts
type ChartType = 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut';
```

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `ChartType` | — (required) | Chart type. `area` and `bar` support `stacked`; `bar` supports `horizontal`; `pie`/`donut` ignore all cartesian options. |
| `data` | `ChartData` | — (required) | The data. See [Data types](#data-types). |
| `theme` | `'light' \| 'dark' \| 'auto' \| Theme` | `'auto'` | Built-in theme, live `prefers-color-scheme` tracking (`'auto'`), or a custom [`Theme`](#theme) object. |
| `title` | `string` | `undefined` | Rendered above the plot in primary ink. Also the default accessible name — [always set one](../accessibility.md#guidance-for-chart-authors). |
| `subtitle` | `string` | `undefined` | Rendered under the title in secondary ink. |
| `width` | `number` | container size | Fixed width in px. Setting it opts this dimension out of responsiveness. |
| `height` | `number` | container size | Fixed height in px. |
| `padding` | `number \| { top?: number; right?: number; bottom?: number; left?: number }` | auto | Padding around the plot area, px. A single number applies to all sides; the object form sets sides individually (unset sides keep the automatic value). |
| `xAxis` | `AxisOptions` | see [`AxisOptions`](#axisoptions) | X-axis config. Cartesian types only; ignored by `pie`/`donut`. |
| `yAxis` | `AxisOptions` | see [`AxisOptions`](#axisoptions) | Y-axis config. Cartesian types only. |
| `stacked` | `boolean` | `false` | Stack series. `bar` and `area` only. |
| `horizontal` | `boolean` | `false` | Horizontal bars (categories on the y-axis, values on x). `bar` only. |
| `legend` | `LegendOptions \| boolean` | auto | Default: shown when there are ≥ 2 series, hidden for 1. For `pie`/`donut` the legend lists **slices** (label + slice color) so identity never relies on color alone; auto keys off the slice count and slice items are not toggleable. `true`/`false` force; object configures. See [`LegendOptions`](#legendoptions). |
| `tooltip` | `TooltipOptions \| boolean` | `true` | See [`TooltipOptions`](#tooltipoptions). |
| `animation` | `AnimationOptions \| boolean` | `true` | Entry/update/toggle animation. Auto-disabled when the user has `prefers-reduced-motion: reduce`. See [`AnimationOptions`](#animationoptions). |
| `downsample` | `{ enabled?: boolean; threshold?: number }` | `{ enabled: true, threshold: 5000 }` | Automatic LTTB downsampling for `line`/`area`/`scatter` series beyond `threshold` points. Render-side only — tooltips, events, and the data table use full data. See [Performance](../performance.md#lttb-downsampling). |
| `a11y` | `A11yOptions` | see [`A11yOptions`](#a11yoptions) | Accessibility configuration. |

---

## Data types

### `ChartData`

| Field | Type | Default | Description |
|---|---|---|---|
| `categories` | `(string \| number \| Date)[]` | `undefined` | Shared band x-axis labels — for `bar`, or `line`/`area` with a category x. Plain-number `DataValue`s index into this array. |
| `series` | `SeriesOptions[]` | — (required) | One or more series. |

### `SeriesOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | `name` | **Stable identity.** Drives palette-slot assignment (first-seen order), update matching/animation, and event payloads (`seriesId`). Set it explicitly when names can change or series lists are dynamic. |
| `name` | `string` | — (required) | Label shown in the legend and tooltip. |
| `data` | `DataValue[]` | — (required) | The points. See [`DataValue`](#datavalue). |
| `color` | `string` | palette slot | Overrides the palette color for this series. Otherwise the series gets the next free slot of the theme palette by first-seen identity. |
| `visible` | `boolean` | `true` | Hidden series keep their palette slot and legend entry (dimmed). Legend toggling flips this. |
| `curve` | `'linear' \| 'monotone' \| 'step'` | `'linear'` | Interpolation between points. `line`/`area` only. `monotone` never overshoots data; `step` holds each value until the next. |
| `lineWidth` | `number` | `2` | Stroke width in px. `line`/`area` only. |
| `showMarkers` | `boolean \| 'auto'` | `'auto'` | Point markers on the line. `'auto'` shows markers when the series has ≤ 60 points. `line`/`area` only. |

### `DataValue`

```ts
type DataValue =
  | number | null                                  // y against categories/index (null = gap)
  | [number | Date, number | null]                 // [x, y] pair
  | { x?: number | Date | string; y: number | null; label?: string; color?: string };
```

Three interchangeable shapes (a series may use any one of them):

| Shape | x comes from | Use for |
|---|---|---|
| `number \| null` | `categories[index]`, or the index itself | bars, category lines |
| `[x, y]` | the tuple's first element (`number` or `Date`) | time series, scatter |
| `{ x?, y, label?, color? }` | `x` if present (also accepts `string`), else category/index | pie/donut slices, per-point labels or color overrides |

`y: null` is an explicit **gap**: lines break (no interpolation), no bar is
drawn, the value is excluded from auto min/max, and the data table shows an
empty cell. Object-shape extras: `label` overrides the point's tooltip/table
label; `color` overrides that single mark's color.

---

## Component options

### `AxisOptions`

Applies to `xAxis` and `yAxis` on cartesian types (`line`, `area`, `bar`,
`scatter`).

| Field | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | `undefined` | Axis title. |
| `min` | `number \| 'auto'` | `'auto'` | Domain minimum. `'auto'` fits the data; bar/area baselines anchor at 0 for non-negative data. Must be > 0 on a `log` axis. |
| `max` | `number \| 'auto'` | `'auto'` | Domain maximum. `'auto'` adds headroom above the data. |
| `type` | `'linear' \| 'time' \| 'log' \| 'category'` | inferred | Inferred from the data: categories/string x → `category`, `Date` x → `time`, numeric → `linear`. **`log` is never inferred** — always explicit. |
| `ticks.count` | `number` | from axis size | Approximate tick count; the scale picks "nice" values near it. |
| `ticks.format` | `(value: number \| Date \| string) => string` | locale default | Tick label formatter. The argument type matches the axis type. Also used for tooltip `formattedX`/`formattedY` and the data table. |
| `grid` | `boolean` | `true` on y, `false` on x | Hairline gridlines for this axis. |

See [Scales and axes](../concepts/scales-and-axes.md) for inference rules,
log caveats, and time-zone handling.

### `LegendOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | auto | Default: visible when ≥ 2 series, hidden for 1. |
| `position` | `'top' \| 'bottom' \| 'right'` | `'top'` | Placement relative to the plot. |
| `interactive` | `boolean` | `true` | Clicking (or keyboard-activating) an item toggles the series' `visible` flag and emits `legendtoggle`. |

`legend: boolean` is shorthand for `{ show: boolean }`.

### `TooltipOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | `true` | |
| `shared` | `boolean` | `true` on `line`/`area`; `false` on `bar`/`scatter`/`pie`/`donut` | Shared: one crosshair-anchored tooltip listing every visible series at the nearest x. Per-mark: describes the single mark under the pointer. |
| `format` | `(points: TooltipPoint[]) => string` | built-in | Returns an **HTML string** for the tooltip body. Receives one point per visible series (shared) or a single point (per-mark). Escape user-provided strings. |

`tooltip: boolean` is shorthand for `{ show: boolean }`.

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
animation is disabled for users with `prefers-reduced-motion: reduce`.

### `A11yOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `options.title`, else generated | The chart's `aria-label`. Falls back to `title`, then to a generated summary ("Line chart with 3 series…"). |
| `description` | `string` | `undefined` | Longer prose description attached to the chart region. State the takeaway. |
| `table` | `'hidden' \| 'visible' \| 'off'` | `'hidden'` | The parallel data `<table>`: `'hidden'` = visually hidden, screen-reader readable; `'visible'` = on the page for everyone; `'off'` = not rendered. |
| `keyboard` | `boolean` | `true` | Arrow-key point navigation (arrows / Home / End / Enter) with `aria-live` announcements. |

Full behavior — the parallel DOM, keyboard map, announcements, WCAG mapping —
in [Accessibility](../accessibility.md).

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
}
```

| Event | Payload | Fires when |
|---|---|---|
| `pointenter` | `PointEvent` | Pointer hover **or keyboard focus** enters a datum. |
| `pointleave` | `PointEvent` | Pointer/focus leaves the datum. |
| `pointclick` | `PointEvent` | Click, tap, or Enter on the focused datum. |
| `legendtoggle` | `{ seriesId: string; visible: boolean }` | A legend item toggles a series. `visible` is the new state. |
| `render` | `{ reason: 'init' \| 'update' \| 'resize' \| 'toggle' }` | After each committed render, with why. |
| `destroy` | `Record<string, never>` (empty) | Once, from `destroy()`. Last event ever. |

### `PointEvent`

| Field | Type | Description |
|---|---|---|
| `seriesId` | `string` | Series identity. |
| `seriesName` | `string` | Series display name. |
| `dataIndex` | `number` | Index of the datum within `series.data`. |
| `x` | `number \| Date \| string \| null` | The datum's x value. |
| `y` | `number \| null` | The datum's y value. |
| `clientX`, `clientY` | `number` | Viewport coordinates of the pointer. **`-1` for keyboard-originated events.** |
| `native` | `Event \| null` | The originating DOM event; `null` when synthesized (keyboard paths). |

---

## Theming

### `Theme`

| Field | Type | Description |
|---|---|---|
| `colorScheme` | `'light' \| 'dark'` | Which scheme this theme is. |
| `surface` | `string` | Chart surface color. |
| `textPrimary` | `string` | Title ink. |
| `textSecondary` | `string` | Subtitle ink. |
| `textMuted` | `string` | Axis tick label ink. |
| `gridline` | `string` | Hairline gridline color. |
| `axisLine` | `string` | Axis line color. |
| `series` | `string[]` | **8 categorical slots in validated order — never re-sort.** See [Theming](../concepts/theming.md#why-the-order-must-not-change). |
| `fontFamily` | `string` | Default: `system-ui, -apple-system, "Segoe UI", sans-serif`. |
| `fontSize` | `number` | Base size in px. Default `12`. |

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
- `TimeScale` — `Date`/timestamp domain; calendar-aware tick generation.
- `BandScale` — discrete category domain → equal-width bands (bar layout).
- `LogScale` — base-10 logarithmic; positive domains only.

Which axis `type` maps to which scale is contract-fixed (see
[`AxisOptions`](#axisoptions)); the classes' constructor and method details
are part of the shipped `.d.ts` declarations rather than this v0.1 contract
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
points and preserving `null` gaps. Exact parameter details ship in the
package's `.d.ts`.

### `version`

```ts
import { version } from '@chartcraft/core';   // e.g. '0.1.0'
```

The package version string — useful in bug reports and runtime feature
checks.
