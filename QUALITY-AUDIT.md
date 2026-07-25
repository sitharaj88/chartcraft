# ChartCraft v0.3 — Quality Audit

An adversarial audit of the claims "39 chart types, accessibility-first,
colorblind-safe palette, high performance", carried out against
`packages/core` at the v0.3 integration point.

The starting suite (1148 tests, all green) was written by the agents that wrote
the code, so it encodes their assumptions. This audit deliberately looked for
what none of them could see from inside their own type: cross-type invariants,
degenerate data, lifecycle, and measured — rather than asserted — numbers.

**Scope note, stated up front:** everything below is evidence I generated on
this machine. Where a dimension is incomplete, it says so. Nothing here is
graded on effort.

---

## Headline verdict

**The library is substantially better than a project at this stage usually is,
and three of its four headline claims survive contact with an adversary. The
accessibility claim did not — not because the a11y layer is thin (it is
unusually thorough) but because its two most load-bearing surfaces were wrong in
ways no per-type test could catch.**

| Claim | Verdict | Basis |
|---|---|---|
| **39 chart types** | **Upheld** | All 39 registered, non-placeholder, and they mount, paint, tabulate, export and destroy. Verified across 39 × 10 degenerate-data scenarios. |
| **Accessibility-first** | **Was overstated; now largely upheld** | The per-type data tables and announcements are genuinely excellent. But the accessible NAME said nothing on all 39 types, and the data table + `exportData()` served a *downsampled* subset of the data. Both fixed. |
| **Colorblind-safe palette** | **Upheld for the base palette; two derived cases escalated — both since RULED and FIXED (v0.3.1)** | The 8 categorical slots pass the validator in both modes. The `up`/`down` status pair fails CVD separation (ΔE 4.1 deutan) — now carried by a redundant fill channel (E-6). The sequential ramp put its high-value end at 1.46:1 in dark mode — now scheme-directed, 13.16:1 (E-3). See *Resolutions* below. |
| **High performance** | **Upheld for the render path; two pathologies found** | The redraw path is genuinely allocation-free (−0.1 MB over 200 frames). But `downsample: { enabled: false }` **hard-crashed** past ~125k points, and the accessible layer cost multiples of the render. Crash fixed; a11y cost reduced and the residual quantified. |

**Bugs found: 13.** 4 high, 5 medium, 4 low. **11 fixed with tests, 2 pinned as
documented behaviour.** **6 items escalated** — 3 of them require decisions I
should not make unilaterally (documented palette values, a contract clause
conflict, and a cross-cutting formatting change).

Test suite: **1148 → 1859**, all green. Typecheck was **red on arrival** (see
C-1) and is now clean across all four workspaces.

---

## Method

- A parameterized a11y conformance suite driving all 39 types through the real
  keydown/DOM path (`packages/core/test/a11y.conformance.test.ts`, 358 assertions).
- A robustness sweep driving all 39 through degenerate data, lifecycle churn and
  determinism checks (`packages/core/test/robustness.test.ts`, 353 assertions).
- The shared 39-type fixture corpus extracted to
  `packages/core/test/fixtures.all-types.ts` so the smoke test, the conformance
  audit and the robustness sweep cannot diverge on what they consider a valid
  chart of each type.
- The dataviz skill's palette validator, run on the base palette **and on every
  derived ramp**, in both modes, against both surfaces.
- A new benchmark suite (`packages/core/bench/`) measuring mount/update/resize
  across types and sizes, plus ingest, zoom and allocation.

---

## Dimension 1 — Accessibility conformance

### What is genuinely good, and better than expected

The per-type **data tables** and **keyboard announcements** are the strongest
part of this library. Every one of the 39 types supplies shape-appropriate
columns (OHLC gets open/high/low/close; violin gets n + the five-number summary;
marimekko gets both dimensions; sankey indents links under their source node),
and 31 of 39 supply a bespoke announcement. `role="img"`, the `aria-live`
announcer, `aria-describedby` as a single node with a single token,
`prefers-reduced-motion`, and all three `a11y.table` modes were correct on
arrival and are now regression-locked across all 39 types.

### A-1 (HIGH, fixed) — the data table and `exportData()` served downsampled data

`buildModel` overwrote `series.points` with the LTTB result, and
`def.a11yTable` reads `model.series[].points`. So:

| | before | after |
|---|---|---|
| 60,000-point series → table rows / CSV rows | **5,000** | **60,000** |
| …then `zoomTo({x:[1000,1100]})` | **103** | **60,000** |

LTTB selects the points that best preserve a line's visible *shape*; it has no
notion of which rows matter semantically. Serving its output as "the data" hands
a screen-reader user a visual approximation with no way to know rows were
dropped — while a sighted user can zoom in and recover every point. The export
truncating silently is the same bug wearing a different hat.

**Fixed** by retaining the pre-lossy series on `NormalizedSeries.sourcePoints`
(captured before *both* the zoom window and LTTB), with the a11y table and
export reading a cheap view over it. This costs one array reference — the points
already exist at that moment in `buildModel` — and nothing at all when no series
was downsampled.

Because the drawn marks and the tabulated rows now legitimately differ, the
relationship is **stated, never silent**, in the accessible description:

> The plot draws 5,000 of 60,000 data points (a visual sample of the full
> series); the data table lists the full data.

### A-2 (HIGH, fixed) — the accessible NAME said nothing, on all 39 types

Every type generated `"<Type> chart with N series and M points."` — a category
and a count of containers. It never described the data, and for many types the
count was simply **wrong**, because `model.maxLen` is not the mark count:

| type | before | after |
|---|---|---|
| `heatmap` | "2 series and 3 points" (it has **6 cells**) | "2 rows x 3 columns (6 cells), color scale from 1 to 3" |
| `sankey` | "1 series and 5 points" | "3 nodes in 3 stages, 2 links, total flow 8" |
| `treemap` | "1 series and 2 points" (it draws **3 leaves**) | "2 top-level groups, 3 leaves, 2 levels deep, total 12" |
| `gauge` | "1 series and 1 point" | "Utilization is 72 of 0 to 100 (72% of the range)" |
| `gantt` | "…values from **1767.23B to 1768.18B**" (epoch ms!) | "2 tasks, 2026-01-01 to 2026-01-12 (11d)" |
| `ohlc` | "**Ohlc** chart" | "OHLC chart" |

**Fixed** by (a) counting marks from the type's own `keyboardNav` geometry
rather than `maxLen`, (b) adding the value range formatted with the caller's own
axis formatter, (c) suppressing the range clause for types that declare *no
value axis* (`axes: 'rows'`), and (d) a new optional `a11ySummary` definition
stage — the sanctioned per-type seam, parallel to the existing `announce` and
`a11yDescription` — implemented for the 11 types where "points" is the wrong
noun.

The conformance test asserts a deliberately high bar: strip the type name and
the "N series and M points" boilerplate from the label, and **a number must
survive**. The old label failed that on all 39 types.

### A-3 (MEDIUM, fixed) — `radar` rendered blank, with an empty table, for legal data

`radar` validated its spoke count from raw options with an index fallback (so
`data: [3,4,2,5]` with no `categories` *passes validation*), then read the spoke
count as `model.categories?.length ?? 0` — which is 0. Result: a blank chart, a
**zero-row** data table, **zero** keyboard stops, a silent announcer, and
`exportData()` returning a bare header row. The smoke test missed it because its
fixture supplies `categories`.

**Fixed** to fall back to the point count exactly as the sibling polar type
(`rose`) already did, with ordinal spoke labels.

### A-4 (MEDIUM, fixed) — `pie`/`donut`/`funnel` announced the point index, not the label

For the `{ label, y }` data shape the contract admits, `x` is `null`, so the
pipeline's default announcement read the point index:

- before: `"0: 62. Browsers, point 1 of 2."`
- after (pie): `"Chrome: 62 (74.7%). Slice 1 of 2."`
- after (funnel): `"Paid: 250, 25% of the first stage, 25% of the previous stage. Stage 2 of 3."`

The share (pie) and the conversion (funnel) are the entire reason those charts
exist and were previously reachable only in the data table.

### A-5 (MEDIUM, reported + mitigated) — `calendar` draws cells no one can reach

A calendar paints a cell for **every day in its range** but only days carrying a
datum are navigable or tabulated. A sparse year is 365 painted cells and 3
keyboard stops. The contract says "Keyboard walks days", and choropleth already
sets the precedent that undatumed features are listed as `no data`.

**Not fixed** (it needs a synthetic day series, which is a type-level redesign).
**Mitigated** by the new accessible name, which states the sparsity outright
("1 Jan 2026 to 31 Jan 2026 (31 days), 2 with data"), and **pinned by a test**
so the gap cannot widen silently.

### A-6 (LOW, reported) — `network` links are invisible to assistive tech

4 nodes and 5 links produce a 4-row table and 4 keyboard stops. This is
**contract-compliant** — the spec says `table = node, group, degree, value` and
"keyboard walks nodes by degree" — so the weakness is in the spec, not the
implementation. Mitigated: the accessible name now reports the link count, which
is otherwise unobtainable (a reader could not distinguish a tree from a clique).
**Escalated** (E-4).

### A-7 (LOW, reported) — `candlestick`/`ohlc` announce epoch milliseconds

With `x` as a numeric epoch (which the contract's own `[number | Date, o,h,l,c]`
tuple permits, and which the repo's own fixtures use), the announcement and the
table row header read `"1767.23B"`. I attempted a scoped fix and **reverted it**:
existing tests legitimately pass small integers as `x`, so "a bare number on a
time axis is an epoch" is not a safe inference. **Escalated** (E-5) — the real
fix is for a type to declare a time axis in `needs`, which is a shared-machinery
change affecting tick labels and tooltips too.

### The conformance table — all 39 types, post-fix

Generated from the live DOM. "nav stops" is the number of positions the real
keydown path reaches; the conformance suite asserts it equals the count the
type's own `keyboardNav` declares, **per series**.

| type | accessible name (generated) | table columns | rows | nav stops | announcement sample |
|---|---|---|---|---|---|
| `line` | Line chart with 1 series and 3 points, values from 1 to 3. | Category, S | 3 | 3 *(generic)* | A: 1. S, point 1 of 3. |
| `area` | Area chart with 1 series and 3 points, values from 0 to 3. | Category, S | 3 | 3 *(generic)* | A: 1. S, point 1 of 3. |
| `bar` | Bar chart with 1 series and 3 points, values from 0 to 3. | Category, S | 3 | 3 *(generic)* | A: 1. S, point 1 of 3. |
| `scatter` | Scatter chart with 1 series and 3 points, values from 2 to 6. | X, S | 3 | 3 *(generic)* | 1: 2. S, point 1 of 3. |
| `pie` | Pie chart with 1 series and 2 points, values from 2 to 3. | Slice, Value | 2 | 2 *(type)* | A: 3 (60.0%). Slice 1 of 2. |
| `donut` | Donut chart with 1 series and 2 points, values from 2 to 3. | Slice, Value | 2 | 2 *(type)* | A: 3 (60.0%). Slice 1 of 2. |
| `bubble` | Bubble chart with 1 series and 3 points, values from 2 to 6. | X, S, S r | 3 | 3 *(type)* | 1: 2, r 10. S, point 1 of 3. |
| `sparkline` | Sparkline chart with 1 series and 5 points, values from 1 to 5. | X, S | 5 | 5 *(generic)* | 0: 1. S, point 1 of 5. |
| `histogram` | Histogram chart with 1 series and 5 points, values from 1 to 9. | Bin, S | 5 | 5 *(type)* | 0 – 2: 1 sample. S, bin 1 of 5. |
| `boxplot` | Boxplot chart with 1 series and 2 points, values from 0 to 10. | Category, Min, Q1, Median, Q3, Max, Outliers | 2 | 2 *(type)* | B: min 1, q1 2, median 3, q3 4, max 5. S, point 1 of 2. |
| `candlestick` | Candlestick chart with 1 series and 2 points, values from 9 to 13. | Time, Open, High, Low, Close | 2 | 2 *(type)* | 1767.23B: Open 10, High 12, Low 9, Close 11. *(see A-7)* |
| `ohlc` | **OHLC** chart with 1 series and 2 points, values from 9 to 13. | Time, Open, High, Low, Close | 2 | 2 *(type)* | 1767.23B: Open 10, … *(see A-7)* |
| `waterfall` | Waterfall chart with 1 series and 4 points, values from -3 to 16. | Label, Delta, Running total | 4 | 4 *(type)* | Start: total 10. Point 1 of 4. |
| `heatmap` | Heatmap chart: 2 rows x 3 columns (6 cells), color scale from 1 to 3 *(type summary)* | Series, c1, c2, c3 | 2 | 3 *(type)* | c1: 1. r1, row 1 of 2, column 1 of 3. |
| `treemap` | Treemap chart: 2 top-level groups, 3 leaves, 2 levels deep, total 12 *(type summary)* | Node, Value, Share | 4 | 3 *(type)* | A / A1: 5 (41.7%). Cell 1 of 3. |
| `sunburst` | Sunburst chart: 2 top-level groups, 3 leaves, 2 levels deep, total 12 *(type summary)* | Node, Value, Share | 4 | 4 *(type)* | A: 8 (66.7%). Node 1 of 4. |
| `funnel` | Funnel chart with 1 series and 3 points, values from 12 to 100. | Stage, Value, % of first stage | 3 | 3 *(type)* | Visit: 100. Stage 1 of 3. |
| `radar` | Radar chart with 1 series and 4 points, values from 2 to 5. | Category, S | 4 | 4 *(type)* | a: 3. S, spoke 1 of 4. |
| `gauge` | Gauge chart: Utilization is 72 of 0 to 100 (72% of the range) *(type summary)* | Name, Value, Min, Max | 1 | 1 *(type)* | Utilization: 72. Range 0 to 100. |
| `rangearea` | Rangearea chart with 1 series and 3 points, values from 8 to 14. | X, Low, High | 3 | 3 *(type)* | 1: low 8, high 12. S, point 1 of 3. |
| `bullet` | Bullet chart with 1 series and 1 point, values from 0 to 100. | Label, Value, Target, Ranges | 1 | 1 *(type)* | Revenue: 68, target 80. Row 1 of 1. |
| `dumbbell` | Dumbbell chart with 1 series and 2 points, values from 3 to 8. | Category, Low, High, Delta | 2 | 2 *(type)* | A: Low 3, High 8, delta +5. S, point 1 of 2. |
| `lollipop` | Lollipop chart with 1 series and 3 points, values from 0 to 5. | Category, S | 3 | 3 *(generic)* | A: 3. S, point 1 of 3. |
| `slope` | Slope chart with 2 series and 4 points, values from 3 to 6. Series: Alpha, Beta. | Series, 2025, 2026 | 2 | 2 *(generic)* | 2025: 3. Alpha, point 1 of 2. |
| `streamgraph` | Streamgraph chart with 2 series and 6 points, values from 0 to 4. Series: A, B. | Category, A, B, Total | 3 | 3 *(generic)* | t1: 1. A, point 1 of 3. |
| `marimekko` | Marimekko chart with 2 series and 4 points, values from 2 to 5. Series: A, B. | Column, Width share, A, B | 2 | 2 *(type)* | c1: 3, 60% of the column. A. Column 35.7% of total width, 1 of 2. |
| `pyramid` | Pyramid chart with 2 series and 6 points, values from 4 to 8. Series: Male, Female. | Category, Male, Female | 3 | 3 *(type)* | 0-9: 5. Male, left arm, 1 of 3. |
| `calendar` | Calendar chart: 1 Jan 2026 to 9 Jan 2026 (9 days), 2 with data, values from 2 to 7 *(type summary)* | Date, S | 2 | 2 *(type)* | 1 Jan 2026: 2. S, day 1 of 2. |
| `radialbar` | Radialbar chart with 1 series and 3 points, values from 30 to 90. | Category, Value, % of max | 3 | 3 *(type)* | A: 30 (33.3% of 90). S, arc 1 of 3. |
| `rose` | Rose chart with 1 series and 4 points, values from 2 to 8. | Sector, Value, % of total | 4 | 4 *(type)* | N: 4. Sector 1 of 4. |
| `violin` | Violin chart with 1 series and 2 points, values from 1 to 7. | Category, n, Min, Q1, Median, Q3, Max | 2 | 2 *(type)* | A: n 7, min 1, q1 2, median 3, q3 4, max 5. |
| `parallel` | Parallel chart with 2 series and 6 points, values from 1 to 50. Series: A, B. | Series, x, y, z | 2 | 3 *(type)* | x: 1 (axis 1 to 2). A, dimension 1 of 3. |
| `icicle` | Icicle chart: 2 top-level groups, 3 leaves, 2 levels deep, total 12 *(type summary)* | Node, Value, Share | 4 | 4 *(type)* | A: 8 (66.7%). Row 1, node 1 of 4. |
| `circlepack` | Circlepack chart: 2 top-level groups, 3 leaves, 2 levels deep, total 12 *(type summary)* | Node, Value, Share | 4 | 4 *(type)* | A: 8 (66.7%). Group 1 of 4. |
| `wordcloud` | Wordcloud chart with 1 series and 3 points, values from 2 to 9. | Term, Weight, Rank | 3 | 3 *(type)* | alpha: 9. Rank 1 of 3. |
| `sankey` | Sankey chart: 3 nodes in 3 stages, 2 links, total flow 8 *(type summary)* | Node / link, Source, Target, Value | 5 | 5 *(type)* | A: 0 in, 5 out. Node 1 of 3, layer 1 of 3. |
| `gantt` | Gantt chart: 2 tasks, 2026-01-01 to 2026-01-12 (11d) *(type summary)* | Task, Group, Start, End, Duration | 2 | 2 *(type)* | Design: 2026-01-01 to 2026-01-05, 4d. Task 1 of 2. |
| `choropleth` | Choropleth chart: 2 map features, 2 shaded from data, color scale from 3 to 8 *(type summary)* | Feature, Value | 2 | 2 *(type)* | Alpha: 3. Feature 1 of 2. |
| `network` | Network chart: 2 nodes, 1 link, 2 groups (force-directed, deterministic layout) *(type summary)* | Node, Group, Degree, Value | 2 | 2 *(type)* | A: no value. g1, degree 1, node 1 of 2. |

Rows ≠ nav stops in three places, all legitimate and all understood: `heatmap`
(table is row-per-series with a cell per column; nav walks cells),
`treemap`/`parallel` (table lists interior nodes/dimensions the chart draws as
containers, nav walks the drawn marks).

---

## Dimension 2 — Palette and colorblind safety

Every result below is the actual output of the skill's validator
(`validate_palette.js`) on this machine, not a reading of the hexes.

### The base palette — passes

```
Palette (light, surface #fcfcfb, categorical): 8 slots
  [PASS] Lightness band      all 8 inside L 0.43–0.77
  [PASS] Chroma floor        all 8 >= 0.1
  [PASS] CVD separation      worst adjacent #eda100<->#1baf7a ΔE 9.1 (protan) · tritan 5.8
  [PASS] Normal-vision floor worst adjacent #e87ba4<->#eda100 ΔE 19.6
  [WARN] Contrast vs surface below 3:1: #1baf7a 2.74, #eda100 2.11, #e87ba4 2.62
  → ALL CHECKS PASS

Palette (dark, surface #1a1a19, categorical): 8 slots
  [PASS] all five checks, incl. contrast vs surface >= 3:1
  → ALL CHECKS PASS
```

The light-mode WARN is acceptable *given this library*: the validator asks for
"relief — visible labels or table view", and every chart ships an AT-readable
data table by default plus per-mark tooltips.

**P-1 (MEDIUM, escalated).** The 8-slot order is validated but
`model.ts#seriesColor` does `slots[paletteIndex % slots.length]` — it **cycles**.
Measured: series 9 and 10 render `rgb(42,120,214)` and `rgb(235,104,52)`,
identical to series 1 and 2, with nothing to distinguish them.
`ARCHITECTURE.md` §4 explicitly forbids this ("never cycle hues past slot 8
(fold to 'Other')"). Not fixed — folding to "Other" needs a legend-grouping
policy that is a design decision. **Escalated (E-1).**

### Derived palettes

**Hierarchy lightness steps** (treemap / icicle / circlepack / sunburst — children
mix toward the surface, max 0.5):

| case | verdict |
|---|---|
| slot 1 `#2a78d6` + 3 children (light) → `#4489db #5f99df #79aae4` | Monotone PASS · single hue PASS (2°) · light end 2.36:1 PASS · adjacent ΔL 0.049 (below the 0.06 discrete-step floor) |
| slot 4 `#eda100` + 3 children (light) → `#efac26 #f1b84d #f3c473` | **light end `#f3c473` at 1.58:1 — FAIL** · adjacent ΔL 0.024–0.029 |
| slot 1 dark `#3987e5` + 3 children → `#3579cc #316cb2 #2d5e99` | Monotone PASS · light end 2.63:1 PASS |

The adjacent-ΔL "failures" are the validator applying a *discrete ordinal* floor
to what is a continuous lightness family — not a real defect. The **slot-4
finding is real**: yellow-family hierarchies fade into the light surface by the
third depth level. It is bounded (only slot 4, only light mode, only depth ≥ 3)
and only fixable by changing the mix ceiling, which alters documented visual
output. **Escalated (E-2).**

**Funnel ordinal span** — the one derived ramp that is fully correct, and the
precedent the others should follow:

| case | verdict |
|---|---|
| light n=3 `#86b6ef #256abf #0d366b` | **ALL CHECKS PASS** (light end 2.06:1) |
| light n=6 | monotone/contrast/hue PASS; one adjacent ΔL 0.048 |
| dark n=3 `#184f95 #5598e7 #cde2fb` | **ALL CHECKS PASS** (2.15:1) |
| dark n=6 | **ALL CHECKS PASS** |

Funnel **reverses its span in dark mode**, which is exactly why it passes.

**P-2 (HIGH, escalated) — `heatmap`, `calendar` and `choropleth` use the raw
ramp in both modes.** All three default to `sequentialPalette` verbatim. Measured
contrast of each ramp step against each surface:

| idx | hex | vs `#fcfcfb` (light) | vs `#1a1a19` (dark) |
|---|---|---|---|
| 0 | `#cde2fb` | **1.29 FAIL** | 13.16 |
| 1 | `#b7d3f6` | **1.50 FAIL** | 11.33 |
| 2 | `#9ec5f4` | **1.74 FAIL** | 9.74 |
| 3 | `#86b6ef` | 2.06 | 8.25 |
| … | | | |
| 10 | `#184f95` | 7.89 | 2.15 |
| 11 | `#104281` | 9.66 | **1.76 FAIL** |
| 12 | `#0d366b` | 11.64 | **1.46 FAIL** |

So in **light** mode the three lowest-value steps are below the contract's own
"≥ 2:1 contrast for ordinal ramp starts", and in **dark** mode the two
highest-value cells are nearly invisible against the background. Funnel already
solved this in this codebase; three types did not inherit the solution.

I did **not** fix this, and the reason matters: the contract states *both*
"default ramp: sequentialPalette" *and* "≥ 2:1 contrast for ordinal ramp
starts", and in dark mode **those two clauses cannot both hold**. That is a
contract conflict, not an implementation bug. **Escalated (E-3).**

**Bullet grey steps** — light `#c3c2b7 → #e1e0d9`, dark `#383835 → #2c2c2a`:
adjacent ΔL 0.031 (light) / 0.016 (dark) and light-end contrast 1.29:1 / 1.24:1,
both below the validator's ordinal floors. **This is already documented and
argued in `DEVIATIONS.md` §54**, and I agree with the reasoning: the qualitative
bands must stay recessive against the measure bar and target tick (both
`textPrimary`, clearing 2:1 against every step by a wide margin). **No action.**

**Status colours — a real CVD failure:**

```
up #0ca30c / down #d03b3b / neutral, on the light surface
  [FAIL] CVD separation  worst adjacent #d03b3b<->#0ca30c ΔE 4.1 (deutan) · tritan 27.4
  [PASS] Contrast vs surface  all 3 >= 3:1
(identical result on the dark surface)
```

**P-3 (HIGH, escalated).** ΔE 4.1 under deuteranopia is below even the 6–8
"floor band the validator permits only with secondary encoding". For
`waterfall` this is harmless — direction is redundantly encoded by whether the
bar rises or falls. For **`candlestick` and `ohlc` it is not**: the contract
specifies both bodies as *filled*, so colour is the only channel distinguishing
a rising from a falling candle, on the two chart types where that distinction is
the entire point. The chroma-floor and lightness-band FAILs the validator also
reports for the grey `neutral` are artefacts of running a categorical checker
over a grey and can be ignored. **Escalated (E-6).**

**Network / sankey link colours.** Network links are `textMuted` `#898781` at
0.35 alpha → effective `#d4d3d0` on light (1.46:1) and `#41403d` on dark
(1.68:1). Below 3:1, but these are deliberately recessive hairlines that must
not compete with the nodes; the validator's WARN wording ("relief required")
is satisfied by the node labels and the data table. **No action.** Network
*group* colours and sankey *node* colours are the categorical slots verbatim,
already validated above.

### Not covered

I did not validate the `parallel`, `slope` or `wordcloud` colour usage beyond
confirming they take categorical slots in order (and so inherit P-1's cycling
issue), and I did not check alpha-composited *overlaps* (two 0.35-alpha violins
crossing), which the validator has no mode for.

---

## Dimension 3 — Performance, measured

`npm run bench -w @chartcraft/core` builds and runs
`packages/core/bench/index.ts` and prints the table below. 129 measurements,
median of N iterations after warm-up, all input seeded (no `Math.random`).

**Read these numbers correctly.** The bench runs on jsdom with a **no-op 2D
context**. It measures the work *the library* does — ingest, model, downsampling,
scales, layout, per-type geometry, draw-call issuing — and **not** rasterization.
That makes it the right instrument for finding O(n²) layouts, multi-second
layouts, per-frame allocation and ingest costs, and the **wrong** instrument for
a frame rate. DOM-node creation in jsdom is also markedly slower than in a
browser, so the a11y-table rows overstate browser cost (the *ratios* still hold).

Host: node v22.15.0, win32 x64.

### Pure hot paths and ingest

| case | size | ms | µs/unit |
|---|---|---|---|
| LTTB → 1,000 points | 10,000 | 0.237 | 0.024 |
| LTTB → 1,000 points | 100,000 | 1.44 | 0.014 |
| LTTB → 1,000 points | 1,000,000 | 10.7 | 0.011 |
| `LinearScale.scale` | 1,000,000 | 5.49 | 0.005 |
| nice ticks | 10,000 domains | 50.7 | 5.07 |
| `deepClone` `[x,y][]` | 1,000,000 | 453.6 | 0.454 |
| `deepClone` `{x,y}[]` | 1,000,000 | 522.4 | 0.522 |
| `deepClone` `number[]` | 1,000,000 | **18.7** | **0.019** |

LTTB is excellent — 10.7 ms for a million points, and *sub-linear* per point.
The ingest-clone rule documented in `util.ts` is confirmed by measurement: the
`number[]` fast path (spine only) is **24× cheaper** than the object path, which
allocates per datum. 454 ms to clone a million tuples is the real cost of the
"never mutate the caller's object" promise, and it is paid once per payload.

### Cartesian at scale (render pipeline only, a11y table off)

| case | 1,000 | 10,000 | 100,000 | 1,000,000 |
|---|---|---|---|---|
| line ds=on — mount | 10.2 ms | 18.1 ms | 73.6 ms | 1204 ms |
| line ds=on — update | 3.4 ms | 9.7 ms | 72.9 ms | 859 ms |
| line ds=on — **resize** | 2.4 ms | 3.3 ms | **2.1 ms** | **3.1 ms** |
| line ds=off — mount | 4.3 ms | 9.9 ms | 109.1 ms | 1035 ms |
| line ds=off — resize | 1.9 ms | 2.6 ms | 51.9 ms | 459 ms |
| area ds=off — mount | | | 181.4 ms | 2381 ms |
| scatter ds=on — mount | | | 71.4 ms | 949 ms |

The `resize` row is the headline: with downsampling on, a redraw at **1M points
costs 3.1 ms** and is flat across four orders of magnitude, because the retained
model is already reduced. Downsampling is doing exactly its job. With it off,
resize is linear (459 ms at 1M) — as it must be.

### Per-type layouts

| case | size | mount | update | resize |
|---|---|---|---|---|
| bar (1k categories) | 1,000 | 11.1 ms | 4.0 ms | 3.0 ms |
| bar stacked ×8 | 8,000 | 30.1 ms | 22.8 ms | 18.3 ms |
| heatmap 100×100 | 10,000 | 39.9 ms | 29.7 ms | 25.8 ms |
| heatmap 300×300 | 90,000 | 226.5 ms | 232.4 ms | 164.7 ms |
| sankey 200 nodes / 500 links | 200/500 | 47.7 ms | 41.0 ms | 3.8 ms |
| sankey 400 nodes / 1000 links | 400/1000 | 135.2 ms | 118.8 ms | 5.0 ms |
| network 500 nodes / 1500 links | 500/1500 | 22.4 ms | 18.2 ms | 12.7 ms |
| network 1000 nodes / 3000 links | 1000/3000 | 20.8 ms | 23.2 ms | 10.5 ms |
| treemap 2k leaves | 2,000 | 39.2 ms | 29.8 ms | 25.8 ms |
| circlepack 2k leaves | 2,000 | 40.2 ms | 29.4 ms | 25.3 ms |
| icicle 2k leaves | 2,000 | 30.5 ms | 23.4 ms | 23.2 ms |
| sunburst 2k leaves | 2,000 | 28.6 ms | 18.5 ms | 21.7 ms |
| **wordcloud 500 terms** | 500 | **238.5 ms** | 223.9 ms | 221.9 ms |
| **wordcloud 1500 terms** | 1,500 | **698.5 ms** | 716.2 ms | 799.7 ms |
| calendar 3 years | 1,095 | 10.8 ms | 5.9 ms | 4.2 ms |
| violin 20 × 5k samples | 100,000 | 378.1 ms | 345.6 ms | 401.6 ms |
| gantt 2k tasks | 2,000 | 37.9 ms | 17.0 ms | 6.2 ms |

Scaling is sane everywhere: heatmap 9× cells → 5.7× time (sub-linear), sankey
2× → 2.8× (crossing reduction, acceptable), treemap/icicle/circlepack all
linear. **`network` 1000 nodes is not slower than 500** — plausible for a fixed
iteration count with a quadtree, but flat enough to be worth a look (F-1, low).

**Wordcloud is the slowest layout per mark by two orders of magnitude** — 0.48
ms *per term* — and it does not benefit from resize caching (222 ms to redraw
500 terms). Spiral placement with collision checks is inherently expensive and
238 ms is not pathological for a one-off, but it is the type most likely to
feel slow. **Reported, not optimized** (F-2, low).

### Zoom, allocation, ingest

| case | measurement |
|---|---|
| `zoomTo` a 0.1% window of 1M points | **202 ms** |
| `zoomTo(null)` reset from 1M | **482 ms** |
| 200 redraws @ 100k points | **heap delta −0.1 MB (−0.4 KB/frame)** |

The allocation result **substantiates ARCHITECTURE.md's "no per-frame allocation
in the render loop"** — as close to zero as this instrument can measure.

**F-3 (MEDIUM, reported).** Every `zoomTo` re-runs `buildModel` over the full
series: **202 ms per gesture** at 1M points (down from 642 ms before the A-1 fix,
which incidentally removed a second full model build from this path). `zoomTo()`
as a programmatic call is fine; ctrl+wheel zoom is wired to the same path, so
interactive zoom at 1M points would still drop frames badly. Not fixed — the fix
is an incremental re-window from the retained `sourcePoints` rather than a full
`buildModel`, which is a pipeline change. **Escalated (E-7).**

### The accessible layer's cost

| points | mount, table off | mount, table `'hidden'` (**default**) | a11y delta | resize w/ table | `exportData` (full) |
|---|---|---|---|---|---|
| 1,000 | 5.5 ms | 140.8 ms | +135 ms | 1.5 ms | 4.4 ms |
| 10,000 | 10.6 ms | 275.9 ms | +265 ms | 2.3 ms | 24.1 ms |
| 100,000 | 88.5 ms | 653.1 ms | +565 ms | 2.5 ms | 221.8 ms |
| 1,000,000 | 935.4 ms | 5099.5 ms | **+4164 ms** | **2.6 ms** | 2806.7 ms |

Three things to read here:

1. **`resize` is now flat** (1.5–2.6 ms across four orders of magnitude). It
   previously rebuilt the entire `<table>` on every frame — a resize at 100k
   points was linear in rows. Fixed by caching the table against the data rather
   than the frame.
2. **The residual cost is the table *spec* build**, not the DOM and not the
   model: one row object with formatted string cells per datum, built eagerly on
   mount because the description needs the row count and the DOM needs the first
   rows. **Escalated (E-8)** with the concrete fix.
3. `a11y: { table: 'off' }` avoids all of it, and is honest — `exportData()`
   still works.

---

## Dimension 4 — Cross-cutting correctness

All 39 types were driven through empty series, empty data, all-null, a single
datum, negatives, NaN, ±Infinity, zeros, duplicate categories, and every series
toggled off, plus a full lifecycle sweep.

**C-1 (MEDIUM, fixed) — `npm run typecheck` was RED on arrival.**
`test/v03.hardening.test.ts:134` cast an object with no `data` to `ChartOptions`.
The stated definition of done ("typecheck green") did not hold when I received
the repo. Fixed by using `satisfies Partial<ChartOptions>` — `deepMerge` takes
`unknown` on the patch side precisely so a partial payload needs no cast.

**C-2 (HIGH, fixed) — non-finite values were not sanitized.** `NaN` and
`±Infinity` passed straight through ingest, and three separate things broke:

- **`heatmap` and `calendar` threw** — `"Cannot read properties of undefined
  (reading 'trim')"`. `(NaN - min)/(max - min)` is `NaN`, which slips through a
  `t < 0 ? … : t > 1 ? … : t` clamp untouched (every `NaN` comparison is false),
  then indexes `ramp[NaN]` → `undefined` → `parseHex(undefined)`.
- **One `Infinity` silently destroyed any cartesian chart.** `max` becomes
  `Infinity`, so every real datum collapses onto the baseline and the chart
  renders a flat line with no error.
- **`NaN` reached the canvas as a non-finite coordinate**, which Canvas2D
  silently *ignores* — the mark vanishes with no gap to show it was there — and
  reached `exportData()` as the literal string `"NaN"`.

Fixed by folding non-finite numbers to `null` at the single ingest point (`y`,
`low`, `high`), so one code path handles "no value" everywhere; plus a
defence-in-depth guard in `rampColor` and in the domain computation.

**C-3 (HIGH, fixed) — a rejected `update()` bricked the chart permanently.**
Rejecting bad data is a documented feature of half the v0.3 types (pyramid
demands exactly two series, sankey a graph payload, gantt task objects,
radar/rose/radialbar non-negatives). But `update()` overwrote `this.raw`
*before* the stage that throws, so every later call re-resolved the poisoned
options and threw again — **including `destroy()`**. One bad update killed the
chart for its whole lifetime.

Fixed by making `update()` all-or-nothing: options, model **and layout** are
computed into locals — all three can reject a payload — and the retained state
is replaced only once they all succeed. This required extracting a pure
`buildLayout(opts, theme, model)` from `computeLayout`.

**C-4 (HIGH, fixed) — a hard crash past ~125k points.**
`cmds.push(...segmentCmds(run, curve))` in `charts/curves.ts` spreads one path
command **per point** into an argument list; V8 caps that near 125k. So
`downsample: { enabled: false }` — a documented, supported option on a library
advertising 1M points — threw `RangeError: Maximum call stack size exceeded`.
The same pattern in `histogram.ts` made a histogram with >125k raw samples crash
identically. Both fixed with element-wise appends; 300k-point regression tests
added for each.

**C-5 (LOW, pinned not fixed) — three types fail silently where their peers are
loud.** Given data of the wrong shape, `candlestick`, `ohlc` and `network`
render an entirely empty chart — no marks, no table rows, a header-only CSV —
and say nothing. Their direct peers throw a diagnostic for the same mistake
(`gantt`: *"data must be objects { x: label, start, end, group? }"*; `sankey`:
*"expects its graph on the FIRST series…"*). **`network` is the sharpest case:
it is the same graph payload, narrowed by the same `isGraphData`, and only
sankey complains.** Not fixed — turning silence into a throw is a behaviour
change a caller could be relying on. Pinned by a test so it is visible in the
suite. **Escalated (E-9).**

**C-6 (MEDIUM, fixed) — decorations gated on the ROOT type, silently.** A
`trendline` on a `type: 'line'` series inside a `type: 'bar'` root was a **silent
no-op**, because gating asked `model.type`. Combo charts are a headline v0.3
feature and their decorations simply did not work. Fixed by gating on the
resolved per-series mark kind (`decoratesSeries`) — consistent with how combo
works everywhere else in the pipeline — bounded by a root allowlist so types
whose base kind coincides but whose semantics do not (`streamgraph` is `'area'`
over a meaningless baseline; `lollipop`/`waterfall` are `'bar'`) stay excluded.
Tested in all three directions.

**C-7 (MEDIUM, fixed) — raw `number[]` samples needed a cast.** `boxplot` and
`violin` are specified to take "raw `number[]`" per category, and that shape did
not typecheck: every example laundered it through `as unknown as DataValue`.
Closed the same way the sankey/network gap was closed — a named `SampleList`
member of the `DataValue` union — and dropped the casts from the fixtures.

### What passed, with evidence

- **`destroy()` leaks nothing.** Five charts → five `.chartcraft-tooltip` nodes
  in `document.body` (the one node a naive teardown leaks), five observing
  `ResizeObserver`s; after destroy, **zero** of each, zero announcers, zero
  roots.
- **Double- and triple-`destroy()`** emits `destroy` exactly once; every
  post-destroy call (`update`, `setData`, `resize`, `zoomTo`) is a no-op, and
  `exportImage()` rejects with a clear error.
- **A `ResizeObserver` notification after destroy** does nothing.
- **Type morphing** across `line → sankey → choropleth → network → pie → heatmap
  → wordcloud → gauge → bar` works, with the label, options and export correct
  at every hop.
- **Resize to 0×0** on all 39 types: no throw, layout floors at 40×40.
- **Theme switch mid-animation**, a resize storm, and repeated data swaps: clean.
- **`prefers-reduced-motion`** paints the final frame synchronously on all 39
  types, even with a 10-second animation configured.
- **Legend-toggling every series off** on all 39 types: still mounted, still
  exportable, still labelled.
- **Documented rejections are deliberate, not fragility** — pyramid's "exactly 2
  series", sankey's graph shape, gantt's task objects, radar/rose/radialbar's
  non-negatives. The sweep asserts each type *either* survives *or* rejects with
  its documented message, so a type cannot start throwing by accident.

---

## Dimension 5 — Determinism

**Fully upheld.** `Math.random` does not appear anywhere in
`packages/core/src` — only in comments asserting its absence, and in the *old*
bench (which I replaced with a seeded mulberry32 generator, since a benchmark
whose input changes run-to-run cannot support a before/after claim).

Proven, not asserted:

- **`wordcloud`, `circlepack`, `sankey` and `network` produce byte-identical
  draw logs across two SEPARATE chart instances** — every canvas call and every
  property set, serialized and compared.
- **Re-rendering the same instance reproduces the same frame** byte-for-byte.
  (This compares frames 2 and 3, not 1 and 2: the mount frame carries one extra
  `setTransform` from the initial backing-store size change.)
- **`Math.random` is spied on across a mount/resize/update/destroy cycle of all
  39 types and is never called.**

---

## Bug list

| # | Severity | Area | Status |
|---|---|---|---|
| A-1 | **High** | a11y table + `exportData()` served downsampled/windowed data | **Fixed** |
| A-2 | **High** | Accessible name uninformative and mis-counting on all 39 types | **Fixed** |
| C-2 | **High** | NaN crashes heatmap/calendar; Infinity silently destroys any cartesian chart | **Fixed** |
| C-3 | **High** | Rejected `update()` bricks the chart permanently, incl. `destroy()` | **Fixed** |
| C-4 | **High** | `RangeError` crash past ~125k points with downsampling off | **Fixed** |
| A-3 | Medium | `radar` blank + empty table/nav/export for legal data | **Fixed** |
| A-4 | Medium | pie/donut/funnel announce the point index, not the label/share | **Fixed** |
| C-1 | Medium | `npm run typecheck` red on arrival | **Fixed** |
| C-6 | Medium | Decorations silently dropped on combo series | **Fixed** |
| C-7 | Medium | Raw `number[]` samples required a cast | **Fixed** |
| A-5 | Medium | `calendar` paints day cells that are unreachable | Reported + mitigated + pinned |
| A-6 | Low | `network` links invisible to AT (contract-compliant) | Escalated → **ruled & fixed** (E-4) |
| A-7 | Low | candlestick/ohlc announce epoch ms as "1767.23B" | Escalated → **ruled & fixed** (E-5) |
| C-5 | Low | candlestick/ohlc/network silently empty on wrong-shape data | Escalated → **ruled & fixed** (E-9) |
| P-1 | Medium | Palette cycles past slot 8 (violates ARCHITECTURE §4) | Escalated → **ruled & fixed** (E-1) |
| P-2 | **High** | Sequential ramp not mode-aware in heatmap/calendar/choropleth | Escalated → **ruled & fixed** (E-3) |
| P-3 | **High** | `up`/`down` ΔE 4.1 under deuteranopia, colour-only on candlestick | Escalated → **ruled & fixed** (E-6) |
| F-1 | Low | `network` layout time flat 500→1000 nodes | Reported |
| F-2 | Low | wordcloud 0.48 ms/term, no resize caching | Reported |
| F-3 | Medium | `zoomTo` re-runs `buildModel` over the whole series: 202 ms/gesture at 1M | Escalated → **ruled & fixed** (E-7) |

*(Counting distinct defects: 13 bugs + 3 palette findings + 3 perf findings + 1
process finding.)*

---

## What I changed

**Source** — `chart.ts` (atomic `update`, `buildLayout` extraction, a11y model +
spec caching, `ariaLabel`, `samplingNote`), `model.ts` (`sourcePoints`
retention, non-finite domain guard), `data/normalize.ts` (non-finite fold),
`a11y/index.ts` (informative name generation, `A11Y_TABLE_MAX_ROWS`),
`charts/registry.ts` (`a11ySummary` stage), `charts/curves.ts` +
`charts/statistical/histogram.ts` (spread-crash fixes), `types.ts`
(`SampleList`), `features/shared.ts` + `error-bars.ts` + `trendlines.ts`
(per-series gating), and `a11ySummary`/`announce` implementations across
`heatmap`, `sankey`, `network`, `calendar`, `choropleth`, `gauge`, `gantt`, the
four hierarchy types, `pie`, `funnel` and `radar`.

**Tests** — 1148 → **1859**, all green. Two new suites
(`a11y.conformance.test.ts`, `robustness.test.ts`) and a shared fixture corpus
(`fixtures.all-types.ts`) consumed by all three 39-type suites.

**Bench** — `packages/core/bench/` rebuilt from a 40-line script into a real
suite (`harness.ts`, `dom.ts`, `data.ts`, `index.ts`, `env.d.ts`) runnable via
`npm run bench -w @chartcraft/core`.

### Existing assertions I adapted (both were themselves wrong)

1. **`test/funnel.test.ts`** asserted the *pipeline default* announcement
   (`"Mid: 500. Conversions, point 2 of 3."`). That default reads `x` — `null`
   for the `{ label, y }` shape the contract admits — and never carries the
   "% of first stage" conversion that is the reason a funnel exists and that the
   contract puts in this type's own data table. The assertion encoded the defect.
2. **`test/radar.test.ts`** asserted the same default's `"point i of n"` wording,
   which for radar named nothing (an unnamed spoke announced `"0: 3"`). Radar now
   names the spoke and counts spokes. The position/count assertions are unchanged
   in substance.

I also **reverted** one of my own fixes (A-7) when an existing candlestick test
showed my inference was unsafe — recorded above rather than quietly dropped.

### A judgement call you should overrule if you disagree

`exportData()` is **uncapped** — it returns every row, always, because an export
that silently truncates is a data-integrity bug. The **DOM table is capped at
2,000 rows** (`A11Y_TABLE_MAX_ROWS`), because materializing one `<tr>` per datum
costs ~115 µs/row: 11.5 s of synchronous main-thread work at 100k, and heap
exhaustion at 1M. The truncation is stated in **both** places a reader could
look — the table's own `<caption>` and the chart's accessible description —
each naming `exportData()` as the complete source. Your instruction was "row
counts match the input"; that holds for the export and, at 60k, would have cost
a multi-second stall in the DOM. **Escalated (E-10)** if you want the cap
removed or moved.

---

## Escalations

| # | Issue | Recommendation |
|---|---|---|
| **E-1** | Palette cycles past slot 8; series 9 = series 1 exactly. Violates `ARCHITECTURE.md` §4. | Implement the "fold to Other" policy §4 already mandates: slots ≥ 8 render in `theme.neutral` and collapse into one legend entry. Needs a legend-grouping decision, hence yours. |
| **E-2** | Hierarchy children of slot 4 (`#eda100`) reach 1.58:1 against the light surface at depth ≥ 3. | Lower `CHILD_MIX_MAX` from 0.5 to ~0.35, or clamp per-slot so the lightest child keeps 2:1. Changes documented visual output. |
| **E-3** | `heatmap`/`calendar`/`choropleth` use `sequentialPalette` verbatim in both modes: 3 steps below 2:1 in light, 2 steps below 2:1 in dark. **Two contract clauses conflict.** | Adopt the funnel precedent — a mode-aware default span (light: steps 3–12; dark: steps 10–0 reversed). Requires amending the contract's "default ramp: sequentialPalette" line, which is why I did not. |
| **E-4** | `network` links are unreachable by AT; the contract specifies node-only. | Amend the network spec to walk nodes *then their links* as sankey already does — the machinery exists and is proven. |
| **E-5** | candlestick/ohlc announce epoch ms as `1767.23B`. A scoped fix is unsafe (integers are legal `x` values). | Add `xScale: 'time'` to `ChartTypeNeeds` so a type can declare a time axis; `inferXType` honours it, and tick labels, tooltips and a11y surfaces all become coherent together. |
| **E-6** | `up`/`down` at ΔE 4.1 (deutan) is colour-only on candlestick/ohlc. | Keep the hexes; add the redundant channel the convention already provides — **hollow bodies for rising candles, filled for falling**. Fixes CVD without re-picking a documented colour. |
| **E-7** | `zoomTo` re-runs `buildModel` over the whole series: 202 ms/gesture at 1M, so wheel-zoom drops frames badly there. | Re-window incrementally from the retained `sourcePoints` instead of re-running `buildModel`; the points are already retained after A-1. |
| **E-8** | The a11y table *spec* is built eagerly and completely on mount: +4.2 s at 1M, +565 ms at 100k. | Thread an optional `limit` into the `a11yTable` definition stage so the DOM path can request the first N rows and the count, while `exportData()` requests everything. 39-type API change — too invasive to land unreviewed in an audit. |
| **E-9** | `candlestick`/`ohlc`/`network` render silently empty on wrong-shape data where their peers throw. | Make them loud, matching `sankey`/`gantt`. Behaviour change, hence yours. |
| **E-10** | DOM data table capped at 2,000 rows (export uncapped). | Confirm or set a different cap. Removing it re-introduces an 11.5 s stall at 100k and OOM at 1M. |

Nothing in `docs/**`, `api-contract.md`, `ARCHITECTURE.md` or the wrapper
packages was modified *by the audit itself*. **E-3, E-4 and E-5 require contract
edits; E-1 requires an ARCHITECTURE-conformance decision.** Those edits were made
by the rulings below (v0.3.1 and v0.3.2); no wrapper package was ever touched.

### Resolutions (v0.3.1) — ruled by the architect, implemented in core

| # | Ruling | Status |
|---|---|---|
| **E-1** | **Never silently fold a user's data.** Reuse the hue order past slot 8 (never generate a hue) and add a **composite encoding** — dash pattern for line-family marks, marker shape where markers are drawn — plus **one** `console.warn` per chart naming it and recommending "Other"/small multiples. `ARCHITECTURE.md` §4 amended to describe what we do instead of a fold we do not perform. | **Done** |
| **E-3** | **Sequential ramps are scheme-aware — a direction bug, not a hex problem.** The near-zero end may recede toward the surface; the high end never may. Light keeps low→lightest / high→darkest; dark **reverses**. Applied to `heatmap`, `calendar`, `choropleth`. Contract amended with the per-scheme direction. | **Done** — max-magnitude step now 11.64:1 (light) / **13.16:1** (dark), was 1.46:1 in dark |
| **E-6** | **Colour must not be the only channel on financial charts.** Hexes kept; `candlestick` bodies are **hollow when rising, solid when falling**. `ohlc` has no body: it already carries direction geometrically (close tick above open when rising), which is now regression-locked and stated in its a11y description. Both types announce "rising"/"falling"/"unchanged" per mark. | **Done** |
| **E-10** | **Cap accepted, but the caller's to raise.** `a11y.tableMaxRows` added (default 2,000, `Infinity` allowed), performance cost documented, truncation notice retained in both caption and description, `exportData()` still uncapped. | **Done** |
| **forced-colors** | **Make the documentation true.** Option (a) taken: `matchMedia('(forced-colors: active)')` is detected and watched for the chart's lifetime, and the theme is re-expressed in CSS system colours before painting. `ARCHITECTURE.md` §3 now describes the mechanism rather than asserting the outcome. | **Done** |

Suite after the v0.3.1 rulings: **1,859 → 1,902**, all green; typecheck clean
across all four workspaces; `npm run bench -w @chartcraft/core` unaffected. One
pre-existing assertion was adapted — `candlestick.test.ts` "bodies are filled
theme.up/theme.down", which asserted the colour-only fill that E-6 exists to
remove; it is restated as hollow-rising / solid-falling rather than dropped.

### Resolutions (v0.3.2) — the remaining six, ruled and implemented

| # | Ruling | Status |
|---|---|---|
| **E-2** | **Clamp per slot, and let depth reverse rather than fade.** `CHILD_MIX_MAX` stays 0.5 — lowering it globally would dull every hue to fix one. Each child's step is computed as before, then used verbatim if it clears **2:1** against the current surface and taken in the OPPOSITE direction (away from the surface) if it would not. Slot 4 has no headroom to lighten at all, so a yellow hierarchy now alternates by depth instead of dissolving. Applies to all four hierarchy types through the one shared builder. `DEVIATIONS.md` §100; contract dataviz rule amended. | **Done** — worst light-mode step **1.58:1 → 4.69:1**; depth 5 in both schemes, every slot, ≥ 2:1 and no two adjacent depths equal |
| **E-4** | **Links are marks; walk nodes, then that node's links.** Sankey's proven machinery reused verbatim: one reading order synthesised onto the series in `resolveOptions`, driving keyboard, `dataIndex`, hit-testing, tooltips and the table. Table is now `Node / link, Group, Degree, Source, Target, Value` with links indented under their source; links are pointer-hit-testable too, so the pointer reaches what the keyboard reaches. Contract's `network` row amended. | **Done** — 4 nodes + 5 links: was 4 rows / 4 stops, now 9 of each; every link announced by both endpoints |
| **E-5** | **Declare the axis, don't sniff the number.** `ChartTypeNeeds.xScale` gains `'time'`; `inferXType` honours it below an explicit `xAxis.type` and below genuinely categorical data. Declared by `candlestick`, `ohlc` and `gantt`; `gantt` stopped writing `xAxis.type` into the caller's options. `formatTemporal(x, xType === 'time', span)` is the single formatter the tooltip, the announcement and the tables share, and the tick labels come from the real `TimeScale`. | **Done** — `1767.23B` → `1 Jan 2026` on every surface at once |
| **E-7** | **Re-window, don't re-ingest.** `model.ts#rewindowModel` re-slices the retained `sourcePoints` and recomputes both domains through the same helpers `buildModel` uses (extracted, so they cannot drift). Falls back to a full build for a stacked model and for a band x axis, both documented. | **Done** — `zoomTo` a 0.1% window of 1M: **76.8 ms → 9.9 ms** (7.7×); reset from 1M 310.9 ms → 253.0 ms |
| **E-8** | **Additive and optional.** `a11yTable(ctx, opts?: { limit?: number })` plus `A11yTableSpec.total`; the pipeline slices whatever comes back and fills in the count, so no definition was forced to change. The DOM asks for `a11y.tableMaxRows`; `exportData()` asks for everything and is still uncapped. Adopted in the shared cartesian table, candlestick/ohlc, bubble and rangearea. Documented in `AUTHORING.md`. | **Done** — mount with the default table: **100k 643.7 → 292.1 ms**, **1M 4697.2 → 1206.8 ms** (the a11y layer's share at 1M: +3.89 s → +0.28 s) |
| **E-9** | **A blank chart with no error is the worst failure mode we ship.** `candlestick`/`ohlc` throw naming `[x, open, high, low, close]` / `{ x, o, h, l, c }`, the series and the offending entry; `network` throws sankey's own message for sankey's own payload. Empty and all-null data remain an empty chart — no data is not wrong data, which is where `gantt` draws the line too. | **Done** — the C-5 pin is inverted: it now asserts the diagnostic is present AND actionable |

Suite after the v0.3.2 rulings: **1,902 → 1,942**, all green; typecheck clean
across all four workspaces; `npm run build -w @chartcraft/core` clean.

**Five pre-existing assertions were adapted, all of them encoding a defect the
rulings exist to remove**, and none dropped:

1. `network.test.ts` — the a11y table (`Node, Group, Degree, Value`, four rows
   for four nodes and five links), its export, and the node-only keyboard walk.
   These pinned the contract-level gap E-4 closes; restated over the new
   reading order.
2. `candlestick.test.ts` / `ohlc.test.ts` — the `Time` column asserted as the
   bare number `'1'` / `'3'`. That is audit finding A-7 written down as an
   expectation; restated as "reads as a time, and is not the raw number", kept
   timezone-agnostic.
3. `robustness.test.ts` — the C-5 pin ("these types render an empty chart in
   silence where their peers throw") and the documented-rejection table it
   shares with the degenerate-data sweep. Inverted rather than deleted, so the
   suite still says something about that behaviour.

---

## Coverage I do not have

Stated plainly, so this document is not read as broader than it is:

- **No real-browser rendering was verified.** Everything is jsdom with a stubbed
  canvas. Visual correctness — that a bar's rounded corners land on the data end,
  that a tooltip does not clip the viewport, that text is legible at the sizes
  chosen — is **untested by this audit and by the suite**. A visual regression
  harness is on the roadmap and is the single biggest remaining gap.
- **No screen-reader was run.** The a11y findings are structural (DOM, ARIA,
  focus, announcement text). Whether NVDA/JAWS/VoiceOver read the tables and
  live regions *usefully* is unverified.
- **No wrapper testing.** React/Vue/Svelte were out of scope by instruction.
- **Colour validation covers the base palette and the derived ramps I could
  enumerate.** Alpha-composited *overlaps* (crossing violins, stacked
  translucent histograms) are unvalidated — the validator has no mode for it.
- **The benchmark measures library work, not pixels**, and jsdom's DOM costs
  overstate the browser's. Treat the a11y-table absolute numbers as an upper
  bound and the ratios as sound.
- **`forced-colors` mode**, which `ARCHITECTURE.md` §3 claims to respect, was
  **not implemented and not tested** — I found no `forced-colors` handling
  anywhere in `packages/core/src`. **Resolved in v0.3.1**: detection, a
  system-colour theme and a live-update listener now exist and are tested
  through a `matchMedia` stub. What is still *unverified* is the same thing
  everything else here is — that a real browser resolves `fillStyle =
  'CanvasText'` against the user's forced palette. That is documented browser
  behaviour for CSS system colours, but this suite cannot prove it; it belongs
  to the visual-regression gap above.
