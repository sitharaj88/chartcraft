# @chartcraft/react

React wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API. React 18+.

```sh
npm install @chartcraft/react
```

```tsx
import { useMemo } from 'react';
import { LineChart } from '@chartcraft/react';

export function WeeklyActiveUsers() {
  // Memoised, not as an optimisation — see "Memoise your option props" below.
  const data = useMemo(
    () => ({
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
    }),
    [],
  );

  return <LineChart title="Weekly active users" data={data} style={{ height: 320 }} />;
}
```

One component per chart type (`LineChart`, `BarChart`, `SankeyChart`,
`ChoroplethChart`, …, 39 in total), plus `<Chart type="...">` for the generic
form. Props mirror `ChartOptions` exactly; a `ref` exposes the underlying
`ChartInstance` for `exportImage()`, `exportData()`, `zoomTo()`, and friends.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/react>

---

## Memoise your option props

**This is a correctness requirement, not a performance tip.**

The wrapper diffs option props **by identity**, one `ChartOptions` key at a time.
An inline object literal in JSX is a brand-new object on every render, so this:

```tsx
// ❌ pushes a fresh `data` object into chart.update() on EVERY re-render
<LineChart data={{ categories, series }} />
```

re-enters `chart.update()` on every parent re-render — wasted work, and with
`zoom: { enabled: true }` it also discards the user's current viewport. Keep
every object- or array-valued prop referentially stable:

```tsx
const data = useMemo(() => ({ categories, series }), [categories, series]);
const spec = useMemo(() => ({ data, xAxis, annotations }), [data, xAxis, annotations]);
<LineChart {...spec} />
```

…or hoist it to module scope when it never changes. And because the diff is by
identity, the inverse also holds: **build a new object to change something —
never mutate a spec in place**, or nothing will reach the chart.

In development the wrapper tells you when you get this wrong: if the same
component re-renders three times in a row with a new-but-deeply-equal `data`
(or `xAxis`, `legend`, `annotations`, …), it logs one `console.warn` naming the
prop and suggesting `useMemo`. The check lives behind a literal
`process.env.NODE_ENV !== 'production'` guard, so bundlers strip it — and the
module implementing it — from production builds entirely.

## One package, not two

`@chartcraft/react` re-exports core's runtime values as well as its types, so
`@chartcraft/core` does not need to be a direct dependency:

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

These are named re-exports, so they tree-shake: importing `lightTheme` alone
pulls in neither the chart engine nor any React code.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and spreading it into the matching per-type
component. Every ChartCraft wrapper exports it under this same name.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/react';
export const revenue: ChartSpec = {
  title: 'Revenue',
  data: { categories: ['Q1', 'Q2'], series: [{ name: 'ARR', data: [12.4, 13.1] }] },
};
```
```tsx
<BarChart {...revenue} style={{ height: 320 }} />
```

`TypedChartProps` remains the *props* type of a per-type component (options plus
`className`, `style` and the event handlers); `ChartSpec` is options only.

## Reaching the instance

`ref` is populated before any parent effect runs, so first-render setup code
works:

```tsx
const chart = useRef<ChartInstance>(null);
useEffect(() => {
  chart.current!.zoomTo({ x: [0, 10] }); // never null here
}, []);
return <LineChart ref={chart} {...spec} />;
```

---

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
