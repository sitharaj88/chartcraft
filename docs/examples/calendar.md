# Calendar

A day-per-cell heatmap: weeks as columns, weekdays as rows, month boundaries
separated by hairlines, color from a sequential ramp. The form is instantly
familiar (contribution graphs made it so) and it is the only chart that shows
*weekday and seasonal rhythm at once*.

**Use it** for daily counts over months or years where the pattern matters more
than the exact number: deploys, incidents, orders, active users, publishing
cadence.

**Don't use it** for precise comparison — colour steps are approximate, so the
value has to come from the tooltip or the table (the same caveat as any
heatmap). Don't use it for sub-daily data (a cell is a day; aggregate first) or
for fewer than a couple of months, where a bar chart is plainly better. And be
careful with skewed data: one outlier day flattens the whole ramp, since the
color extent is always the data extent.

<ClientOnly>
  <DemoCalendar />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { DataValue } from '@chartcraft/core';

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
    const frozen = ms >= Date.UTC(2026, 2, 23) && ms < Date.UTC(2026, 2, 30);
    if (frozen || (weekend && r < 0.72)) continue;
    const base = weekend ? 1 : 3 + Math.round(r * 9);
    out.push({ x: new Date(ms), y: base });
  }
  return out;
}

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'calendar',
  title: 'Production deploys per day',
  subtitle: 'January – June 2026 (UTC)',
  calendar: {
    start: new Date(Date.UTC(2026, 0, 1)),
    end: new Date(Date.UTC(2026, 5, 30)),
    weekStart: 1,
  },
  data: {
    series: [{ id: 'deploys', name: 'Deploys', data: deployDays() }],
  },
  a11y: {
    description:
      'Deploys cluster on weekdays at three to twelve per day, drop to at most one or two at weekends, and stop entirely during the release freeze in the last week of March.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { CalendarChart } from '@chartcraft/vue';
import type { DataValue, ChartSpec } from '@chartcraft/vue';

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
    const frozen = ms >= Date.UTC(2026, 2, 23) && ms < Date.UTC(2026, 2, 30);
    if (frozen || (weekend && r < 0.72)) continue;
    const base = weekend ? 1 : 3 + Math.round(r * 9);
    out.push({ x: new Date(ms), y: base });
  }
  return out;
}

const options: ChartSpec = {
  title: 'Production deploys per day',
  subtitle: 'January – June 2026 (UTC)',
  calendar: {
    start: new Date(Date.UTC(2026, 0, 1)),
    end: new Date(Date.UTC(2026, 5, 30)),
    weekStart: 1,
  },
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
  <CalendarChart :options="options" style="height: 260px" />
</template>
```

:::

## Notes

- **Dates are interpreted in UTC, unconditionally.** A cell is a calendar day,
  and a day is only well defined against a fixed zone: with local arithmetic the
  same datum would land in a different cell (or month) depending on the browser's
  offset, and DST would produce 6- and 8-cell weeks. Build your dates with
  `Date.UTC(...)` or from `'YYYY-MM-DD'` strings; `calendar.start` / `end` follow
  the same rule, and a plain number is epoch milliseconds.
- **Keyboard navigation walks data order, not chronological order.** For calendar
  data those are normally the same thing; if your input is unsorted, cells are
  still *positioned* by their date but the walk (and the a11y table, which is kept
  consistent with it) follows the array. Every announcement names the full date,
  so focus is never ambiguous. Sort your data if the reading order matters.
- **Days in range with no datum** are drawn in `theme.gridline` and are **not
  hoverable** — there is nothing to report. Cells carry a 1px surface gap.
- **One series.** Extra series are ignored (not an error), and keyboard
  navigation stays inside the first visible one.
- **Month labels are selective:** `Jan`…`Dec` with no year, dropped when they
  would collide with the previous one. A multi-year range therefore repeats month
  names — the axis of a calendar is the grid itself.
- The gradient scale legend is shown by default (the ramp is the only key to what
  a cell's color means) and `calendar` has no `min`/`max`, so the color extent is
  always the data extent. `calendar.ramp` replaces the ramp;
  `calendar.weekStart` picks Sunday (`0`) or Monday (`1`).
