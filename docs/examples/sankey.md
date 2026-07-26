# Sankey

Flows between nodes, with ribbon width proportional to value. A Sankey answers
"where did it all go?" better than any other form — conversion funnels that
branch, energy and material flows, budget allocation, traffic routing.

**Use it** for a genuinely *flowing* quantity that is conserved (or whose losses
you want to show as their own branch), across a small number of layers.

**Don't use it** for a simple linear drop-off — that is a funnel chart, and it
reads more cleanly. Don't use it when the same thing can be counted twice (a
Sankey asserts conservation; overlapping categories make it lie). Don't use it
for cyclic graphs — the layout requires a DAG and **rejects cycles with an
error**. And keep it small: past a dozen nodes per layer the ribbons cross into
spaghetti.

<ClientOnly>
  <DemoSankey />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'sankey',
  title: 'Signup to paid conversion',
  subtitle: 'Last quarter · width ∝ users',
  sankey: { nodeWidth: 16, nodePadding: 10, align: 'justify' },
  data: {
    series: [
      {
        id: 'flow',
        name: 'Users',
        // The whole series IS the graph — `SeriesData` admits `{ nodes, links }`
        // directly, so no cast is needed.
        data: {
          nodes: [
            { id: 'organic', label: 'Organic search' },
            { id: 'paid', label: 'Paid social' },
            { id: 'partner', label: 'Partners' },
            { id: 'signup', label: 'Signed up' },
            { id: 'trial', label: 'Started trial' },
            { id: 'bounced', label: 'Never returned' },
            { id: 'activated', label: 'Activated' },
            { id: 'stalled', label: 'Stalled in trial' },
            { id: 'paidplan', label: 'Paid plan' },
            { id: 'lapsed', label: 'Lapsed' },
          ],
          links: [
            { source: 'organic', target: 'signup', value: 4200 },
            { source: 'paid', target: 'signup', value: 2600 },
            { source: 'partner', target: 'signup', value: 1800 },
            { source: 'signup', target: 'trial', value: 5100 },
            { source: 'signup', target: 'bounced', value: 3500 },
            { source: 'trial', target: 'activated', value: 3100 },
            { source: 'trial', target: 'stalled', value: 2000 },
            { source: 'activated', target: 'paidplan', value: 1850 },
            { source: 'activated', target: 'lapsed', value: 1250 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'Of 8,600 signups, 5,100 started a trial and 3,500 never returned. 3,100 trials activated and 1,850 of those converted to a paid plan — 21% of all signups.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { SankeyChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Signup to paid conversion',
  subtitle: 'Last quarter · width ∝ users',
  sankey: { nodeWidth: 16, nodePadding: 10, align: 'justify' },
  data: {
    series: [
      {
        id: 'flow',
        name: 'Users',
        data: {
          nodes: [
            { id: 'organic', label: 'Organic search' },
            { id: 'paid', label: 'Paid social' },
            { id: 'partner', label: 'Partners' },
            { id: 'signup', label: 'Signed up' },
            { id: 'trial', label: 'Started trial' },
            { id: 'bounced', label: 'Never returned' },
            { id: 'activated', label: 'Activated' },
            { id: 'stalled', label: 'Stalled in trial' },
            { id: 'paidplan', label: 'Paid plan' },
            { id: 'lapsed', label: 'Lapsed' },
          ],
          links: [
            { source: 'organic', target: 'signup', value: 4200 },
            { source: 'paid', target: 'signup', value: 2600 },
            { source: 'partner', target: 'signup', value: 1800 },
            { source: 'signup', target: 'trial', value: 5100 },
            { source: 'signup', target: 'bounced', value: 3500 },
            { source: 'trial', target: 'activated', value: 3100 },
            { source: 'trial', target: 'stalled', value: 2000 },
            { source: 'activated', target: 'paidplan', value: 1850 },
            { source: 'activated', target: 'lapsed', value: 1250 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'Of 8,600 signups, 5,100 started a trial and 3,500 never returned. 3,100 trials activated and 1,850 of those converted to a paid plan — 21% of all signups.',
  },
};
</script>

<template>
  <SankeyChart :options="options" style="height: 420px" />
</template>
```

:::

## Notes

- **The graph is the series.** `SeriesOptions.data` is
  `SeriesData = DataValue[] | GraphData`, so `{ nodes, links }` typechecks with no
  cast. Endpoints accept a node `id` **or** a 0-based node index.
- **The payload is validated with actionable errors:** unusable shape, empty or
  duplicate ids, unknown or out-of-range endpoints, non-finite or negative values,
  self-loops and **cycles** all throw. Links with `value: 0` are legal and render
  as nothing.
- **Node height is throughput** = `max(inValue, outValue)`, and ribbons stack from
  the top of the bar at both ends, so a balanced node's ribbon offsets sum exactly
  to its height. The value-to-pixel factor is the largest that fits every layer.
- **Crossing reduction is deterministic:** six fixed alternating barycenter sweeps,
  value-weighted, keeping the arrangement with the fewest exact crossings (ties keep
  the earlier one). No `Math.random()`.
- **Keyboard navigation is ONE flat sequence** — each node immediately followed by
  its own outgoing links — and the a11y table uses the same order and indices
  (`Node / link | Source | Target | Value`, links indented two spaces under their
  node). `exportData()` emits exactly that.
- **`getOptions().data` reports a normalized single series** whose points are the
  marks in reading order, not the `{ nodes, links }` payload you passed. Your
  objects are never mutated, and an `update()` re-derives everything from your
  original input. Because every mark has a backing point, `pointenter` / `leave` /
  `click` fire for **every node and link** with `dataIndex` = the reading-order
  index.
- **Defaults the contract leaves open:** `nodeWidth: 16`, `nodePadding: 8`
  (clamped to a 2px minimum), node slots follow reading order (layer, then rank),
  ribbons are colored by their source at 0.45 alpha. The legend is hidden by
  default (nodes are labeled directly); `legend: true` lists nodes,
  non-toggleable.
