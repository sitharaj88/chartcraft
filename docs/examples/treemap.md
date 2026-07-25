# Treemap

Hierarchical part-to-whole by **area**: one series whose data is `TreeNode[]`
(`{ label, value?, color?, children? }` — a parent's value defaults to the
sum of its children). Squarified layout; top-level nodes take categorical
palette slots in order, children are lightness steps of the parent hue.
Use a treemap when the hierarchy has many leaves and relative size is the
message. Don't use it for a handful of flat categories (a
[bar chart](bar.md) compares lengths, which humans read far more precisely
than areas) or for values that can be negative.

<ClientOnly>
  <DemoTreemap />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { DataValue, TreeNode } from '@chartcraft/core';

const nodes: TreeNode[] = [
  {
    label: 'Platform',
    children: [
      { label: 'Subscriptions', value: 46.2 },
      { label: 'Usage overages', value: 11.8 },
      { label: 'Premium support', value: 7.4 },
    ],
  },
  {
    label: 'Services',
    children: [
      { label: 'Consulting', value: 14.6 },
      { label: 'Training', value: 5.2 },
    ],
  },
  {
    label: 'Marketplace',
    children: [
      { label: 'App revenue share', value: 8.9 },
      { label: 'Listings', value: 2.3 },
    ],
  },
  { label: 'Other', value: 3.6 },
];

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'treemap',
  title: 'Revenue by product line',
  subtitle: 'FY2026 ($M) — cell area = revenue',
  data: {
    series: [
      // TreeNode[] needs a cast: the DataValue union doesn't name TreeNode
      // (the runtime reads the nodes as-is). Alternatively pass the value
      // as `y`: { label: 'Other', y: 3.6 }.
      { id: 'revenue', name: 'Revenue', data: nodes as unknown as DataValue[] },
    ],
  },
  a11y: {
    description:
      'Platform is the largest line at 65.4 million dollars (subscriptions alone 46.2), followed by services at 19.8 and marketplace at 11.2.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { TreemapChart } from '@chartcraft/vue';
import type { DataValue, TreeNode, TypedChartOptions } from '@chartcraft/vue';

const nodes: TreeNode[] = [
  {
    label: 'Platform',
    children: [
      { label: 'Subscriptions', value: 46.2 },
      { label: 'Usage overages', value: 11.8 },
      { label: 'Premium support', value: 7.4 },
    ],
  },
  {
    label: 'Services',
    children: [
      { label: 'Consulting', value: 14.6 },
      { label: 'Training', value: 5.2 },
    ],
  },
  {
    label: 'Marketplace',
    children: [
      { label: 'App revenue share', value: 8.9 },
      { label: 'Listings', value: 2.3 },
    ],
  },
  { label: 'Other', value: 3.6 },
];

const options: TypedChartOptions = {
  title: 'Revenue by product line',
  subtitle: 'FY2026 ($M) — cell area = revenue',
  data: {
    series: [
      // TreeNode[] needs a cast: the DataValue union doesn't name TreeNode
      // (the runtime reads the nodes as-is). Alternatively pass the value
      // as `y`: { label: 'Other', y: 3.6 }.
      { id: 'revenue', name: 'Revenue', data: nodes as unknown as DataValue[] },
    ],
  },
  a11y: {
    description:
      'Platform is the largest line at 65.4 million dollars (subscriptions alone 46.2), followed by services at 19.8 and marketplace at 11.2.',
  },
};
</script>

<template>
  <TreemapChart :options="options" style="height: 400px" />
</template>
```

:::

::: tip Treemap specifics
Direct labels appear only on cells that fit (ink color, ellipsized) — the
tooltip covers the rest, and the a11y table lists every node as indented
label + value + share. The legend lists top-level nodes (non-toggleable).
For nested trees, point events fire with the depth-first `dataIndex` while it
addresses a top-level datum; tooltips, focus, and the table always use the
full hierarchy node.
:::
