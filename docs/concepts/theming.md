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

Below, both built-in themes rendered live, pinned side by side — these two
deliberately ignore the site's dark-mode toggle:

<ClientOnly>
  <DemoThemes />
</ClientOnly>

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
  // v0.2 status colors
  up: string;                 // financial rise / waterfall increase ('#0ca30c' both modes)
  down: string;               // financial fall / waterfall decrease ('#d03b3b' both modes)
  neutral: string;            // waterfall totals & neutral marks ('#52514e' light, '#c3c2b7' dark)
  // v0.4 status color — OPTIONAL
  warning?: string;           // the caution step between up and down ('#fab219' both modes)
}
```

The `up` / `down` / `neutral` / `warning` entries are **status colors**, used by
candlestick/OHLC bodies, waterfall bars and gauge bands. They are deliberately
separate from the 8 series slots: status colors carry meaning
(rise/fall/caution/total) and never impersonate a series identity — and vice
versa. They are also identical in both schemes, because a status color carries a
*meaning*: shifting its hue between light and dark would make the same band read
as a different state on a different desktop. If you brand them, keep the rise/fall
pair distinguishable for colorblind readers (the marks' geometry — body direction,
tick sides, bar direction — always carries the information redundantly).

### The `warning` slot, and why it is optional {#warning-slot}

`up`/`down` covered two of the three states a status mark actually has. The
middle one — a gauge's caution band, a threshold being approached, an "at risk"
marker — forced every consumer to hardcode a hex, which is the theming system
being defeated one gauge at a time. `theme.warning` is that step: `#fab219`, from
the validated status palette, in both schemes.

It is the **one optional slot** on `Theme`, and deliberately so: `Theme` is a type
consumers *construct*, so making it required would have broken every hand-written
custom theme on upgrade, with the compile error landing in the caller's code. A
complete custom theme written against 0.3.0 therefore still compiles **and still
gets a themed caution color** — both built-in themes set it, a partial custom
theme has it filled in when the theme is resolved, and the single internal
resolution point falls back to the same validated `#fab219`, so nothing
downstream ever handles `undefined`.

Its first consumer is [`gauge.bands`](../examples/gauge.md), whose `color` became
optional in the same release: omit the colours and a three-band gauge is themed
`up` / `warning` / `down` by position.

The built-in themes and palettes are exported:

```ts
import {
  lightTheme, darkTheme,        // Theme
  categoricalPalette,           // { light: string[]; dark: string[] } — 8 slots each
  sequentialPalette,            // string[] — blue ramp, light → dark
  sequentialRampFor,            // (scheme) => string[] — the ramp oriented for a surface
} from '@chartcraft/core';
```

(Each framework wrapper re-exports all five under the same names, so a themed
app needs only the one package.)

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
  warning: '#b8860b',                  // optional; omit it to keep '#fab219'
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
