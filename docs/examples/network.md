# Network

A force-directed node-link diagram: nodes sized by value (area-true), colored by
group, links as hairlines. It answers structural questions — who is central, what
is clustered, what is isolated.

**Use it** for graphs of a few dozen to a few hundred nodes where topology is the
message: service dependencies, org or collaboration graphs, entity relationships,
recommendation neighbourhoods.

**Don't use it** to read quantities — a force layout has no axes, and the distance
between two nodes means nothing precise. Don't use it for dense graphs: past
roughly a few hundred nodes (or an average degree above ~6) it becomes a hairball,
and an adjacency matrix or a heatmap of edge weights is genuinely more readable.
And if your graph is a tree, use a hierarchy type — a force layout will hide the
structure you already know.

<ClientOnly>
  <DemoNetwork />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'network',
  title: 'Service dependency graph',
  subtitle: 'Node area ∝ requests per second · color = tier',
  network: { linkDistance: 46, charge: -260, iterations: 320, fixedSeed: 1 },
  data: {
    series: [
      {
        id: 'services',
        name: 'Services',
        data: {
          nodes: [
            { id: 'gateway', label: 'API gateway', group: 'Edge', value: 9800 },
            { id: 'web', label: 'Web app', group: 'Edge', value: 6400 },
            { id: 'mobile', label: 'Mobile BFF', group: 'Edge', value: 3100 },
            { id: 'auth', label: 'Auth', group: 'Core', value: 5200 },
            { id: 'billing', label: 'Billing', group: 'Core', value: 1400 },
            { id: 'catalog', label: 'Catalog', group: 'Core', value: 4300 },
            { id: 'orders', label: 'Orders', group: 'Core', value: 2600 },
            { id: 'search', label: 'Search', group: 'Core', value: 3800 },
            { id: 'notify', label: 'Notifications', group: 'Core', value: 900 },
            { id: 'pg', label: 'Postgres', group: 'Data', value: 7200 },
            { id: 'redis', label: 'Redis', group: 'Data', value: 8100 },
            { id: 'queue', label: 'Kafka', group: 'Data', value: 2200 },
            { id: 'warehouse', label: 'Warehouse', group: 'Data', value: 600 },
          ],
          links: [
            { source: 'web', target: 'gateway', value: 6 },
            { source: 'mobile', target: 'gateway', value: 3 },
            { source: 'gateway', target: 'auth', value: 5 },
            { source: 'gateway', target: 'catalog', value: 4 },
            { source: 'gateway', target: 'orders', value: 3 },
            { source: 'gateway', target: 'search', value: 4 },
            { source: 'orders', target: 'billing', value: 2 },
            { source: 'orders', target: 'notify', value: 1 },
            { source: 'billing', target: 'notify', value: 1 },
            { source: 'auth', target: 'pg', value: 4 },
            { source: 'auth', target: 'redis', value: 5 },
            { source: 'catalog', target: 'pg', value: 3 },
            { source: 'catalog', target: 'redis', value: 4 },
            { source: 'orders', target: 'pg', value: 3 },
            { source: 'orders', target: 'queue', value: 2 },
            { source: 'search', target: 'redis', value: 4 },
            { source: 'search', target: 'queue', value: 1 },
            { source: 'queue', target: 'warehouse', value: 1 },
            { source: 'notify', target: 'queue', value: 1 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'The API gateway is the highest-degree node, fanning out to auth, catalog, orders and search. Redis and Postgres are the busiest data services by request rate; the warehouse sits at the edge of the graph behind Kafka.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { NetworkChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Service dependency graph',
  subtitle: 'Node area ∝ requests per second · color = tier',
  network: { linkDistance: 46, charge: -260, iterations: 320, fixedSeed: 1 },
  data: {
    series: [
      {
        id: 'services',
        name: 'Services',
        data: {
          nodes: [
            { id: 'gateway', label: 'API gateway', group: 'Edge', value: 9800 },
            { id: 'web', label: 'Web app', group: 'Edge', value: 6400 },
            { id: 'mobile', label: 'Mobile BFF', group: 'Edge', value: 3100 },
            { id: 'auth', label: 'Auth', group: 'Core', value: 5200 },
            { id: 'billing', label: 'Billing', group: 'Core', value: 1400 },
            { id: 'catalog', label: 'Catalog', group: 'Core', value: 4300 },
            { id: 'orders', label: 'Orders', group: 'Core', value: 2600 },
            { id: 'search', label: 'Search', group: 'Core', value: 3800 },
            { id: 'notify', label: 'Notifications', group: 'Core', value: 900 },
            { id: 'pg', label: 'Postgres', group: 'Data', value: 7200 },
            { id: 'redis', label: 'Redis', group: 'Data', value: 8100 },
            { id: 'queue', label: 'Kafka', group: 'Data', value: 2200 },
            { id: 'warehouse', label: 'Warehouse', group: 'Data', value: 600 },
          ],
          links: [
            { source: 'web', target: 'gateway', value: 6 },
            { source: 'mobile', target: 'gateway', value: 3 },
            { source: 'gateway', target: 'auth', value: 5 },
            { source: 'gateway', target: 'catalog', value: 4 },
            { source: 'gateway', target: 'orders', value: 3 },
            { source: 'gateway', target: 'search', value: 4 },
            { source: 'orders', target: 'billing', value: 2 },
            { source: 'orders', target: 'notify', value: 1 },
            { source: 'billing', target: 'notify', value: 1 },
            { source: 'auth', target: 'pg', value: 4 },
            { source: 'auth', target: 'redis', value: 5 },
            { source: 'catalog', target: 'pg', value: 3 },
            { source: 'catalog', target: 'redis', value: 4 },
            { source: 'orders', target: 'pg', value: 3 },
            { source: 'orders', target: 'queue', value: 2 },
            { source: 'search', target: 'redis', value: 4 },
            { source: 'search', target: 'queue', value: 1 },
            { source: 'queue', target: 'warehouse', value: 1 },
            { source: 'notify', target: 'queue', value: 1 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'The API gateway is the highest-degree node, fanning out to auth, catalog, orders and search. Redis and Postgres are the busiest data services by request rate; the warehouse sits at the edge of the graph behind Kafka.',
  },
};
</script>

<template>
  <NetworkChart :options="options" style="height: 440px" />
</template>
```

:::

## Notes

- **The graph is the series** (`GraphData` — no cast). Four encodings are accepted:
  `data: { nodes, links }` (the canonical one, shown above), the same object wrapped
  in an array, `data: nodes` with links on the series, or `nodes`/`links` on
  `ChartData` itself.
- **A link naming an unknown node throws** — a silently dropped edge is a wrong
  picture. Duplicate ids keep the first node; self-links are kept for the record but
  contribute no degree and no drawn edge. Endpoints may be a node `id` or a 0-based
  node index.
- **The layout is deterministic and static:** a seeded phyllotaxis start, a **fixed**
  iteration count run to completion (no early exit), Barnes–Hut repulsion with fixed
  accumulation order, and coincident bodies separated by an index-derived epsilon
  rather than a random jiggle. No `Math.random()`, no animation loop — simulate, then
  draw. The simulation runs in abstract units and is fitted to the plot afterwards, so
  a **resize re-fits the same graph** instead of producing a different one.
- **Node radius is `rMax·√(v/vMax)`** — area-true. `rMax` is
  `min(plot.w, plot.h)/10` clamped to 6..28px, with a 4px floor for tiny values
  (proportionality holds above the floor). A graph where **no** node carries a value
  draws every node at the mid radius — "no value" must not read as "big". Radii are
  in px and are *not* scaled by the fit, so a very dense graph can still overlap.
- **`resolved.data` is rewritten to the node list sorted by degree descending**
  (ties keep your order), because keyboard navigation walks nodes by degree. So
  `PointEvent.dataIndex` is a **degree rank**, and `getOptions()` echoes the
  reordered list. The a11y table, `exportData()`, tooltips and announcements all use
  that same order, so nothing disagrees. Nothing you passed is mutated.
- **Link color is `theme.textMuted` at 0.35 alpha** — identical in both schemes and
  legible on either surface. (`theme.axisLine` at 0.35 alpha is effectively invisible
  on the dark surface.)
- **Legend "auto" keys off the GROUP count** (shown from 2 groups), because the
  legend lists groups, not series. Group items are non-toggleable — a group is a
  color key, not a series.
- **Undocumented defaults, chosen here:** `iterations: 300`, `fixedSeed: 1`,
  `linkDistance: 40`, `charge: -220`. Results are memoized under a structural key
  (bounded to 16 entries) purely to avoid recomputing on resize; the memo returns
  byte-identical values.
