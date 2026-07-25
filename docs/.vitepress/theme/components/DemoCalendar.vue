<script setup lang="ts">
/**
 * Calendar heatmap: one day per cell, weeks as columns.
 *
 * TIMEZONE: every date is interpreted in **UTC**, deliberately — a cell is a
 * calendar day, and a day is only well defined against a fixed zone. Build
 * dates with `Date.UTC(...)` (as below) or from `'YYYY-MM-DD'` strings.
 *
 * Days inside the range with no datum are drawn in the gridline color and are
 * not hoverable; the gradient legend is the key to the ramp.
 */
import type { ChartOptions, DataValue } from '@chartcraft/vue';

/** Deterministic deploy counts for a 26-week window (weekends mostly quiet). */
function deployDays(): DataValue[] {
  const out: DataValue[] = [];
  const start = Date.UTC(2026, 0, 5); // Monday 2026-01-05, UTC
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 182; i++) {
    const ms = start + i * 86_400_000;
    const weekday = new Date(ms).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const r = rand();
    // Release freeze in the last week of March.
    const frozen = ms >= Date.UTC(2026, 2, 23) && ms < Date.UTC(2026, 2, 30);
    if (frozen || (weekend && r < 0.72)) continue;
    const base = weekend ? 1 : 3 + Math.round(r * 9);
    out.push({ x: new Date(ms), y: base });
  }
  return out;
}

const options: Omit<ChartOptions, 'theme'> = {
  type: 'calendar',
  title: 'Production deploys per day',
  subtitle: 'January – June 2026 (UTC)',
  calendar: { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 5, 30)), weekStart: 1 },
  data: {
    series: [{ id: 'deploys', name: 'Deploys', data: deployDays() }],
  },
  a11y: {
    description:
      'Deploys cluster on weekdays at three to twelve per day, drop to at most one or two at weekends, and stop entirely during the release freeze in the last week of March.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="260" />
</template>
