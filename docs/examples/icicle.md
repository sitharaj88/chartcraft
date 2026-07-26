# Icicle

A hierarchy laid out as rows: depth is the row, width is the value. Compared with
a treemap it trades area-packing efficiency for something valuable — **the tree
structure is legible**, because every level is a straight, readable band and
labels sit in a predictable place.

**Use it** for hierarchies where the levels themselves matter: cost breakdowns by
org → team → service, bundle size by workspace → module, file systems, flame-graph
style profiles.

**Don't use it** when you have many leaves and few pixels — a wide tree turns
into slivers, exactly like a treemap. Don't use it for flat data (a bar chart is
strictly better), and remember the reader still compares **widths** here, which
is easier than treemap area but still approximate: put the number in the tooltip
and the table, which this type does.

<ClientOnly>
  <DemoIcicle />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'icicle',
  title: 'Cloud spend by service',
  subtitle: 'Last month, $ thousands',
  data: {
    series: [
      {
        id: 'spend',
        name: 'Spend',
        data: [
          {
            label: 'Compute',
            children: [
              { label: 'API cluster', value: 148 },
              { label: 'Batch workers', value: 92 },
              { label: 'ML training', value: 64 },
            ],
          },
          {
            label: 'Storage',
            children: [
              { label: 'Object store', value: 78 },
              { label: 'Warehouse', value: 54 },
              { label: 'Backups', value: 21 },
            ],
          },
          {
            label: 'Network',
            children: [
              { label: 'Egress', value: 46 },
              { label: 'Load balancers', value: 18 },
              { label: 'CDN', value: 31 },
            ],
          },
          {
            label: 'Platform',
            children: [
              { label: 'Observability', value: 37 },
              { label: 'CI runners', value: 24 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is 44% of cloud spend ($304k of $683k), and the API cluster alone is $148k. Storage follows at $153k, network at $95k and platform tooling at $61k.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { IcicleChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Cloud spend by service',
  subtitle: 'Last month, $ thousands',
  data: {
    series: [
      {
        id: 'spend',
        name: 'Spend',
        data: [
          {
            label: 'Compute',
            children: [
              { label: 'API cluster', value: 148 },
              { label: 'Batch workers', value: 92 },
              { label: 'ML training', value: 64 },
            ],
          },
          {
            label: 'Storage',
            children: [
              { label: 'Object store', value: 78 },
              { label: 'Warehouse', value: 54 },
              { label: 'Backups', value: 21 },
            ],
          },
          {
            label: 'Network',
            children: [
              { label: 'Egress', value: 46 },
              { label: 'Load balancers', value: 18 },
              { label: 'CDN', value: 31 },
            ],
          },
          {
            label: 'Platform',
            children: [
              { label: 'Observability', value: 37 },
              { label: 'CI runners', value: 24 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is 44% of cloud spend ($304k of $683k), and the API cluster alone is $148k. Storage follows at $153k, network at $95k and platform tooling at $61k.',
  },
};
</script>

<template>
  <IcicleChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **Data is one series of `TreeNode[]`** — `{ label, value?, color?, children? }`
  — and a parent's value defaults to the sum of its children. `DataPoint.value` is
  declared, so a genuine `TreeNode[]` typechecks without a cast; `y` is honored as
  a fallback for `value`.
- **Coloring inherits the treemap's rules verbatim:** top-level nodes take
  categorical slots in order, children are lightness steps toward the surface
  within the parent's hue. A hierarchy never invents hues.
- **Keyboard navigation walks ALL nodes**, depth-first, parent before children
  (not just leaves as in a treemap) — because in an icicle every node is a drawn
  cell. `dataIndex` is that depth-first index.
- **Point events for nested nodes are limited.** The pipeline builds
  `pointenter`/`leave`/`click` payloads from the backing *top-level* datum, so for
  a nested node the event's `x`/`y` describe the top-level datum, and no event is
  emitted for indices beyond the top-level count. Tooltips, hit-testing,
  announcements and the a11y table always describe the correct node.
- Cell labels **do** ellipsize (unlike a circle pack) and are dropped when even
  the ellipsis will not fit; the table is indented label + value + share.
