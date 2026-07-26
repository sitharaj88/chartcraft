# @chartcraft/core

Framework-agnostic charting engine. Canvas 2D, zero runtime dependencies,
strict TypeScript, ESM + CJS + `.d.ts`.

39 chart types, 6 cross-cutting features (error bars, trendlines, data
labels, annotations, zoom/pan/brush, export), a screen-reader data table and
full keyboard navigation on every type, a colorblind-safe validated palette,
and measured performance (3.1 ms to redraw 1M points).

```sh
npm install @chartcraft/core
```

```ts
import { createChart } from '@chartcraft/core';

createChart(document.getElementById('chart')!, {
  type: 'line',
  title: 'Weekly active users',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
  },
});
```

Using React, Vue, or Svelte? Use the matching wrapper instead —
[`@chartcraft/react`](https://www.npmjs.com/package/@chartcraft/react),
[`@chartcraft/vue`](https://www.npmjs.com/package/@chartcraft/vue), or
[`@chartcraft/svelte`](https://www.npmjs.com/package/@chartcraft/svelte) —
each a thin lifecycle/event bridge around this package, at full feature
parity.

**Docs, live examples and the full API reference:**
<https://sitharaj88.github.io/chartcraft/>

**Source, issues, contributing:**
<https://github.com/sitharaj88/chartcraft>

---

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
