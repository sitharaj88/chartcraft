# Svelte

`@chartcraft/svelte` is a thin wrapper around `@chartcraft/core` for
Svelte 4 and 5: it owns lifecycle (mount/update/destroy), resize
observation, and event bridging. All chart logic lives in core, so Svelte
charts have exact feature parity with every other framework.

## Install

```sh
npm install @chartcraft/svelte
```

**One package, not two.** `@chartcraft/svelte` depends on core and re-exports its
whole public surface — every type *and* every value — so `@chartcraft/core` does
not need to be a second direct dependency:

```js
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
} from '@chartcraft/svelte';
```

These are named re-exports, never `export *`, so they tree-shake: importing
`lightTheme` from the wrapper is byte-identical to importing it from core and
pulls in neither the chart engine nor any component.

Core's `Chart` *interface* would collide with the `<Chart>` *component*, so the
instance type is re-exported as **`ChartInstance`**. Every other core type keeps
its own name.

The package ships source `.svelte` components, as is standard for Svelte
libraries — your own Svelte toolchain compiles them, and there is no build step.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and passing it to the matching per-type
component. All four ChartCraft wrappers export it under this same name, so a
spec module is portable between them.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/svelte';

export const revenue: ChartSpec = {
  title: 'Revenue',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Product', data: [12.4, 13.1, 14.8, 16.2] }],
  },
};
```
```svelte
<BarChart options={revenue} />
```

`TypedChartProps` remains the *props* type of a per-type component (`options`,
`class`, and the callback props); `ChartSpec` is options only.

## Events: `on:` directives **or** callback props

Since **0.4** every bridged event is available both ways, on Svelte 4 *and*
Svelte 5. Svelte 4 component events:

```svelte
<LineChart {options} on:pointclick={(e) => select(e.detail)} on:zoom={(e) => (win = e.detail)} />
```

…and the modern callback-prop form, which needs no deprecated directive and is
therefore safe for Svelte 5 today and Svelte 6 (where `on:` is slated for
removal):

```svelte
<LineChart {options} onpointclick={select} onzoom={(w) => (win = w)} />
```

The seven callback props are `onpointclick`, `onpointenter`, `onpointleave`,
`onlegendtoggle`, `onzoom`, `onannotationclick` and `onready`. A callback prop
receives the payload **directly**; an `on:` handler receives a `CustomEvent`
whose `detail` is the payload. Both fire if both are used, so a Svelte 5 app can
drop the directive entirely without losing anything.

## The `<Chart>` component

The component takes a single `options` prop. Shown here with the Svelte 4 `on:`
form (see above for the callback-prop equivalent):

```svelte
<script lang="ts">
  import { Chart } from '@chartcraft/svelte';
  import type { ChartOptions } from '@chartcraft/svelte';

  let options: ChartOptions = {
    type: 'line',
    title: 'Weekly active users',
    data: {
      categories: ['W1', 'W2', 'W3', 'W4'],
      series: [
        { name: 'Web', data: [1200, 1350, 1480, 1620] },
        { name: 'Mobile', data: [2100, 2280, 2190, 2540] },
      ],
    },
  };
</script>

<div style="height: 360px">
  <Chart
    {options}
    on:pointclick={(e) => console.log(e.detail.seriesName, e.detail.y)}
    on:pointenter={(e) => console.log('enter', e.detail.dataIndex)}
    on:pointleave={(e) => console.log('leave', e.detail.dataIndex)}
    on:legendtoggle={(e) => console.log(e.detail.seriesId, e.detail.visible)}
  />
</div>
```

| Prop / event | Type | Callback prop |
|---|---|---|
| `options` | `ChartOptions` — watched by reference; a new object triggers `chart.update` | — |
| `on:pointclick` | `CustomEvent<PointEvent>` — payload in `e.detail` | `onpointclick` |
| `on:pointenter` / `on:pointleave` | `CustomEvent<PointEvent>` | `onpointenter` / `onpointleave` |
| `on:legendtoggle` | `CustomEvent<{ seriesId: string; visible: boolean }>` | `onlegendtoggle` |
| `on:zoom` | **v0.3.** `CustomEvent<{ x?: [number, number]; y?: [number, number] } \| null>` | `onzoom` |
| `on:annotationclick` | **v0.3.** `CustomEvent<{ index: number; annotation: Annotation }>` | `onannotationclick` |
| `on:ready` | `CustomEvent<ChartInstance>` — fires once, as soon as the instance exists | `onready` |

Lifecycle mapping: `onMount` → `createChart`; reactive `options` change →
`chart.update`; destroy → `chart.destroy`.

### How updates reach the chart

`options` is watched **by reference**: assign a new object to update the chart,
because mutating the same object in place is invisible to Svelte's reactive
statement.

```ts
// ✅ a new object reaches chart.update()
options = { ...options, title: 'Updated title' };
options = { ...options, data: { ...options.data, series: nextSeries } };

// ❌ invisible — same reference
options.title = 'Updated title';
```

The flip side is that a new-but-equal object still costs a full `chart.update()`,
and with `zoom: { enabled: true }` an update whose data lands on a *different*
domain discards the user's viewport — so **derive** `options` from state rather
than rebuilding an equal literal on unrelated changes:

```svelte
<script lang="ts">
  import { LineChart } from '@chartcraft/svelte';
  import type { ChartSpec } from '@chartcraft/svelte';

  export let range: '7d' | '30d' = '7d';

  // One new object per real change of input, not one per render.
  $: options = {
    title: 'Weekly active users',
    subtitle: range === '7d' ? 'Last 7 days' : 'Last 30 days',
    data: seriesFor(range),
    zoom: { enabled: true },
  } satisfies ChartSpec;
</script>

<LineChart {options} />
```

In Svelte 5 runes mode the same rule applies — derive the object with
`$derived` and let the assignment be the signal.

::: info No development-time warning here, by design
Unlike the React and Angular wrappers, this package ships **uncompiled
`.svelte` sources with no build step**, so there is no point at which a
dev-only check could be stripped out of a production bundle.
:::

::: tip Since 0.4, an update only resets the zoom when it has to
The viewport now survives any update whose **computed domains** are unchanged.
See [Zoom, pan & brush](../features/zoom-pan-brush.md#the-viewport-across-an-update).
:::

## Per-type convenience components

One per chart type — **39 of them**, same interface, minus `type` inside
`options`:

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

```svelte
<script lang="ts">
  import { DonutChart } from '@chartcraft/svelte';
  import { storage } from './specs';   // a ChartSpec, stable by construction
</script>

<DonutChart options={storage} />
```

::: tip Known limitation: the per-type components share one options type
`TypedChartProps.options` is the same loose `ChartSpec` for all 39 of them, so
this type-checks even though it is nonsense:

```svelte
<GaugeChart options={{ sankey: { nodeWidth: 12 }, data }} />
```

The components buy you the correct `type` string, not a narrowed options shape.
Narrowing was assessed and deliberately deferred: it would break the
shared-`ChartSpec` pattern above, and it is a 1.0-shaped change.
:::

## Getting the `Chart` instance: `onready`

Since **0.4** the reliable way to reach the instance is the `ready` event — it
fires the moment the instance exists, from the component's own `onMount`:

```svelte
<script lang="ts">
  import { LineChart } from '@chartcraft/svelte';
  import type { ChartInstance } from '@chartcraft/svelte';

  let hero: ChartInstance | null = null;
</script>

<LineChart {options} onready={(chart) => (hero = chart)} />
<!-- or, equivalently -->
<LineChart {options} on:ready={(e) => (hero = e.detail)} />
```

`getChart()` via `bind:this` still works and gives you the full imperative
surface (`on`/`off` beyond the bridged events, `setData`, `resize`,
`getOptions`, `zoomTo`) — but it has an ordering trap:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart } from '@chartcraft/svelte';

  let chartComponent: Chart;

  onMount(() => {
    // ⚠️ bind:this lands BEFORE the child's own onMount, so this can be null.
    const chart = chartComponent.getChart();
    return chart?.on('render', ({ reason }) => console.log('rendered:', reason));
  });
</script>

<div style="height: 300px">
  <Chart bind:this={chartComponent} {options} />
</div>
```

Prefer `onready` / `on:ready` for setup code; they cannot fire early.

## SSR (SvelteKit)

The wrapper is SSR-safe: no `window` access at import time; the chart mounts
in `onMount`, which never runs on the server. Use it in SvelteKit pages and
components without `browser` guards — the server renders the empty container
and the chart appears on hydration.

- Server output contains no chart pixels or a11y DOM; HTML-payload chart
  content is the SSR snapshot item on the [roadmap](../roadmap.md).
- Give the container a CSS height that exists before hydration to avoid
  layout shift.
