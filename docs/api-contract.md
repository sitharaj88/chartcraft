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
export const sequentialPalette: string[];   // blue ramp 100→700, light→dark

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
type ChartType = 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut';

interface ChartOptions {
  type: ChartType;
  data: ChartData;
  // Presentation
  theme?: 'light' | 'dark' | 'auto' | Theme;      // default 'auto' (follows prefers-color-scheme)
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
}
```

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
  clientX: number; clientY: number;   // -1 for keyboard-originated events
  native: Event | null;
}
```

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

Sequential ramp (light→dark): `#cde2fb #b7d3f6 #9ec5f4 #86b6ef #6da7ec #5598e7 #3987e5 #2a78d6 #256abf #1c5cab #184f95 #104281 #0d366b`

## Mark & interaction spec (visual quality bar)

- Bars: 4px rounded corners on the **data end only** (baseline corners square);
  2px surface-colored gap between adjacent/stacked bars.
- Lines: 2px width; markers ≥ 8px diameter with 2px surface ring.
- Grid: hairline, y-only by default; axis text in `textMuted`; no chart junk.
- Tooltip: follows pointer, never clips viewport, surface bg + hairline border.
- Hover hit targets larger than marks (nearest-point within 24px for line/scatter,
  full column band for bar).
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

All wrappers: SSR-safe (no window access at import time; chart mounts in
effect/onMounted), and they re-export all core types.
