<script setup lang="ts">
/**
 * Trendlines: `SeriesOptions.trendline` on a line/scatter/bubble chart. Dashed
 * by default and labeled in the legend, so a fit can never be mistaken for
 * observed data — and excluded from the value domain, so a steep fit leaves the
 * plot instead of rescaling the data.
 *
 * Two fits, two questions: a least-squares line answers "is there a
 * relationship?", a centered moving average answers "what is the level under
 * the noise?".
 */
import type { ChartOptions } from '@chartcraft/vue';

const scatter: Omit<ChartOptions, 'theme'> = {
  type: 'scatter',
  title: 'Paid spend vs new signups',
  subtitle: 'One point per week, last 26 weeks · dashed = least-squares fit',
  data: {
    series: [
      {
        id: 'weeks',
        name: 'Week',
        trendline: { type: 'linear' },
        data: [
          [12.4, 310], [14.1, 356], [11.8, 298], [16.2, 402], [18.9, 447], [15.4, 371],
          [21.3, 512], [19.7, 468], [23.6, 546], [17.2, 409], [25.1, 588], [22.4, 501],
          [27.8, 634], [24.9, 573], [29.4, 668], [26.3, 601], [31.7, 712], [28.6, 655],
          [33.2, 739], [30.1, 684], [35.8, 786], [32.4, 718], [37.1, 812], [34.6, 761],
          [39.4, 848], [36.2, 792],
        ],
      },
    ],
  },
  xAxis: { label: 'Paid spend ($k)' },
  yAxis: { label: 'New signups', min: 0 },
  a11y: {
    description:
      'New signups rise roughly linearly with paid spend across the 26 weeks — about 22 extra signups per additional $1k of spend, with no sign of saturation inside the observed range.',
  },
};

/** Deterministic daily signups: a rising level plus weekday noise. */
function dailySignups(): [number, number][] {
  const out: [number, number][] = [];
  const start = Date.UTC(2026, 3, 1);
  let seed = 19;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 84; i++) {
    const weekday = new Date(start + i * 86_400_000).getUTCDay();
    const weekendDip = weekday === 0 || weekday === 6 ? 0.62 : 1;
    const level = 120 + i * 1.6;
    out.push([start + i * 86_400_000, Math.round(level * weekendDip * (0.86 + rand() * 0.28))]);
  }
  return out;
}

const line: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'Daily signups with a 7-day moving average',
  subtitle: 'The weekly weekend dip is noise, not a trend',
  data: {
    series: [
      {
        id: 'signups',
        name: 'Signups',
        showMarkers: false,
        trendline: { type: 'movingAverage', period: 7, label: '7-day average' },
        data: dailySignups(),
      },
    ],
  },
  xAxis: { type: 'time' },
  yAxis: { label: 'Signups', min: 0 },
  a11y: {
    description:
      'Daily signups swing between roughly 70 and 300 with a pronounced weekend dip; the 7-day moving average shows a steady rise from about 120 to about 250 per day over twelve weeks.',
  },
};
</script>

<template>
  <div>
    <ChartDemo :options="scatter" :height="360" />
    <ChartDemo :options="line" :height="320" />
  </div>
</template>
