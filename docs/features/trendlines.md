# Trendlines

A fitted line over a series: least squares, a centered moving average, or an
exponential fit. Dashed by default and labeled in the legend, because a model is
not an observation and must never be able to pass for one.

<ClientOnly>
  <DemoTrendlines />
</ClientOnly>

## Enabling one

```ts
import { createChart } from '@chartcraft/core';

createChart(el, {
  type: 'scatter',
  data: {
    series: [
      {
        name: 'Week',
        trendline: { type: 'linear' },
        data: [[12.4, 310], [14.1, 356], [11.8, 298] /* … */],
      },
    ],
  },
});
```

```ts
// A centered 7-day average under noisy daily data:
{ name: 'Signups', trendline: { type: 'movingAverage', period: 7, label: '7-day average' } }
```

## `TrendlineOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `'linear' \| 'movingAverage' \| 'exponential'` | `'linear'` | Which fit. `'linear'` = ordinary least squares; `'movingAverage'` = centered window; `'exponential'` = `y = ae^{bx}` fitted on `ln y`. |
| `period` | `number` | `7` | `movingAverage` window length, in points. |
| `color` | `string` | series color | Line color. |
| `dashed` | `boolean` | `true` | Dashed (`[6, 4]`). Set `false` only if something else in the chart already distinguishes the fit from the data. |
| `label` | `string \| false` | `"<series> trend"` | Legend entry. `false` removes it — which also removes the reader's only cue that the line is a model. |

## The math, exactly

- **`'linear'`** — ordinary least squares over the series' finite points; needs at
  least two points with distinct x. Drawn as its two fitted endpoints.
- **`'movingAverage'`** — the window
  `[i - floor((period-1)/2) … ]` of length `period`: exactly centered for odd
  periods, one extra sample on the right for even ones. It **clamps at the edges**
  (a partial average) so the line spans the whole series. `null`s are skipped, and
  an all-null window yields `null` (a break in the line).
- **`'exponential'`** — least squares on `ln y`, **dropping points with
  `y <= 0`**, drawn as 64 samples across the x extent.

## Caveats

- **Supported chart types are keyed off the ROOT type:** `line`, `scatter`,
  `bubble`. A `trendline` on a bar or area chart is ignored.
- **Trendlines are excluded from the value domain, unconditionally**, and drawing
  is clipped to the plot. A steep fit therefore *leaves the plot* rather than
  rescaling your observed data — that is the intended trade: the data owns the
  axis.
- **A moving average is not a forecast.** It has no value beyond the last point,
  and its ends are partial averages (see above), which are noisier than the middle.
- **`'exponential'` silently ignores non-positive values** because `ln y` is
  undefined there. If your series crosses zero, an exponential fit is the wrong
  model, not a rendering problem.
- **The legend entry is appended after the type's own items**, and is skipped
  entirely for chart types that supply a custom legend element (heatmap, calendar,
  choropleth gradient bars).
- Hidden series contribute no trendline.
- One trendline per series. For several fits on one series, add the second as its
  own series with `visible` data — or compute it yourself and pass it as a line.
- Trendlines are implemented as a [decorator](../extensibility.md), which is why a
  chart type never needs to know they exist.
