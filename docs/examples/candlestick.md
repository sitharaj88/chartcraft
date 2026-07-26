# Candlestick & OHLC

Price movement over time: each mark carries open, high, low, and close.
Candlestick fills the open→close body (rise in `theme.up`, fall in
`theme.down`, 1px high–low wick); OHLC draws the high–low bar with open/close
ticks left/right — same data, same colors, different mark. Use them for
market-style OHLC data on a time axis. Don't use them for a single value per
period (that's a [line](line.md)) — and if you need a volume pane, that's a
second chart (small multiple), never a dual axis.

<ClientOnly>
  <DemoCandlestick />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const d = (day: number) => new Date(Date.UTC(2026, 5, day));

// [x, open, high, low, close] tuples — { x, o, h, l, c } objects work too.
const prices: [Date, number, number, number, number][] = [
  [d(1), 84.2, 86.1, 83.6, 85.4],
  [d(2), 85.4, 87.3, 85.0, 86.9],
  [d(3), 86.9, 87.4, 84.8, 85.1],
  [d(4), 85.1, 85.9, 83.2, 83.7],
  [d(5), 83.7, 84.6, 82.1, 84.3],
  [d(8), 84.3, 86.8, 84.3, 86.5],
  [d(9), 86.5, 88.9, 86.2, 88.4],
  [d(10), 88.4, 89.2, 87.1, 87.6],
  [d(11), 87.6, 88.1, 85.9, 86.2],
  [d(12), 86.2, 87.7, 85.8, 87.5],
  [d(15), 87.5, 90.4, 87.3, 90.1],
  [d(16), 90.1, 91.2, 89.0, 90.7],
];

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'candlestick', // or 'ohlc' — identical data, tick-style marks
  title: 'Candlestick',
  subtitle: 'ACME — daily, June 2026 (USD)',
  data: {
    series: [{ id: 'acme', name: 'ACME', data: prices }],
  },
  yAxis: { label: 'Price (USD)' },
  a11y: {
    description:
      'ACME rose from about 85 to 91 dollars over twelve June sessions, with a three-day dip in the first week.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { CandlestickChart, OhlcChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const d = (day: number) => new Date(Date.UTC(2026, 5, day));

// [x, open, high, low, close] tuples — { x, o, h, l, c } objects work too.
const prices: [Date, number, number, number, number][] = [
  [d(1), 84.2, 86.1, 83.6, 85.4],
  [d(2), 85.4, 87.3, 85.0, 86.9],
  [d(3), 86.9, 87.4, 84.8, 85.1],
  [d(4), 85.1, 85.9, 83.2, 83.7],
  [d(5), 83.7, 84.6, 82.1, 84.3],
  [d(8), 84.3, 86.8, 84.3, 86.5],
  [d(9), 86.5, 88.9, 86.2, 88.4],
  [d(10), 88.4, 89.2, 87.1, 87.6],
  [d(11), 87.6, 88.1, 85.9, 86.2],
  [d(12), 86.2, 87.7, 85.8, 87.5],
  [d(15), 87.5, 90.4, 87.3, 90.1],
  [d(16), 90.1, 91.2, 89.0, 90.7],
];

const options: ChartSpec = {
  title: 'Candlestick',
  subtitle: 'ACME — daily, June 2026 (USD)',
  data: {
    series: [{ id: 'acme', name: 'ACME', data: prices }],
  },
  yAxis: { label: 'Price (USD)' },
  a11y: {
    description:
      'ACME rose from about 85 to 91 dollars over twelve June sessions, with a three-day dip in the first week.',
  },
};
</script>

<template>
  <CandlestickChart :options="options" style="height: 340px" />
  <!-- Same options render as OHLC bars: -->
  <OhlcChart :options="{ ...options, title: 'OHLC bars' }" style="height: 340px" />
</template>
```

:::

::: tip Financial specifics
- Candles **never animate** — they appear instantly, and an explicit
  `animation: true` is overridden (there is no honest animated presentation
  for financial marks).
- A doji (`close === open`) renders in `theme.up`.
- In tuple/object data without `y`, `y` defaults to the close, so events and
  the generic pipeline carry a sensible value; the tooltip and data table
  show the full OHLC block.
:::
