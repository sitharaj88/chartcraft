# Sunburst

A radial treemap: the same `TreeNode[]` data, with **depth as rings** —
the center shows the root total, each ring one level of the hierarchy.
Coloring follows the treemap rules (top-level nodes take palette slots in
order, children are lightness steps of the parent hue). Use a sunburst when
the *structure* of the hierarchy — how levels nest — matters as much as leaf
size. Don't use it for deep or many-leaved trees (thin outer arcs become
unreadable; a [treemap](treemap.md) uses space better) or flat data (that's
[pie](pie.md)).

<ClientOnly>
  <DemoSunburst />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { TreeNode } from '@chartcraft/core';

const nodes: TreeNode[] = [
  {
    label: 'Search',
    children: [
      { label: 'Organic', value: 412 },
      { label: 'Paid search', value: 186 },
    ],
  },
  {
    label: 'Social',
    children: [
      { label: 'Organic social', value: 118 },
      { label: 'Paid social', value: 94 },
    ],
  },
  { label: 'Direct', value: 231 },
  {
    label: 'Referral',
    children: [
      { label: 'Partners', value: 57 },
      { label: 'Press & blogs', value: 34 },
    ],
  },
];

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'sunburst',
  title: 'Sessions by traffic source',
  subtitle: 'Last 30 days (thousands)',
  data: {
    series: [
      // No cast needed: a genuine `TreeNode[]` is assignable to `DataValue[]`.
      { id: 'traffic', name: 'Sessions', data: nodes },
    ],
  },
  a11y: {
    description:
      'Search drives the most sessions (598 thousand, 69 percent organic), ahead of direct (231) and social (212); referral traffic is smallest at 91 thousand.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { SunburstChart } from '@chartcraft/vue';
import type { ChartSpec, TreeNode } from '@chartcraft/vue';

const nodes: TreeNode[] = [
  {
    label: 'Search',
    children: [
      { label: 'Organic', value: 412 },
      { label: 'Paid search', value: 186 },
    ],
  },
  {
    label: 'Social',
    children: [
      { label: 'Organic social', value: 118 },
      { label: 'Paid social', value: 94 },
    ],
  },
  { label: 'Direct', value: 231 },
  {
    label: 'Referral',
    children: [
      { label: 'Partners', value: 57 },
      { label: 'Press & blogs', value: 34 },
    ],
  },
];

const options: ChartSpec = {
  title: 'Sessions by traffic source',
  subtitle: 'Last 30 days (thousands)',
  data: {
    series: [
      // No cast needed: a genuine `TreeNode[]` is assignable to `DataValue[]`.
      { id: 'traffic', name: 'Sessions', data: nodes },
    ],
  },
  a11y: {
    description:
      'Search drives the most sessions (598 thousand, 69 percent organic), ahead of direct (231) and social (212); referral traffic is smallest at 91 thousand.',
  },
};
</script>

<template>
  <SunburstChart :options="options" style="height: 420px" />
</template>
```

:::

The keyboard order walks **all** nodes depth-first (parents before children),
and the a11y table lists each node with its value and share — the same
hierarchy relief as the treemap.
