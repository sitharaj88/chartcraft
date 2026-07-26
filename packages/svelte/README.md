# @chartcraft/svelte

Svelte wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API. Svelte 4 and 5. Ships source
`.svelte` components, as is standard for Svelte libraries — no build step.

```sh
npm install @chartcraft/core @chartcraft/svelte
```

```svelte
<script>
  import { LineChart } from '@chartcraft/svelte';

  const options = {
    title: 'Weekly active users',
    data: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
    },
  };
</script>

<LineChart {options} style="height: 320px" />
```

One component per chart type (`LineChart`, `BarChart`, `SankeyChart`,
`ChoroplethChart`, …, 39 in total), plus `<Chart options={{ type: '...' }}>`
for the generic form. `getChart()` reaches the underlying `ChartInstance` for
`exportImage()`, `exportData()`, `zoomTo()`, and friends.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/svelte>

---

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
