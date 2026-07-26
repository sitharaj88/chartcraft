# Word cloud

Terms sized by weight, placed along a spiral with collision avoidance.

Let's be honest about what this is: **a word cloud is decorative, not
analytical.** Area is proportional to nothing in particular (a long word at a
small size can out-ink a short word at a large one), placement carries no
meaning, and the eye cannot rank sizes. Every quantitative question a word cloud
raises is answered better by a horizontal bar chart of the top 20 terms.

**Use it** as an attention-getting visual where the *gist* is enough: a report
cover, a conference slide, a "what people talked about" banner above the real
chart.

**Don't use it** when anyone will try to read a ranking or compare two terms, and
never as the only view of the data. If you must ship one, ship the bar chart next
to it — and note that this type keeps every term in the tooltip, the keyboard
walk and the data table, so at least the numbers remain reachable.

<ClientOnly>
  <DemoWordcloud />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'wordcloud',
  title: 'Most frequent terms in support tickets',
  subtitle: 'Last 30 days · size ∝ mentions (exact counts in the tooltip)',
  wordcloud: { minFontSize: 13, maxFontSize: 52, rotate: false },
  data: {
    series: [
      {
        id: 'terms',
        name: 'Mentions',
        data: [
          { x: 'invoice', y: 412 },
          { x: 'SSO login', y: 388 },
          { x: 'export', y: 341 },
          { x: 'timeout', y: 296 },
          { x: 'permissions', y: 264 },
          { x: 'webhook', y: 233 },
          { x: 'seat limit', y: 208 },
          { x: 'API key', y: 191 },
          { x: 'sync delay', y: 174 },
          { x: 'dashboard', y: 162 },
          { x: 'CSV', y: 148 },
          { x: 'billing date', y: 131 },
          { x: 'password reset', y: 119 },
          { x: '2FA', y: 104 },
          { x: 'rate limit', y: 92 },
          { x: 'audit log', y: 81 },
          { x: 'sandbox', y: 68 },
          { x: 'onboarding', y: 57 },
          { x: 'mobile app', y: 44 },
          { x: 'dark mode', y: 31 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Invoices (412 mentions), SSO login (388) and export (341) dominate support tickets; timeouts and permissions follow at around 280.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { WordcloudChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Most frequent terms in support tickets',
  subtitle: 'Last 30 days · size ∝ mentions (exact counts in the tooltip)',
  wordcloud: { minFontSize: 13, maxFontSize: 52, rotate: false },
  data: {
    series: [
      {
        id: 'terms',
        name: 'Mentions',
        data: [
          { x: 'invoice', y: 412 },
          { x: 'SSO login', y: 388 },
          { x: 'export', y: 341 },
          { x: 'timeout', y: 296 },
          { x: 'permissions', y: 264 },
          { x: 'webhook', y: 233 },
          { x: 'seat limit', y: 208 },
          { x: 'API key', y: 191 },
          { x: 'sync delay', y: 174 },
          { x: 'dashboard', y: 162 },
          { x: 'CSV', y: 148 },
          { x: 'billing date', y: 131 },
          { x: 'password reset', y: 119 },
          { x: '2FA', y: 104 },
          { x: 'rate limit', y: 92 },
          { x: 'audit log', y: 81 },
          { x: 'sandbox', y: 68 },
          { x: 'onboarding', y: 57 },
          { x: 'mobile app', y: 44 },
          { x: 'dark mode', y: 31 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Invoices (412 mentions), SSO login (388) and export (341) dominate support tickets; timeouts and permissions follow at around 280.',
  },
};
</script>

<template>
  <WordcloudChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **Terms are the marks**, so this is the one place text wears series colors — and
  the slots cycle **by rank**, not by data order.
- **`dataIndex` is a RANK**, not a data index (weight descending, ties in data
  order). Hit-testing, tooltips, announcements and the table are all rank-ordered
  and mutually consistent; as with treemap/sunburst, the pipeline-built
  `PointEvent.x`/`y` describe the datum at that *index*, so read the term from your
  own data by rank if you need it in an event handler.
- **Deterministic layout.** Only each word's spiral start phase comes from a
  seeded generator, in rank order — no `Math.random()`, so the same data always
  renders identically.
- **Defaults** (the contract sets none): `minFontSize: 12`, `maxFontSize: 48`,
  `rotate: false`. Size is interpolated **linearly** in weight; a degenerate weight
  range (one term, or all weights equal) puts every word at `maxFontSize` — none of
  them should read as smaller than the others. `rotate: true` rotates **odd ranks**
  by 90° (deterministic alternation, not a random draw).
- **Words that cannot be placed are dropped from the picture** after 1600 spiral
  probes — but kept in keyboard navigation and the a11y table, so no datum is
  silently lost. Give the chart room, or fewer terms.
- Line height is estimated as `fontSize × 1.2` (the renderer exposes no height
  metric) and text width falls back to `length × fontSize × 0.6` in environments
  with no real text metrics.
- The legend is hidden by default (the terms are directly labeled). An explicit
  `legend: true` lists them in rank order, non-toggleable.
