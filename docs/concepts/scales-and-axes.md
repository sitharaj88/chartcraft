# Scales and axes

Cartesian charts (`line`, `area`, `bar`, `scatter`) have an x-axis and a
y-axis, each configured through `AxisOptions`. `pie` and `donut` ignore axis
options entirely.

```ts
interface AxisOptions {
  label?: string;                                  // axis title
  min?: number | 'auto';
  max?: number | 'auto';
  type?: 'linear' | 'time' | 'log' | 'category';   // default inferred from data
  ticks?: { count?: number; format?: (value: number | Date | string) => string };
  grid?: boolean;                                  // default: true on y, false on x
}
```

```ts
createChart(el, {
  type: 'line',
  data,
  xAxis: { label: 'Date', type: 'time' },
  yAxis: { label: 'Latency (ms)', min: 0, ticks: { count: 5 } },
});
```

## Axis types

| `type` | Scale | Use for |
|---|---|---|
| `'linear'` | `LinearScale` | continuous numeric values |
| `'time'` | `TimeScale` | `Date` values; calendar-aware ticks |
| `'log'` | `LogScale` | values spanning orders of magnitude |
| `'category'` | `BandScale` | discrete labels with equal-width bands |

The scale classes (`LinearScale`, `TimeScale`, `BandScale`, `LogScale`) are
exported from `@chartcraft/core` for advanced users building custom formatters
or coordinated views — normal usage never touches them.

## Auto-inference

You rarely need to set `type`. When omitted, ChartCraft infers it from the
data:

- `data.categories` present, or string x-values → `'category'`
- `Date` x-values → `'time'`
- numeric x-values → `'linear'`
- y-axis → `'linear'`

`'log'` is **never inferred** — logarithmic display is an interpretation
choice, so it must always be explicit.

Setting `type` overrides inference; if the data can't support the requested
type (e.g. string categories on a `'time'` axis), that is an options error.

## Min, max, and the auto domain

`min` and `max` default to `'auto'`:

- **Linear y:** the domain covers the data extent with headroom above the
  maximum so marks don't touch the plot edge. For **bar and area** charts the
  baseline is anchored at 0 when all data is non-negative — truncating a bar
  axis misrepresents magnitude, so if you truly need it you must set `min`
  explicitly and own that choice.
- **Line and scatter** are position encodings, not length encodings, so their
  auto domain fits the data rather than forcing 0.
- `null` values are ignored when computing the extent.
- Explicit numbers pin one or both ends: `{ min: 0, max: 100 }` for a fixed
  percentage axis. You can mix: `{ min: 0, max: 'auto' }`.

For **stacked** charts, the extent is computed on the stacked totals.

## Ticks

`ticks.count` is a *hint*: the scale picks approximately that many "nice"
values (whole steps of 1/2/5×10ⁿ for linear; calendar units for time). Default
is chosen from the axis pixel size, so ticks never crowd.

`ticks.format` receives the tick value (`number | Date | string`, matching the
axis type) and returns the label string. Formatting is presentation-only —
it does not affect the scale.

```ts
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact',
});

createChart(el, {
  type: 'line',
  data,
  yAxis: { ticks: { format: (v) => usd.format(v as number) } },
});
```

Tick labels render in the theme's `textMuted` ink; gridlines are hairline and,
by default, drawn for the y-axis only (`grid` defaults to `true` on y and
`false` on x — the usual right amount of reference structure without chart
junk). Set
`grid: true` on the x-axis for scatter plots where both positions matter.

## Log axes — caveats

`type: 'log'` (base 10) is for data spanning orders of magnitude. Know its
sharp edges:

- **No zero, no negatives.** log(0) is undefined. Values ≤ 0 cannot be placed
  on a log scale; use `null` for missing data, and reconsider the scale (or
  offset your data) if legitimate zeros exist.
- **No log bar or area charts.** Bars and areas encode value as *length from a
  baseline*, and a log axis has no meaningful baseline — the visual lies.
  Use `line` or `scatter` with a log axis instead.
- `min`/`max` must be positive when set explicitly.
- Ticks fall on powers of 10 with intermediate steps when space allows; a
  custom `ticks.format` is often worth it (e.g. `1k`, `10k`, `100k`).
- Stacking on a log axis is not meaningful and is not supported.

## Time handling

Time axes accept `Date` objects as x-values (in `[Date, y]` pairs or
`{ x: Date, y }` objects).

- **Ticks are calendar-aware**: they land on natural boundaries (years,
  months, weeks, days, hours, minutes) for the visible span, and default
  labels adapt to the zoom level (`"Jul 2026"` vs `"14:05"`).
- **Timestamps are absolute; labels are local.** Positions are computed from
  the underlying epoch milliseconds, and default tick labels use the
  browser's local time zone. If your users span time zones and the chart must
  read in a fixed zone (e.g. UTC), format explicitly:

```ts
const utc = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

createChart(el, {
  type: 'line',
  data,
  xAxis: { type: 'time', label: 'Time (UTC)', ticks: { format: (v) => utc.format(v as Date) } },
});
```

- **Uneven sampling shows as uneven spacing** — that is the point of a time
  axis. If you instead want equal-width buckets ("Q1, Q2, Q3…"), use
  `categories` with a band axis; see
  [Categories vs pairs](data-model.md#categories-vs-x-y-pairs).
- Numeric epoch-millisecond x-values are treated as plain numbers and infer a
  `'linear'` axis; pass real `Date`s (or set `type: 'time'`) to get calendar
  behavior.

## One y-axis, on purpose

ChartCraft has no dual-axis option. Two measures on different scales belong in
two charts (or one chart after indexing both to a common base) — a second
y-scale makes the crossing points and relative slopes of the two lines pure
artifacts of axis choice. This is a deliberate omission, not a missing
feature.
