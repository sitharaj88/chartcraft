# React

`@chartcraft/react` is a thin React 18+ wrapper around `@chartcraft/core`:
it owns lifecycle (mount/update/destroy), resize observation, and event
bridging — all chart logic stays in core, so React charts are at exact
feature parity with every other framework.

## Install

```sh
npm install @chartcraft/core @chartcraft/react
```

The wrapper re-exports all core types — import everything from
`@chartcraft/react`.

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
| …every `ChartOptions` field | — | `type`, `data`, `theme`, `title`, `subtitle`, `width`, `height`, `padding`, `xAxis`, `yAxis`, `stacked`, `horizontal`, `legend`, `tooltip`, `animation`, `downsample`, `a11y` |
| `className` | `string` | applied to the container element |
| `style` | `React.CSSProperties` | applied to the container element |
| `onPointClick` | `(ev: PointEvent) => void` | bridges the `pointclick` event |
| `onPointEnter` | `(ev: PointEvent) => void` | bridges `pointenter` |
| `onPointLeave` | `(ev: PointEvent) => void` | bridges `pointleave` |
| `onLegendToggle` | `(ev: { seriesId: string; visible: boolean }) => void` | bridges `legendtoggle` |

Lifecycle mapping:

- **Mount** → `createChart(container, options)` (inside an effect — never
  during render).
- **Prop change** → `chart.update(changedOptions)` — a diffed re-render, not
  a rebuild. Identity of untouched props is respected, so memoize `data` (or
  keep it in state) rather than rebuilding the object inline every render if
  the chart is hot.
- **Unmount** → `chart.destroy()`.

## Per-type convenience components

`LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, `PieChart`,
`DonutChart` — identical props minus `type`:

```tsx
import { AreaChart } from '@chartcraft/react';

<AreaChart stacked data={trafficData} title="Traffic by source" style={{ height: 320 }} />
```

## Getting the `Chart` instance

`ref` exposes the underlying `Chart` instance (via `useImperativeHandle`) for
anything the props don't cover — imperative `setData`, `resize`, or
subscribing to `render`/`destroy` events:

```tsx
import { useEffect, useRef } from 'react';
import { LineChart } from '@chartcraft/react';
import type { ChartData } from '@chartcraft/react';
// The Chart *instance* type shares its name with the <Chart> component,
// so import it from core (or alias it) to keep the two apart:
import type { Chart as ChartInstance } from '@chartcraft/core';

export function LiveChart({ data }: { data: ChartData }) {
  const ref = useRef<ChartInstance>(null);

  useEffect(() => {
    const chart = ref.current;
    if (!chart) return;
    const off = chart.on('render', ({ reason }) => console.log('rendered:', reason));
    return off; // chart.on returns the unsubscriber — hand it straight to React
  }, []);

  return <LineChart ref={ref} data={data} title="Live feed" style={{ height: 300 }} />;
}
```

Prefer props for anything declarative; reach for the instance only for the
imperative surface (`on`/`off` beyond the bridged events, `resize`,
`getOptions`).

## Controlled patterns

The chart is *uncontrolled* by default: legend toggling mutates internal
`visible` state without a round-trip through React. To mirror that state into
React (e.g. to persist it), listen and reflect:

```tsx
const [hidden, setHidden] = useState<Set<string>>(new Set());

<LineChart
  data={{
    series: series.map((s) => ({ ...s, visible: !hidden.has(s.id ?? s.name) })),
  }}
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
