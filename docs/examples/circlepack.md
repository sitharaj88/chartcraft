# Circle packing

Nested circles: leaves filled, parents outlined, each group enclosed by its
parent. It is the most *legible* hierarchy layout — nesting is unmistakable — and
the **least precise** one, because it reads area (and wastes some, since circles
do not tile).

**Use it** when structure and grouping matter more than exact size: an
architecture overview, a "what is in this bundle" or "what is in this dataset"
picture, a poster-quality view of a taxonomy.

**Don't use it** when values must be compared — area judgements are already weak,
and enclosure adds visual weight that has nothing to do with value. Use a treemap
if you want packing efficiency, an icicle if you want the levels readable, or a
bar chart if the answer is a ranking. Also expect **dropped labels**: a circle has
no good ellipsis story, so a label that does not fit is not drawn at all.

<ClientOnly>
  <DemoCirclepack />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'circlepack',
  title: 'Bundle composition',
  subtitle: 'Gzipped size by workspace and module, KB',
  data: {
    series: [
      {
        id: 'bundle',
        name: 'Bundle',
        data: [
          {
            label: 'app',
            children: [
              { label: 'routes', value: 64 },
              { label: 'views', value: 48 },
              { label: 'state', value: 22 },
              { label: 'forms', value: 31 },
            ],
          },
          {
            label: 'design-system',
            children: [
              { label: 'components', value: 58 },
              { label: 'icons', value: 36 },
              { label: 'tokens', value: 8 },
            ],
          },
          {
            label: 'charts',
            children: [
              { label: 'core', value: 42 },
              { label: 'types', value: 27 },
              { label: 'a11y', value: 11 },
            ],
          },
          {
            label: 'vendor',
            children: [
              { label: 'router', value: 19 },
              { label: 'i18n', value: 26 },
              { label: 'date', value: 14 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'The app workspace is the largest at 165 KB gzipped, followed by the design system at 102 KB, charts at 80 KB and vendor libraries at 59 KB. The single biggest module is app routes at 64 KB.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { CirclepackChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Bundle composition',
  subtitle: 'Gzipped size by workspace and module, KB',
  data: {
    series: [
      {
        id: 'bundle',
        name: 'Bundle',
        data: [
          {
            label: 'app',
            children: [
              { label: 'routes', value: 64 },
              { label: 'views', value: 48 },
              { label: 'state', value: 22 },
              { label: 'forms', value: 31 },
            ],
          },
          {
            label: 'design-system',
            children: [
              { label: 'components', value: 58 },
              { label: 'icons', value: 36 },
              { label: 'tokens', value: 8 },
            ],
          },
          {
            label: 'charts',
            children: [
              { label: 'core', value: 42 },
              { label: 'types', value: 27 },
              { label: 'a11y', value: 11 },
            ],
          },
          {
            label: 'vendor',
            children: [
              { label: 'router', value: 19 },
              { label: 'i18n', value: 26 },
              { label: 'date', value: 14 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'The app workspace is the largest at 165 KB gzipped, followed by the design system at 102 KB, charts at 80 KB and vendor libraries at 59 KB. The single biggest module is app routes at 64 KB.',
  },
};
</script>

<template>
  <CirclepackChart :options="options" style="height: 400px" />
</template>
```

:::

## Notes

- **Data is one series of `TreeNode[]`**, same as the treemap and icicle; a
  parent's value defaults to the sum of its children, and no cast is needed.
- **Parent outlines wear the parent's OWN color** (not the gridline color), so
  "same palette rules" holds for outlines too and nesting stays readable. A parent
  circle is grown 5% beyond the enclosure of its children so its outline never
  coincides with a child's edge — and because siblings are packed with the grown
  radii, the drawn circles are still guaranteed not to overlap.
- **Leaf labels are all-or-nothing:** a label is drawn only when the full term
  fits the chord at its height. Over-long labels are dropped rather than
  truncated — a circle has nowhere sensible to put an ellipsis. The term is always
  in the tooltip and the a11y table.
- **The layout is deterministic.** The one randomized step (Welzl's
  smallest-enclosing-circle needs a randomized insertion order for its
  expected-linear behaviour) runs off a seeded generator, never `Math.random()`,
  so two renders of the same data are bit-identical. A degenerate case falls back
  to the bounding circle and the refinement loop has a step budget — a layout must
  never crash or hang a render.
- **Keyboard navigation walks ALL nodes** depth-first (parents are drawn circles
  too). Point events for nested nodes carry the same limitation as the treemap:
  `x`/`y` describe the backing top-level datum, while tooltip, announcement and
  table always describe the focused node.
