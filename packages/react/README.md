# @chartcraft/react

React wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API. React 18+.

```sh
npm install @chartcraft/core @chartcraft/react
```

```tsx
import { LineChart } from '@chartcraft/react';

export function WeeklyActiveUsers() {
  return (
    <LineChart
      title="Weekly active users"
      data={{
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
      }}
      style={{ height: 320 }}
    />
  );
}
```

One component per chart type (`LineChart`, `BarChart`, `SankeyChart`,
`ChoroplethChart`, …, 39 in total), plus `<Chart type="...">` for the generic
form. Props mirror `ChartOptions` exactly; a `ref` exposes the underlying
`ChartInstance` for `exportImage()`, `exportData()`, `zoomTo()`, and friends.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/react>

---

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
