# Error bars

Vertical whiskers with caps, drawn above the marks, declaring the uncertainty of
each value. A chart that reports a measurement without its interval is making a
claim it cannot support — error bars are how you avoid that.

<ClientOnly>
  <DemoErrorBars />
</ClientOnly>

## Enabling them

Error bars are a **series decoration**: set `SeriesOptions.errorBars` on the
series that has an interval. An empty object is enough to opt in when the
per-point bounds live on the data.

```ts
import { createChart } from '@chartcraft/core';

createChart(el, {
  type: 'bar',
  data: {
    categories: ['Control', 'One-page'],
    series: [
      {
        name: 'Conversion (%)',
        errorBars: { capWidth: 8 },
        data: [
          { y: 3.41, eLow: 3.22, eHigh: 3.6 },   // absolute bounds
          { y: 3.94, eLow: 3.71, eHigh: 4.17 },
        ],
      },
    ],
  },
});
```

Uniform intervals need no per-point fields:

```ts
{ name: 'Yield', errorBars: { value: 0.4 }, data: [12.1, 12.8, 13.4] }   // ±0.4
{ name: 'Yield', errorBars: { percent: 5 }, data: [12.1, 12.8, 13.4] }   // ±5%
```

## `ErrorBarOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | — | Uniform absolute delta: the interval is `y ± value`. |
| `percent` | `number` | — | Uniform relative delta, as a percentage of `\|y\|`. |
| `capWidth` | `number` | `6` | Width of the whisker caps in px. |
| `color` | `string` | series color darkened 30% | Whisker color. Falls back to `theme.textSecondary` when the series color is not a hex value. |

**Precedence:** per-point `eLow`/`eHigh` (absolute values, not deltas) win over
everything; a missing side falls back to the anchor value. Otherwise `value`
wins over `percent`.

### Per-point fields

| Field | Type | Description |
|---|---|---|
| `eLow` | `number` | Absolute lower bound of the interval for this datum. |
| `eHigh` | `number` | Absolute upper bound. |

## Where the interval shows up

Three places, all from one piece of math:

- **The value domain.** The interval is unioned into the y-domain before scales
  exist, so a whisker is never clipped by the axis.
- **The tooltip**, as `value (low–high)` with an en dash.
- **The data table**, which gains `<series> ± low` / `<series> ± high` columns —
  and therefore so does `exportData()`. Both come from one table spec, so the CSV
  and the table a screen reader reads can never disagree.

## Caveats

- **Supported chart types are keyed off the ROOT type:** `line`, `area`, `bar`,
  `scatter`, `bubble`. `errorBars` on a series of any other chart type is
  ignored — including a per-series combo `type` on an unsupported root.
- **A series must declare `errorBars`.** Per-point `eLow`/`eHigh` alone do *not*
  turn the feature on; that keeps the interval opt-in when your data happens to
  carry bounds for other reasons.
- **`percent` is a share of `|y|`**, so a percentage interval around a value near
  zero is near zero. Use `value` or explicit bounds for data that crosses zero.
- **The ± columns are appended after the type's own columns**, not interleaved
  with them: a decoration cannot know where a chart type's series columns live.
- Whiskers are 1px, drawn **above** the marks, and hidden series contribute
  nothing (they are skipped entirely, domain included).
- Error bars are implemented as a [decorator](../extensibility.md) — they get no
  special treatment from the pipeline, which is why they compose with data labels,
  annotations and zoom without any of those knowing they exist.
