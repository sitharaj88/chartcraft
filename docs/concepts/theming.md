# Theming

ChartCraft ships a light theme and a dark theme built around a **validated
colorblind-safe palette**. The default is to follow the user's system
preference; everything is overridable, down to a fully custom `Theme` object.

## `light`, `dark`, `auto`

```ts
createChart(el, { type: 'line', data });                    // theme: 'auto' (default)
createChart(el, { type: 'line', data, theme: 'dark' });     // forced dark
createChart(el, { type: 'line', data, theme: lightTheme }); // explicit Theme object
```

- `'auto'` (the default) resolves against `prefers-color-scheme` **and tracks
  it live** — if the OS switches to dark mode, the chart re-renders in the
  dark theme without an `update` call.
- `'light'` / `'dark'` pin the built-in themes.
- A `Theme` object uses your custom theme (see below).

Switching at runtime is just an update:

```ts
chart.update({ theme: 'dark' });
```

Note that dark mode is **not** an automatic inversion of light. Every dark
value — palette slots included — was selected and re-validated against the
dark surface. That is why `categoricalPalette` has separate `light` and `dark`
arrays.

## The `Theme` shape

```ts
interface Theme {
  colorScheme: 'light' | 'dark';
  surface: string;            // chart surface
  textPrimary: string;        // title
  textSecondary: string;      // subtitle
  textMuted: string;          // axis tick labels
  gridline: string;           // hairline
  axisLine: string;
  series: string[];           // 8 categorical slots, validated order — never re-sort
  fontFamily: string;         // default: system-ui, -apple-system, "Segoe UI", sans-serif
  fontSize: number;           // base px, default 12
}
```

The built-in themes and palettes are exported:

```ts
import {
  lightTheme, darkTheme,        // Theme
  categoricalPalette,           // { light: string[]; dark: string[] } — 8 slots each
  sequentialPalette,            // string[] — blue ramp, light → dark
} from '@chartcraft/core';
```

Text always wears the ink colors — legend labels, tooltip values, and axis
text are never tinted in a series color. The colored swatch or mark next to
the text carries identity; the text stays maximally readable.

## The validated 8-slot palette

Default series colors (slot order is identical in both modes):

| Slot | Light | Dark |
|---|---|---|
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |
| 6 | `#008300` | `#008300` |
| 7 | `#4a3aa7` | `#9085e9` |
| 8 | `#e34948` | `#e66767` |

### Why the order must not change

The slot *order* is a colorblind-safety mechanism, not an aesthetic ranking.

Charts assign colors sequentially: series 1 gets slot 1, series 2 gets slot 2,
and so on — which means the color pairs that most often appear **adjacent in a
chart** are the adjacent slots in the palette. The palette is therefore
validated pairwise: for every adjacent slot pair, the perceptual distance
under simulated color-vision deficiency (protanopia, deuteranopia,
tritanopia) is **ΔE ≥ 8** (OKLab ×100), in light mode against the light
surface and in dark mode against the dark surface.

Re-sorting the slots — even without touching a single hex — silently destroys
that guarantee: two colors that were validated three slots apart may become
neighbors with a CVD distance well below the floor, and a deuteranopic reader
can no longer tell your two most important series apart. The same applies to
inserting, removing, or swapping entries.

So, concretely:

- **Never re-sort or reassign slots.** If you want a specific series to be
  blue, give *that series* `color: '#2a78d6'` — don't reorder the palette.
- **Never alter the hexes** without re-validating (see below).
- Slot colors follow **series identity**, never position after filtering —
  see [Data model](data-model.md#stable-series-identity).

### More than 8 series

ChartCraft never cycles hues past slot 8 or generates a 9th color — an
invented 9th hue cannot keep the pairwise guarantee, and 9+ simultaneously
distinguishable colors don't exist for any reader. Series beyond the 8th fold
into a single muted **"Other"** series.

If you genuinely have more than 8 meaningful series, the fix is design, not
color: split into small multiples, aggregate, or let users select which
series to compare.

## Sequential palette

For magnitude encodings (and available for your own heatmap/choropleth
tooling), `sequentialPalette` is a single-hue blue ramp from light to dark:

```
#cde2fb #b7d3f6 #9ec5f4 #86b6ef #6da7ec #5598e7 #3987e5
#2a78d6 #256abf #1c5cab #184f95 #104281 #0d366b
```

One hue, ordered by lightness — magnitude reads as darkness, which survives
every form of color vision deficiency and grayscale printing.

## Custom themes

Provide a full `Theme` object to brand a chart:

```ts
import { lightTheme } from '@chartcraft/core';
import type { Theme } from '@chartcraft/core';

const brandTheme: Theme = {
  ...lightTheme,                       // start from a validated base
  surface: '#ffffff',
  fontFamily: '"Inter", system-ui, sans-serif',
  series: [
    '#0d5fc4', '#d95a1e', '#0f9d63', '#c78a00',
    '#c4568c', '#1f7a1f', '#5b49c9', '#c43d3c',
  ],
};

createChart(el, { type: 'area', data, theme: brandTheme });
```

**Re-validate brand palettes.** The built-in guarantee applies only to the
built-in values. If you replace `series` (or change `surface`, which affects
contrast), run your 8 colors through a CVD palette validator against your
surface color, for every theme mode you ship, and re-order/re-step until every
adjacent pair passes ΔE ≥ 8. "It looks fine to me" is not a check — roughly 1
in 12 male users will read the chart differently than you do. This is also a
CI-able check; ChartCraft's own PR process requires re-running the validator
whenever palette values or order change.

Spreading from `lightTheme`/`darkTheme` and overriding only chrome
(`surface`, fonts, gridlines) keeps the validated series palette intact — the
lowest-risk way to brand.

## Per-series and per-point overrides

For one-off semantic color — a highlighted series, a status accent — override
at the series or point level rather than editing the theme:

```ts
const data = {
  categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  series: [
    { name: 'Errors', data: [3, 5, 4, 12, 6], color: '#e34948' }, // pinned semantic red
    { name: 'Warnings', data: [11, 9, 14, 20, 13] },              // next palette slot
  ],
};
```

Overridden colors are your responsibility: check them against their neighbors
for the same CVD separation, and never rely on color alone — the legend,
tooltip, and data table carry identity regardless.
