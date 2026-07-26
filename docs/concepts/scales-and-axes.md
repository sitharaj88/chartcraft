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

A **log** axis follows a different set of rules for all of the above — no zero
anchor, decade rounding, and a non-positive `min`/`max` discarded rather than
clamped. See [Log axes](#log-axes).

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

## Log axes

`type: 'log'` (base 10) is for data spanning orders of magnitude.

`log10` is undefined at and below zero, so a log axis has no zero, no negative
half, and no "outward" direction toward either. Since **0.4** that is not a
caveat you have to work around — it is enforced: **a log axis derives its domain
from the positive data only.** Concretely, every stage that widens a value
domain behaves differently on one:

- **Zero anchoring does not apply.** Bars and areas are measured from zero on a
  *linear* axis, because that is a fact about the mark; the bottom of a log plot
  is a decade, not zero, so the anchor is skipped.
- **Rounding is to whole DECADES**, not to nice linear multiples. A 1.2 … 260
  extent becomes `1 … 1000` on a log axis and `0 … 300` on a linear one. This
  covers every chart type that widens its own contribution (`boxplot`, `violin`,
  `candlestick`/`ohlc`) and every decorator widening (error bars).
- **A stacked series contributes its cumulative tops**, not its zero stack floor
  — so the domain covers the marks that are actually drawn.
- **A non-positive bound is discarded, never clamped.** That includes an explicit
  `min`/`max` and a zoom-viewport edge: the data-derived bound stands in instead.
  `{ type: 'log', min: 0 }` is not a wider domain, it is an impossible one. A
  *positive* explicit bound is still honoured verbatim.
- **A degenerate domain widens by a decade either side** (a single value `42`
  becomes `4.2 … 420`), never down to zero.

All of it applies to a log **x** axis too, and — because axis options bind by
**role**, not by screen direction — to a horizontal chart's value axis
(`horizontal: true` with `xAxis: { type: 'log' }`).

::: warning What used to happen
Before 0.4, a chart type's own domain widening rounded a positive floor *down
through zero* by the linear convention, and `LogScale` could only clamp that `0`
to a tiny epsilon. A boxplot of all-positive data (1.2 … 260) with
`yAxis: { type: 'log' }` therefore drew a **1e-12 … 1e3** axis with every box
squashed into the top tenth of the plot, and `min: 1` was needed as a
workaround. That workaround is now a no-op — the same axis comes out either way.
:::

### Non-positive data is dropped, not thrown

A value ≤ 0 on a log axis becomes **`null`** — the pipeline's existing gap. So it
behaves exactly like any other missing datum: a break in the line, excluded from
the domain, `—` in the accessibility table and in `exportData()`. Nothing is
silently lost, and the chart says so **once** per instance on the console,
naming both ways out:

```
@chartcraft/core: "Contract value" (boxplot) has a logarithmic value axis and 2
values at or below zero. A log scale has no position for them (log10 of a
non-positive number is undefined), so they are drawn as GAPS and excluded from
the axis domain. Use a linear axis, or shift the data into positive territory,
if those values matter.
```

**Why a warning and not an error.** ChartCraft throws only for *structural*
impossibilities — a `pyramid` without two series, a cyclic `sankey` — where there
is nothing to draw at all. One zero row is not that: a live dashboard whose user
flips a linear axis to log must not go blank because of it. A log axis with no
positive data at all falls back to one empty decade (`1 … 10`).

### Still true

- **No log bar or area charts.** Bars and areas encode value as *length from a
  baseline*, and a log axis has no meaningful baseline — the visual lies. Use
  `line` or `scatter` with a log axis instead. (Nothing stops you; the zero
  anchor is simply skipped, so the bars measure from an arbitrary decade.)
- Ticks fall on powers of 10 with intermediate 2× / 5× steps when fewer than
  ~2 decades are visible, and are thinned when many decades are; a custom
  `ticks.format` is often worth it (e.g. `1k`, `10k`, `100k`).
- **Stacking on a log axis is not a meaningful encoding** — a stack reads as
  *added lengths*, and lengths on a log axis do not add. It is not rejected, and
  since 0.4 the domain is at least computed correctly (from the cumulative tops
  rather than the zero floor), but the chart is still telling the reader something
  untrue. Prefer unstacked lines.
- `'log'` is never inferred — see [Auto-inference](#auto-inference) above.

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
