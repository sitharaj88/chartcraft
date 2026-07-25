<script setup lang="ts">
/**
 * Candlestick and OHLC side by side, same data ([x, o, h, l, c] tuples on a
 * time axis). Bodies/ticks compare close vs. open and wear theme.up /
 * theme.down — these are status colors, never series-palette slots. Financial
 * charts are never animated (they appear instantly, by contract).
 */
import type { ChartOptions } from '@chartcraft/vue';

const d = (day: number) => new Date(Date.UTC(2026, 5, day));

// ACME daily prices, June 2026 (12 trading days).
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

const shared = {
  subtitle: 'ACME — daily, June 2026 (USD)',
  data: {
    series: [{ id: 'acme', name: 'ACME', data: prices }],
  },
  yAxis: { label: 'Price (USD)' },
  a11y: {
    description:
      'ACME rose from about 85 to 91 dollars over twelve June sessions, with a three-day dip in the first week.',
  },
} satisfies Partial<ChartOptions>;

const candlestick: Omit<ChartOptions, 'theme'> = {
  ...shared,
  type: 'candlestick',
  title: 'Candlestick',
};

const ohlc: Omit<ChartOptions, 'theme'> = {
  ...shared,
  type: 'ohlc',
  title: 'OHLC bars',
};
</script>

<template>
  <div class="demo-candlestick">
    <ChartDemo :options="candlestick" :height="340" />
    <ChartDemo :options="ohlc" :height="340" />
  </div>
</template>

<style scoped>
.demo-candlestick {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 16px;
}

@media (min-width: 720px) {
  .demo-candlestick {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
