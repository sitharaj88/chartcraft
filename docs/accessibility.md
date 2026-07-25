# Accessibility

Accessibility is a first-class subsystem of ChartCraft, not a bolt-on. Every
chart — with zero configuration — is perceivable by screen readers, fully
keyboard-operable, and respectful of user preferences like reduced motion and
forced colors. This page explains what the library does, exactly what it
renders, and what you as the chart author must still do.

## Why a parallel DOM: the canvas problem

ChartCraft renders to Canvas 2D for performance. But a canvas is a bitmap —
to assistive technology it is a single opaque rectangle with no text, no
structure, no semantics. Rendering to canvas and stopping there would make
every chart invisible to a screen reader user.

So every ChartCraft chart maintains a **parallel DOM layer** alongside the
canvas, kept in sync on every data or options update:

```
<div>                                  ← chart.el (your container)
  <canvas … aria-hidden="true">        ← pixels (hidden from AT)
  <div role="img" aria-label="…">      ← the chart's accessible identity
  <table>                              ← the data, as a real table
                                         (visually hidden by default)
  <div aria-live="polite">             ← announcer for keyboard navigation
  …legend buttons, focus target…
</div>
```

The pixels are for eyes; the parallel DOM is the same information for
everything else. Both are generated from the same data model, so they cannot
drift apart.

## Name and description

```ts
interface A11yOptions {
  title?: string;         // aria label; defaults to options.title or a generated summary
  description?: string;   // longer text description
  table?: 'hidden' | 'visible' | 'off';  // data table fallback; default 'hidden'
  keyboard?: boolean;     // arrow-key point navigation + live announcements; default true
}
```

The chart region has `role="img"` and an accessible name resolved in order:

1. `a11y.title` if provided,
2. otherwise `options.title`,
3. otherwise a generated summary ("Line chart with 3 series, 24 points").

`a11y.description` attaches a longer prose description — use it to state the
*takeaway* of the chart, the thing a sighted user gets at a glance:

```ts
createChart(el, {
  type: 'line',
  title: 'Weekly active users',
  data,
  a11y: {
    description:
      'Weekly active users grew steadily from 12,000 in January to 31,000 in June, ' +
      'with a temporary dip in March during the migration.',
  },
});
```

## The data table

The chart's data is always available as a real `<table>` — series as columns,
x-values as row headers, proper `<th>` scope markup — controlled by
`a11y.table`:

| Value | Behavior |
|---|---|
| `'hidden'` (default) | Rendered, visually hidden, fully readable by AT. Screen reader users can leave the summary and read exact values in a familiar structure. |
| `'visible'` | Rendered on the page below the chart for everyone. |
| `'off'` | Not rendered. Only for charts that are provably redundant with adjacent visible content. |

The table updates with `chart.update`/`setData`, uses your tick formatters
for values, and renders `null` gaps as empty cells (announced as such).

**All 39 chart types ship a table**, with columns appropriate to their shape
rather than a lowest-common-denominator x/y grid: open/high/low/close for OHLC,
indented label + value + share for hierarchies, the five-number summary plus `n`
for violins, `Task | Start | End | Duration` for a gantt, `Node / link | Source |
Target | Value` for a sankey, bin ranges + counts for a histogram, a `Total`
column for a streamgraph, width shares for a marimekko, and `no data` rows for
choropleth features with no datum. Cross-cutting features contribute too — error
bars add `± low` / `± high` columns.

::: warning Downsampled series have a downsampled table
[LTTB downsampling](performance.md#lttb-downsampling) runs on the way into the
data model, which backs both the canvas *and* the parallel DOM. So on a series
above `downsample.threshold` the table (and keyboard navigation) describes the
retained points — ~5,000 rows for a 60,000-point series — and follows the
[zoom window](features/zoom-pan-brush.md) when one is active. The table is always
a faithful description of *the chart*; it is not a full data dump. Turn
downsampling off for charts where every sample must be readable.
:::

::: tip `exportData()` emits exactly this table
There is **one** table spec, and both the DOM table and
[`exportData()`](features/export.md) are built from it, so the CSV/JSON a sighted
user downloads and the table a screen reader reads can never disagree. That also
means `exportData()` keeps working with `table: 'off'`, and that a data row a
chart could not *draw* (an unmatched choropleth region, an unplaceable word cloud
term) is still in the table and still in the export — nothing is silently lost.
:::

## Keyboard navigation

With `a11y.keyboard: true` (the default), the chart is focusable (a single
tab stop) and data points are walkable:

| Key | Action |
|---|---|
| `Tab` | Focus the chart (then onward to legend buttons) |
| `→` / `←` | Next / previous point in the current series |
| `↓` / `↑` | Same point position, next / previous visible series |
| `Home` / `End` | First / last point in the current series |
| `Enter` | Activate the focused point (fires `pointclick`) |

Keyboard focus mirrors hover: the focused point gets the same visual
highlight and tooltip as a hovered point, and fires the same
`pointenter`/`pointleave`/`pointclick` events (with
`clientX === clientY === -1` so your handlers can tell the origin).

**Every one of the 39 types is keyboard-navigable**, each walking its own natural
reading order: heatmap cells row-major, funnel stages, hierarchy nodes
depth-first, calendar days in data order, word-cloud terms by rank, network nodes
by degree, and a sankey's one flat sequence of *each node followed by its own
outgoing links*. Whatever the order, `Enter` fires `pointclick` with a
`dataIndex` that means something for that type, and the live region always names
the focused mark in full.

### Zoom does not take the arrow keys

Where [zoom](features/zoom-pan-brush.md) is enabled, the contract's "arrows pan
when zoomed" is resolved in accessibility's favour:

- **plain arrows always navigate points**, zoomed or not — they are never
  intercepted;
- **`Shift`+arrow pans**, and only when a viewport is actually active and that
  axis is zoomable;
- **`Escape`** resets the zoom when zoomed, and otherwise falls through to clear
  the focused datum;
- `+` / `-` zoom, and the navigation state machine ignores those keys, so there is
  no conflict.

Claimed keys are intercepted in the capture phase, so keyboard focus can never end
up hidden behind a panned viewport.

### Live announcements

An `aria-live="polite"` region announces each focused point — e.g.
"North, March: 51" — and state changes such as "Services series hidden"
after a legend toggle. Polite (not assertive) so it never stomps on the
user's current reading; one announcement per movement, no queuing floods.

## User preference media queries

- **`prefers-reduced-motion: reduce`** — all animation is automatically
  disabled (equivalent to `animation: false`), including entry, update, and
  toggle transitions. State changes apply instantly. You don't opt in; you'd
  have to actively fight the library to show motion to these users.
- **`forced-colors: active`** (Windows High Contrast) — the parallel DOM
  (table, legend buttons, focus indicators) renders in system colors like any
  DOM content, which is precisely why it exists: when the canvas's colors are
  unreliable, the DOM path remains fully usable. Focus indicators use system
  highlight colors.
- **`prefers-color-scheme`** — with `theme: 'auto'` (default) the chart tracks
  the user's light/dark preference live. Both built-in themes are validated
  for contrast and CVD-safe series separation against their own surface; see
  [Theming](concepts/theming.md).

## Not color alone

Identity and value never depend on color perception alone:

- the legend (text in ink colors + swatch) names every series,
- the shared tooltip and data table give exact labeled values,
- the palette itself is CVD-validated pairwise (adjacent-pair ΔE ≥ 8 under
  protanopia/deuteranopia/tritanopia simulation) — see
  [Theming](concepts/theming.md#why-the-order-must-not-change).

Live example — for pie and donut charts the legend automatically lists each
**slice's label** next to its color swatch, so slice identity never relies on
color perception alone:

<ClientOnly>
  <DemoPieDonut />
</ClientOnly>

## WCAG 2.2 mapping

| Criterion | Level | How ChartCraft addresses it |
|---|---|---|
| 1.1.1 Non-text Content | A | `role="img"` + accessible name; full data table equivalent |
| 1.3.1 Info and Relationships | A | Real `<table>` with header semantics; legend as labeled buttons |
| 1.4.1 Use of Color | A | Legend, tooltip, table carry identity; CVD-validated palette |
| 1.4.3 Contrast (Minimum) | AA | Theme ink colors meet 4.5:1 on their surface (3:1 for large title text) |
| 1.4.11 Non-text Contrast | AA | Axis lines, focus indicators, and interactive marks meet 3:1 |
| 2.1.1 Keyboard | A | Full keyboard map: arrows, Home/End, Enter |
| 2.1.2 No Keyboard Trap | A | Single tab stop; Tab always exits the chart |
| 2.4.7 Focus Visible | AA | Visible focus ring on the chart, points, and legend buttons |
| 2.5.8 Target Size (Minimum) | AA | Hit targets exceed marks (24px nearest-point, full bar band) |
| 4.1.2 Name, Role, Value | A | Named img role; legend buttons expose pressed state |
| 4.1.3 Status Messages | AA | `aria-live` announcements for navigation and toggles |
| 2.3.3 Animation from Interactions | AAA | `prefers-reduced-motion` disables all animation |

Conformance of a *page* also depends on how you use the chart — which brings
us to your part.

## Guidance for chart authors

The library carries the mechanics; you carry the meaning. In order of impact:

1. **Always title your charts.** `title` (or `a11y.title`) becomes the
   accessible name. The generated fallback ("Line chart with 3 series…") is
   honest but meaningless — "Weekly active users, Jan–Jun 2026" is a name.
   An untitled chart is the single most common a11y defect we see.
2. **Write a `description` for any chart that makes an argument.** State the
   takeaway in a sentence. If the chart is worth a paragraph of analysis for
   sighted readers, it is worth one sentence for everyone else.
3. **Set `table: 'visible'` when exact values are the point** — financial
   reports, dashboards people transcribe from, printable pages, or any
   audience with low-vision users who benefit from text they can zoom and
   restyle. The hidden table serves screen readers; the visible table serves
   everyone.
4. **Don't set `table: 'off'`** unless the identical data is already visible
   in adjacent page content.
5. **Keep `keyboard` on.** Turn it off only when the chart is purely
   decorative — and if it's decorative, question the chart.
6. **If you override colors** (series `color`, custom themes), re-validate:
   CVD separation between neighbors and 3:1 contrast against the surface.
   See [custom themes](concepts/theming.md#custom-themes).
7. **Don't convey state by color alone in your own UI around the chart** —
   the library's legend/tooltip/table discipline is a model to follow, not a
   license to skip it elsewhere.

### A complete, accessible example

```ts
import { createChart } from '@chartcraft/core';

declare const usEast: [Date, number | null][];   // your data source
declare const euWest: [Date, number | null][];

const chart = createChart(document.querySelector<HTMLElement>('#uptime')!, {
  type: 'line',
  title: 'API uptime, last 30 days',
  subtitle: 'Percent of successful requests per day',
  data: {
    series: [
      { id: 'us-east', name: 'US East', data: usEast },   // [Date, number | null][]
      { id: 'eu-west', name: 'EU West', data: euWest },
    ],
  },
  yAxis: { min: 99, max: 100, label: 'Uptime (%)' },
  a11y: {
    description:
      'Both regions held above 99.9% uptime except June 12, when EU West ' +
      'dropped to 99.2% during a 40-minute incident.',
    table: 'visible',
  },
});
```
