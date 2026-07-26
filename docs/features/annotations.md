# Annotations

Reference lines, shaded bands, labeled points and free text. Annotations are how a
chart says *why* — the SLA it must stay under, the day the release shipped, the
outlier that has an explanation.

<ClientOnly>
  <DemoAnnotations />
</ClientOnly>

## Adding them

```ts
import { createChart } from '@chartcraft/core';
import type { Annotation } from '@chartcraft/core';

const annotations: Annotation[] = [
  { kind: 'band', axis: 'y', from: 0, to: 250, label: 'Within SLA' },
  { kind: 'line', axis: 'y', value: 300, label: 'SLA breach (300 ms)' },
  { kind: 'line', axis: 'x', value: new Date('2026-06-15'), label: 'Release 4.0' },
  { kind: 'point', x: new Date('2026-06-20'), y: 412, label: 'Incident #482' },
  { kind: 'text', x: new Date('2026-06-25'), y: 150, text: 'Cache warm-up complete' },
];

createChart(el, { type: 'line', data, annotations });
```

## The four kinds

| Kind | Fields | Drawn as |
|---|---|---|
| `line` | `axis: 'x' \| 'y'`, `value: number \| Date`, `label?`, `color?`, `dashed?` | A 1px reference line across the plot, **dashed by default**, label at the top of a vertical line / the right end of a horizontal one. |
| `band` | `axis: 'x' \| 'y'`, `from`, `to` (`number \| Date`), `label?`, `color?` | A filled region at **0.55 alpha** in `color ?? theme.gridline`, drawn **under** the marks, label at its top center. |
| `point` | `x` (`number \| Date \| string`), `y: number`, `label` (required), `color?` | A 5px dot with a 2px surface ring, label to its right. |
| `text` | `x`, `y`, `text`, `color?` | Free text centered on its anchor. |

Labels are `theme.textSecondary` over a 3px-padded rounded surface halo at 0.85
alpha, so they stay legible over marks and gridlines.

## Axis semantics

`axis: 'x'` addresses the **data** axis and `axis: 'y'` the **value** axis —
whichever screen direction each happens to be. That is the same vocabulary the
[zoom viewport](./zoom-pan-brush.md) uses, so `horizontal: true` charts need no
special casing.

On a **band (category) axis**, `line` and `band` annotations are positioned by
**band index**: their `value` / `from` / `to` are typed `number | Date`, so a
category *name* does not typecheck — pass `categories.indexOf('Wed')` instead of
`'Wed'`. (`point` and `text` annotations are the exception: their `x` is
`number | Date | string`, so those two do accept a category name.) Anything that
cannot be placed yields no geometry.

```ts
const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const annotations: Annotation[] = [
  { kind: 'line', axis: 'x', value: categories.indexOf('Wed'), label: 'Deploy' },
  { kind: 'text', x: 'Wed', y: 150, text: 'Deploy' },   // x accepts the name here
];
```

## Clicks

Annotation marks are hit-tested **before** data points and consume the click:

```ts
chart.on('annotationclick', ({ index, annotation }) => {
  // index is the position in your `annotations` array
  openIncident(annotation);
});
```

No `pointclick` follows a consumed click. Hit tolerances: 4px around a line, 8px
around a point dot, the measured text box + 2px for text, the rectangle for a
band. **Marks beat bands, and later entries beat earlier ones.**

## Caveats

- **Cartesian types only** (the same rule as data labels): annotations apply to
  chart types that use the shared cartesian axes.
- **Bands are drawn under the marks, lines/points/text above them** — including
  above axis chrome, so a reference line label is never hidden behind a tick label.
- **Everything is clipped to the plot.** An annotation that cannot be placed is
  **dropped, not clamped** — a clamped reference line would state something false.
  A band that only partly overlaps the plot is clipped to it.
- **Reference lines are dashed by default.** `dashed: false` exists, but a solid
  1px line in `textSecondary` can read as data on a busy chart; use it knowingly.
- **Annotations are in the accessible DESCRIPTION, not the data table.** They are
  context, not data — so they never appear in `exportData()` either. The
  description is concatenated with your `a11y.description` into one visually-hidden
  node.
- `annotations` is an array, and arrays are replaced wholesale by `update()` — pass
  the full list every time.
- Annotations are implemented as two [decorators](../extensibility.md) (bands
  under, marks over) sharing one piece of geometry math.
