# React

`@chartcraft/react` is a thin React 18+ wrapper around `@chartcraft/core`:
it owns lifecycle (mount/update/destroy), resize observation, and event
bridging — all chart logic stays in core, so React charts are at exact
feature parity with every other framework.

## Install

```sh
npm install @chartcraft/react
```

**One package, not two.** `@chartcraft/react` depends on core and re-exports its
whole public surface — every type *and* every value — so `@chartcraft/core` does
not need to be a second direct dependency:

```tsx
import {
  LineChart,
  // themes & palette
  lightTheme, darkTheme, categoricalPalette, sequentialPalette, sequentialRampFor,
  // utilities
  LinearScale, TimeScale, BandScale, LogScale, downsampleLTTB,
  // custom decorators
  registerDecorator, unregisterDecorator, decorators, clearDecorators,
  // escape hatch + version
  createChart, version,
} from '@chartcraft/react';
```

These are named re-exports, never `export *`, so they tree-shake: importing
`lightTheme` from the wrapper is byte-identical to importing it from core and
pulls in neither the chart engine nor any React code.

Core's `Chart` *interface* would collide with the `<Chart>` *component*, so the
instance type is re-exported as **`ChartInstance`**. Every other core type keeps
its own name.

## Memoise your option props {#memoise-your-option-props}

::: danger This is a correctness requirement, not a performance tip
The wrapper diffs option props **by identity**, one `ChartOptions` key at a time.
An inline object literal in JSX is a brand-new object on every render, so this

```tsx
// ❌ pushes a fresh `data` object into chart.update() on EVERY re-render
<LineChart data={{ categories, series }} />
```

re-enters `chart.update()` on every parent re-render — wasted work, and with
`zoom: { enabled: true }` it **discards the user's current viewport**.
:::

Keep every object- or array-valued prop referentially stable:

```tsx
const data = useMemo(() => ({ categories, series }), [categories, series]);
const spec = useMemo(() => ({ data, xAxis, annotations }), [data, xAxis, annotations]);

<LineChart {...spec} style={{ height: 320 }} />
```

…or hoist it to module scope when it never changes. And because the diff is by
identity, the inverse also holds: **build a new object to change something —
never mutate a spec in place**, or nothing will reach the chart.

Since **0.4** the wrapper tells you when you get this wrong. If the same
component re-renders three times in a row with a new-but-deeply-equal `data`
(or `xAxis`, `legend`, `annotations`, …), it logs one `console.warn` naming the
prop and suggesting `useMemo`. The check lives behind a literal
`process.env.NODE_ENV !== 'production'` guard, so bundlers strip it — and the
module implementing it — from production builds entirely.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and spreading it into the matching per-type
component. All four ChartCraft wrappers export it under this same name, so a
spec module is portable between them.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/react';

export const revenue: ChartSpec = {
  title: 'Revenue',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Product', data: [12.4, 13.1, 14.8, 16.2] }],
  },
};
```
```tsx
<BarChart {...revenue} style={{ height: 320 }} />
```

A `ChartSpec` defined once at module scope is also referentially stable for
free, which is why the five sample dashboards all use this shape.

`TypedChartProps` is a different thing and is **not** deprecated: it is the
*props* type of a per-type component (options plus `className`, `style` and the
event handlers). `ChartSpec` is options only.

## The `<Chart>` component

`ChartOptions` fields are spread as props, plus React-specific extras:

```tsx
import { Chart } from '@chartcraft/react';

<Chart
  type="line"
  data={data}
  title="Weekly active users"
  theme="auto"
  yAxis={{ min: 0 }}
  className="panel-chart"
  style={{ height: 360 }}
  onPointClick={(ev) => console.log(ev)}
  onPointEnter={(ev) => setHovered(ev)}
  onPointLeave={() => setHovered(null)}
  onLegendToggle={({ seriesId, visible }) => console.log(seriesId, visible)}
/>
```

| Prop | Type | Notes |
|---|---|---|
| …every `ChartOptions` field | — | `type`, `data`, `theme`, `title`, `subtitle`, `width`, `height`, `padding`, `xAxis`, `yAxis`, `stacked`, `horizontal`, `legend`, `tooltip`, `animation`, `downsample`, `a11y`, plus the v0.3 fields (`dataLabels`, `annotations`, `zoom`) and every per-type option block |
| `className` | `string` | applied to the container element |
| `style` | `React.CSSProperties` | applied to the container element |
| `onPointClick` | `(ev: PointEvent) => void` | bridges the `pointclick` event |
| `onPointEnter` | `(ev: PointEvent) => void` | bridges `pointenter` |
| `onPointLeave` | `(ev: PointEvent) => void` | bridges `pointleave` |
| `onLegendToggle` | `(ev: { seriesId: string; visible: boolean }) => void` | bridges `legendtoggle` |
| `onZoom` | `(ev: ChartEventMap['zoom']) => void` | **v0.3.** Bridges `zoom` (payload `null` on reset) |
| `onAnnotationClick` | `(ev: ChartEventMap['annotationclick']) => void` | **v0.3.** Bridges `annotationclick` |

Lifecycle mapping:

- **Mount** → `createChart(container, options)` (inside an effect — never
  during render).
- **Prop change** → `chart.update(changedOptions)` — a diffed re-render, not
  a rebuild. Props are compared **by identity**, so object- and array-valued
  props must be memoised; see
  [Memoise your option props](#memoise-your-option-props).
- **Unmount** → `chart.destroy()`.

::: tip Known limitation: the per-type components share one options type
`TypedChartProps` is the same loose shape for all 39 components, so this
type-checks even though it is nonsense:

```tsx
<GaugeChart sankey={{ nodeWidth: 12 }} data={data} />
```

The components buy you the correct `type` string, not a narrowed options shape.
Narrowing was assessed and deliberately deferred: it would break the
shared-`ChartSpec` pattern above, and it is a 1.0-shaped change.
:::

## Per-type convenience components

One per chart type — **39 of them**, identical props minus `type`:

- **v0.1** `LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, `PieChart`,
  `DonutChart`
- **v0.2** `BubbleChart`, `SparklineChart`, `HistogramChart`, `BoxplotChart`,
  `CandlestickChart`, `OhlcChart`, `WaterfallChart`, `HeatmapChart`,
  `TreemapChart`, `SunburstChart`, `FunnelChart`, `RadarChart`, `GaugeChart`
- **v0.3** `RangeareaChart`, `BulletChart`, `DumbbellChart`, `LollipopChart`,
  `SlopeChart`, `StreamgraphChart`, `MarimekkoChart`, `PyramidChart`,
  `CalendarChart`, `RadialbarChart`, `RoseChart`, `ViolinChart`,
  `ParallelChart`, `IcicleChart`, `CirclepackChart`, `WordcloudChart`,
  `SankeyChart`, `GanttChart`, `ChoroplethChart`, `NetworkChart`

```tsx
import { AreaChart } from '@chartcraft/react';

<AreaChart stacked data={trafficData} title="Traffic by source" style={{ height: 320 }} />
```

## Getting the `Chart` instance

`ref` exposes the underlying chart instance (via `useImperativeHandle`) for
anything the props don't cover — imperative `setData`, `resize`, `zoomTo`, or
subscribing to `render`/`destroy` events.

Since **0.4** the ref is populated **before any parent effect runs**, so
first-render setup code works without a null dance or a retry:

```tsx
import { useEffect, useRef } from 'react';
import { LineChart } from '@chartcraft/react';
import type { ChartInstance } from '@chartcraft/react';

const chart = useRef<ChartInstance>(null);

useEffect(() => {
  chart.current!.zoomTo({ x: [0, 10] }); // never null here
}, []);

return <LineChart ref={chart} {...spec} zoom style={{ height: 300 }} />;
```

The full pattern, with a subscription cleaned up the React way:

```tsx
import { useEffect, useRef } from 'react';
import { LineChart } from '@chartcraft/react';
import type { ChartData, ChartInstance } from '@chartcraft/react';

export function LiveChart({ data }: { data: ChartData }) {
  const ref = useRef<ChartInstance>(null);

  useEffect(() => {
    const chart = ref.current;
    if (!chart) return;
    return chart.on('render', ({ reason }) => console.log('rendered:', reason));
  }, []);

  return <LineChart ref={ref} data={data} title="Live feed" style={{ height: 300 }} />;
}
```

`ChartInstance` is core's `Chart` interface, re-exported from
`@chartcraft/react` under a non-colliding name — no separate core import
needed.

Prefer props for anything declarative; reach for the instance only for the
imperative surface (`on`/`off` beyond the bridged events, `resize`,
`getOptions`, `exportImage`, `exportData`, `zoomTo`).

## Controlled patterns

The chart is *uncontrolled* by default: legend toggling mutates internal
`visible` state without a round-trip through React. To mirror that state into
React (e.g. to persist it), listen and reflect:

```tsx
const [hidden, setHidden] = useState<Set<string>>(new Set());

// Memoised on its real inputs — a fresh object here would reset an active zoom.
const data = useMemo(
  () => ({ series: series.map((s) => ({ ...s, visible: !hidden.has(s.id ?? s.name) })) }),
  [series, hidden],
);

<LineChart
  data={data}
  onLegendToggle={({ seriesId, visible }) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    })
  }
  style={{ height: 300 }}
/>
```

## SSR (Next.js, Remix, …)

The wrapper is SSR-safe: it touches no browser global at import time, and the
chart mounts inside an effect, which never runs on the server. You can import
and render `<Chart>` in server-rendered trees without `dynamic()`/lazy
workarounds — the server emits the empty container; the chart appears on
hydration.

Notes:

- Server output contains no chart pixels or a11y DOM (both are client-built).
  If you need chart content in the HTML payload, that is the SSR snapshot
  rendering item on the [roadmap](../roadmap.md).
- Give the container a CSS height that exists before hydration to avoid
  layout shift.
- In React 18 StrictMode dev, effects run twice; the wrapper handles the
  mount → destroy → mount cycle cleanly.
