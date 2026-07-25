# Line

Two series over ordered categories — markers appear automatically (series with
≤ 60 points), the legend appears automatically (2+ series), and the shared
crosshair tooltip is the default for line charts.

<ClientOnly>
  <DemoLine />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'line',
  title: 'Weekly active users',
  subtitle: 'Last 8 weeks',
  data: {
    categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    series: [
      { id: 'web', name: 'Web', data: [1240, 1355, 1480, 1462, 1621, 1748, 1803, 1957] },
      { id: 'mobile', name: 'Mobile', data: [2110, 2280, 2195, 2404, 2542, 2601, 2789, 2932] },
    ],
  },
  yAxis: { label: 'Users', min: 0 },
  a11y: {
    description:
      'Web and mobile weekly active users both grew over the last 8 weeks; mobile stayed roughly 1,000 users ahead.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { LineChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Weekly active users',
  subtitle: 'Last 8 weeks',
  data: {
    categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    series: [
      { id: 'web', name: 'Web', data: [1240, 1355, 1480, 1462, 1621, 1748, 1803, 1957] },
      { id: 'mobile', name: 'Mobile', data: [2110, 2280, 2195, 2404, 2542, 2601, 2789, 2932] },
    ],
  },
  yAxis: { label: 'Users', min: 0 },
  a11y: {
    description:
      'Web and mobile weekly active users both grew over the last 8 weeks; mobile stayed roughly 1,000 users ahead.',
  },
};
</script>

<template>
  <LineChart :options="options" style="height: 340px" />
</template>
```

:::

::: tip Theme note
The code above leaves `theme` at its default (`'auto'`, which follows
`prefers-color-scheme`). The live demos on this site instead pass
`theme: isDark ? 'dark' : 'light'` so charts follow the site's own dark-mode
toggle — see [Theming](../concepts/theming.md).
:::

Want a smooth multi-series line? The landing-page hero chart is the same
type with `curve: 'monotone'` per series — see the [home page](../index.md).
