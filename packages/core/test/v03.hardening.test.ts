/**
 * v0.3 shared-layer hardening.
 *
 * One suite per seam that replaced a per-type workaround:
 *
 *  1. option INGEST never shares (nor mutates) the caller's objects;
 *  2. the `resolveLegend` stage (measured legend decisions);
 *  3. the `extendValueDomain` stage (definition-side value-domain widening);
 *  4. per-axis chrome + the `'rows'` axis arrangement + `valueAxisOf`;
 *  5. the four `Decorator` seams (a11y table, tooltip points, a11y
 *     description, `ctx.host`) and the export-isolation property they must keep;
 *  6. `'rangearea'` as a real `SeriesKind`;
 *  7. the choropleth unmatched-data policy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDecorators,
  createChart,
  registerDecorator,
  type ChartOptions,
  type Decorator,
  type DecoratorContext,
  type GeoFeatureCollection,
  type SeriesData,
} from '../src/index';
import { registerBuiltinChartTypes } from '../src/charts';
import { registerBuiltinDecorators } from '../src/features';
import { registerIntervalChartTypes } from '../src/charts/interval';
import { registerCompositionChartTypes } from '../src/charts/composition';
import { registerDistributionChartTypes } from '../src/charts/distribution';
import { registerFlowChartTypes } from '../src/charts/flow';
import { registerGeoChartTypes } from '../src/charts/geo';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import {
  axisArrangement,
  categoryAxisOf,
  hasAxisChrome,
  resolveAxisChrome,
  valueAxisOf,
  getChartType,
} from '../src/charts/registry';
import { deepClone, deepMerge } from '../src/util';
import { boxplotValueDomain } from '../src/charts/statistical/boxplot';
import { waterfallValueDomain } from '../src/charts/statistical/waterfall';
import {
  choroplethUnmatchedPolicy,
  describeUnmatchedRows,
  resetChoroplethWarnings,
  unmatchedRowsMessage,
} from '../src/charts/geo/choropleth';
import { resolveOptions } from '../src/model';
import { canvasOf, cleanupDom, ctxOf, markerCenters, mount, paintedText, pointerMove } from './helpers';
import { computeCartesianLayout } from '../src/layout';
import { buildModel } from '../src/model';
import { lightTheme } from '../src/theme';

registerBuiltinChartTypes();
registerIntervalChartTypes();
registerCompositionChartTypes();
registerDistributionChartTypes();
registerFlowChartTypes();
registerGeoChartTypes();
registerStatisticalChartTypes();

afterEach(() => {
  clearDecorators();
  cleanupDom();
  resetChoroplethWarnings();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Ingest never mutates (nor shares) the caller's options

describe('option ingest: the chart never mutates the object you pass', () => {
  const callerOptions = (): ChartOptions => ({
    type: 'line',
    animation: false,
    width: 600,
    height: 400,
    theme: 'light',
    data: {
      categories: ['A', 'B', 'C'],
      series: [
        { name: 'Alpha', data: [1, 2, 3] },
        { name: 'Beta', data: [{ x: 'A', y: 4 }, { x: 'B', y: 5 }, { x: 'C', y: 6 }] },
      ],
    },
  });

  function legendItem(el: HTMLElement, i: number): HTMLElement {
    const items = el.querySelectorAll('.chartcraft-legend-item');
    const item = items[i];
    if (!item) throw new Error(`no legend item ${i}`);
    return item as HTMLElement;
  }

  // The one deliberate exemption to the clone-on-ingest rule. A world atlas is
  // megabytes of nested coordinate arrays that nothing in the pipeline writes
  // to, and the projection cache keys on its identity — cloning it would double
  // the memory and walk every coordinate on each mount to guard a mutation that
  // cannot happen. Kept honest by a test so it stays a decision, not a leak.
  it('carries choropleth.geojson by reference instead of deep-cloning a topology', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature',
          properties: { name: 'Alpha' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
        },
      ],
    };
    const merged = deepMerge({} as ChartOptions, { type: 'choropleth', choropleth: { geojson } } as ChartOptions);
    expect(merged.choropleth!.geojson).toBe(geojson);
    expect(deepClone({ geojson }).geojson).toBe(geojson);

    // ...and it survives the full ingest path, so the parse cache stays warm.
    const el = document.createElement('div');
    document.body.appendChild(el);
    const chart = createChart(el, {
      type: 'choropleth',
      animation: false,
      choropleth: { geojson },
      data: { series: [{ name: 'S', data: [{ x: 'Alpha', y: 3 }] }] },
    });
    expect(chart.getOptions().choropleth!.geojson).toBe(geojson);
    chart.destroy();
  });

  it('still clones the sibling keys of an exempt one (the exemption is not contagious)', () => {
    const ramp = ['#cde2fb', '#2a78d6'];
    const geojson = { type: 'FeatureCollection' as const, features: [] };
    // A PATCH, not a whole ChartOptions — `deepMerge` takes `unknown` on the
    // patch side precisely so a partial payload needs no cast. (The previous
    // `as ChartOptions` cast on an object with no `data` was a compile error:
    // `npm run typecheck` shipped red because of this line.)
    const merged = deepMerge({} as ChartOptions, {
      type: 'choropleth',
      choropleth: { geojson, ramp },
    } satisfies Partial<ChartOptions>);
    expect(merged.choropleth!.geojson).toBe(geojson);
    expect(merged.choropleth!.ramp).not.toBe(ramp);
    expect(merged.choropleth!.ramp).toEqual(ramp);
  });

  it('a legend toggle leaves the caller options byte-identical', () => {
    const options = callerOptions();
    const before = structuredClone(options);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const chart = createChart(el, options);
    legendItem(el, 0).click();
    // The toggle really happened...
    expect(chart.getOptions().data.series[0]?.visible).toBe(false);
    // ...and the caller's object is untouched, field for field.
    expect(structuredClone(options)).toEqual(before);
    expect(options.data.series[0]?.visible).toBeUndefined();
  });

  it('setData and update leave the caller objects byte-identical', () => {
    const options = callerOptions();
    const optionsBefore = structuredClone(options);
    const { chart, el } = mount(options);

    const nextData = {
      categories: ['X', 'Y'],
      series: [{ name: 'Alpha', data: [7, 8] }, { name: 'Beta', data: [9, 10] }],
    };
    const nextDataBefore = structuredClone(nextData);
    chart.setData(nextData);
    legendItem(el, 0).click();
    expect(structuredClone(nextData)).toEqual(nextDataBefore);

    const patch: Partial<ChartOptions> = { title: 'T', xAxis: { label: 'x' } };
    const patchBefore = structuredClone(patch);
    chart.update(patch);
    legendItem(el, 0).click();
    expect(structuredClone(patch)).toEqual(patchBefore);
    expect(structuredClone(options)).toEqual(optionsBefore);
  });

  it('retained options share NO array or plain object with the caller', () => {
    const options = callerOptions();
    const { chart } = mount(options);
    const held = chart.getOptions();
    expect(held.data).not.toBe(options.data);
    expect(held.data.series).not.toBe(options.data.series);
    expect(held.data.series[0]).not.toBe(options.data.series[0]);
    expect(held.data.series[0]?.data).not.toBe(options.data.series[0]?.data);
    expect(held.data.categories).not.toBe(options.data.categories);
  });

  it('deepClone keeps functions, Dates and typed arrays by reference', () => {
    const fn = (v: number | Date | string): string => String(v);
    const date = new Date(2020, 0, 1);
    const typed = new Float64Array([1, 2, 3]);
    const src = { xAxis: { ticks: { format: fn } }, when: date, buf: typed, nested: { a: [1, 2] } };
    const out = deepClone(src);
    expect(out).not.toBe(src);
    expect(out.xAxis).not.toBe(src.xAxis);
    expect(out.xAxis.ticks.format).toBe(fn);
    expect(out.when).toBe(date);
    expect(out.buf).toBe(typed);
    expect(out.nested.a).not.toBe(src.nested.a);
    expect(out.nested.a).toEqual([1, 2]);
  });

  it('deepClone copies an array of primitives by spine only (no per-element work)', () => {
    // A 100k-point `number[]` costs ONE array copy, not 100k allocations: the
    // elements are carried by reference because they are not plain objects.
    const big = Array.from({ length: 100_000 }, (_, i) => i);
    const out = deepClone(big);
    expect(out).not.toBe(big);
    expect(out).toHaveLength(100_000);
    expect(out[99_999]).toBe(99_999);
  });

  it('deepMerge deep-clones patch values but reuses untouched base branches', () => {
    const base = deepMerge({} as Record<string, unknown>, { keep: { deep: [1] }, drop: 1 });
    const keep = base['keep'];
    const patch = { drop: 2, added: { list: [{ a: 1 }] } };
    const merged = deepMerge(base, patch) as Record<string, unknown>;
    // Untouched branch: reused (no needless copy on every update()).
    expect(merged['keep']).toBe(keep);
    // Patch branch: cloned, so the caller's patch cannot be aliased.
    expect(merged['added']).not.toBe(patch.added);
    expect((merged['added'] as { list: unknown[] }).list).not.toBe(patch.added.list);
    expect(merged['drop']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveLegend

describe('the resolveLegend stage', () => {
  const slopeData = (names: string[]) => ({
    categories: ['2010', '2020'],
    series: names.map((name, i) => ({ name, data: [i + 1, i + 5] })),
  });

  it('slope hides the legend when the measured end labels fit', () => {
    const { chart } = mount({ type: 'slope', data: slopeData(['A', 'B']) });
    expect((chart.getOptions().legend as { show: boolean; auto: boolean }).show).toBe(false);
    // The names ARE painted directly instead.
    expect((chart.getOptions().legend as { show: boolean; auto: boolean }).auto).toBe(true);
  });

  it('slope shows the legend when the labels do not fit (same data, tiny plot)', () => {
    const { chart } = mount({
      type: 'slope',
      width: 80,
      height: 60,
      data: slopeData(['A very long series name indeed', 'Another very long series name']),
    });
    expect((chart.getOptions().legend as { show: boolean; auto: boolean }).show).toBe(true);
  });

  it('never overrides an explicit legend choice', () => {
    const shown = mount({ type: 'slope', legend: true, data: slopeData(['A', 'B']) });
    expect((shown.chart.getOptions().legend as { show: boolean }).show).toBe(true);
    expect((shown.chart.getOptions().legend as { auto: boolean }).auto).toBe(false);
    const hidden = mount({
      type: 'slope',
      legend: { show: false },
      width: 80,
      height: 60,
      data: slopeData(['A very long series name indeed', 'Another very long series name']),
    });
    expect((hidden.chart.getOptions().legend as { show: boolean }).show).toBe(false);
  });

  it('is a pipeline stage: layout() no longer mutates the resolved options', () => {
    const def = getChartType('slope');
    expect(typeof def.resolveLegend).toBe('function');
    // `layout()` is pure with respect to `opts`: running it by hand leaves the
    // resolved legend exactly as `resolveOptions` left it (the old code flipped
    // `opts.legend.show` from inside `layout`, keyed on a module-level WeakMap).
    const opts = resolveOptions({ type: 'slope', data: slopeData(['A', 'B']) } as ChartOptions);
    const model = buildModel(opts, new Map());
    const measure = (t: string): number => t.length * 6;
    const layout = computeCartesianLayout({
      width: 600,
      height: 400,
      topExtra: 0,
      opts,
      model,
      theme: lightTheme,
      measure,
      axisChrome: { x: true, y: true },
      arrangement: 'value-y',
    });
    const before = { ...opts.legend };
    const geom = def.layout({ opts, theme: lightTheme, model, layout, measure });
    expect(opts.legend).toEqual(before);
    // The decision is available from the stage instead.
    expect(def.resolveLegend?.({ opts, theme: lightTheme, model, layout, geom })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. extendValueDomain

describe('the extendValueDomain stage', () => {
  it('bullet asks for an EXACT 0..max domain and no longer writes xAxis', () => {
    const def = getChartType('bullet');
    const opts = resolveOptions({
      type: 'bullet',
      data: { series: [{ name: 'R', data: [{ x: 'A', y: 60, target: 80 }] }] },
      bullet: { ranges: [40, 70, 100] },
    });
    expect(def.extendValueDomain?.({} as never, opts)).toEqual({ domain: [0, 100], exact: true });
    expect(opts.xAxis.min).toBeUndefined();
    expect(opts.xAxis.max).toBeUndefined();
  });

  it('boxplot and waterfall return niced tuples, and null when there is nothing to widen', () => {
    expect(waterfallValueDomain({ series: [{ name: 'W', data: [{ x: 'a', y: 100 }, { x: 'b', y: -30 }] }] })).toEqual([
      0, 100,
    ]);
    expect(boxplotValueDomain({ series: [{ name: 'B', data: [[1, 2, 3, 4, 100] as never] }] })).not.toBeNull();
    expect(boxplotValueDomain({ series: [{ name: 'B', data: [null] }] })).toBeNull();
  });

  it('unions with the data extent and never narrows it', () => {
    const def = getChartType('boxplot');
    // A sample reaching 100 widens the domain; the drawn outlier is inside the
    // plot, which is what the widening is for.
    const { el } = mount({
      type: 'boxplot',
      data: { categories: ['A'], series: [{ name: 'One', data: [[1, 2, 3, 4, 5, 100] as never] }] },
    });
    const labels = paintedText(el).filter((t) => /^\d/.test(t));
    expect(Number(labels[labels.length - 1])).toBeGreaterThanOrEqual(100);
    expect(typeof def.extendValueDomain).toBe('function');
  });

  it('exact: true suppresses nice() widening (bullet range fills the row)', () => {
    const { el } = mount({
      type: 'bullet',
      data: { series: [{ name: 'R', data: [{ x: 'A', y: 60 }] }] },
      bullet: { ranges: [37] },
    });
    // 37 is not a nice number; with `exact` the axis still ends there, so the
    // widest grey rect reaches the plot's right edge.
    const rects = ctxOf(el)
      .__calls.filter((c) => c.method === 'fillRect')
      // Skip the surface clear (0, 0, width, height).
      .filter((c) => !(c.args[0] === 0 && c.args[1] === 0));
    const right = Math.max(...rects.map((c) => (c.args[0] as number) + (c.args[2] as number)));
    expect(right).toBeCloseTo(588, 0);
  });

  it('three types stopped writing axis min/max from resolveOptions', () => {
    const cases: ChartOptions[] = [
      { type: 'bullet', data: { series: [{ name: 'R', data: [{ x: 'A', y: 1 }] }] } },
      { type: 'boxplot', data: { categories: ['A'], series: [{ name: 'B', data: [[1, 2, 3]] }] } },
      { type: 'waterfall', data: { series: [{ name: 'W', data: [{ x: 'a', y: 10 }] }] } },
      { type: 'violin', data: { categories: ['A'], series: [{ name: 'V', data: [[1, 2, 3] as never] }] } },
    ];
    for (const c of cases) {
      const o = resolveOptions(c);
      expect([o.xAxis.min, o.xAxis.max, o.yAxis.min, o.yAxis.max]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Per-axis chrome, the 'rows' arrangement, valueAxisOf

describe('per-axis chrome', () => {
  it('resolveAxisChrome understands the boolean shorthand and the per-axis object', () => {
    expect(resolveAxisChrome({ cartesianAxes: true })).toEqual({ x: true, y: true });
    expect(resolveAxisChrome({ cartesianAxes: true, axisChrome: false })).toEqual({ x: false, y: false });
    expect(resolveAxisChrome({ cartesianAxes: true, axisChrome: { y: false } })).toEqual({ x: true, y: false });
    expect(resolveAxisChrome({ cartesianAxes: true, axisChrome: { x: false } })).toEqual({ x: false, y: true });
    // A non-cartesian type has no pipeline chrome at all.
    expect(resolveAxisChrome({ cartesianAxes: false })).toEqual({ x: false, y: false });
    expect(hasAxisChrome({ x: false, y: true })).toBe(true);
    expect(hasAxisChrome({ x: false, y: false })).toBe(false);
  });

  it('streamgraph declares { x: true, y: false } instead of clearing yTicks', () => {
    expect(resolveAxisChrome(getChartType('streamgraph').needs)).toEqual({ x: true, y: false });
    // The value axis really is gone from the frame: no y tick labels, no y
    // gridlines, no left axis line — and nothing had to clear `layout.yTicks`.
    const { el } = mount({
      type: 'streamgraph',
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }, { name: 'T', data: [2, 1] }] },
    });
    expect(paintedText(el)).toEqual(['A', 'B']);
    const strokes = ctxOf(el).__props.filter((pr) => pr.prop === 'strokeStyle').map((pr) => pr.value);
    expect(strokes).toEqual([lightTheme.axisLine]);
  });

  it('a switched-off axis releases its margin (and only its own)', () => {
    const opts = resolveOptions({
      type: 'line',
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1_000_000, 2_000_000] }] },
      xAxis: { label: 'X' },
    });
    const model = buildModel(opts, new Map());
    const layoutWith = (axisChrome: { x: boolean; y: boolean }) =>
      computeCartesianLayout({
        width: 600,
        height: 400,
        topExtra: 0,
        opts,
        model,
        theme: lightTheme,
        measure: (t: string) => t.length * 6,
        axisChrome,
        arrangement: 'value-y',
      });
    const both = layoutWith({ x: true, y: true });
    const noValue = layoutWith({ x: true, y: false });
    const noData = layoutWith({ x: false, y: true });
    // y off -> the left margin is released; the bottom strip is untouched.
    expect(noValue.plot.x).toBe(12);
    expect(both.plot.x).toBeGreaterThan(noValue.plot.x);
    expect(noValue.plot.h).toBe(both.plot.h);
    expect(noValue.yTicks).toEqual([]);
    expect(noValue.xTicks.length).toBeGreaterThan(0);
    // x off -> the bottom strip is released; the left margin is untouched.
    expect(noData.plot.x).toBe(both.plot.x);
    expect(noData.plot.h).toBeGreaterThan(both.plot.h);
    expect(noData.xTicks).toEqual([]);
    expect(noData.yTicks.length).toBeGreaterThan(0);
  });
});

describe("the 'rows' axis arrangement (band on y + continuous data axis on x)", () => {
  const tasks = {
    series: [
      {
        name: 'Plan',
        data: [
          { x: 'T1', start: new Date(2024, 0, 1), end: new Date(2024, 0, 11) },
          { x: 'T2', start: new Date(2024, 0, 6), end: new Date(2024, 0, 16) },
        ],
      },
    ],
  };

  it('gantt declares it, with x-only chrome', () => {
    const needs = getChartType('gantt').needs;
    expect(needs.axes).toBe('rows');
    expect(resolveAxisChrome(needs)).toEqual({ x: true, y: false });
  });

  it('gantt no longer hand-rolls the time axis: the pipeline draws it', () => {
    // Exactly ONE axis line (the time axis), in `theme.axisLine`, drawn by the
    // pipeline — the definition contributes no axis chrome of its own.
    const { el } = mount({ type: 'gantt', data: tasks });
    const strokes = ctxOf(el).__props.filter((p) => p.prop === 'strokeStyle').map((p) => p.value);
    expect(strokes.filter((c) => c === lightTheme.axisLine)).toHaveLength(1);
  });

  it('gantt still gets calendar-aligned time ticks and x gridlines', () => {
    const { el } = mount({ type: 'gantt', data: tasks });
    const texts = paintedText(el);
    // Time tick labels (drawn by the pipeline, AFTER the marks).
    expect(texts.some((t) => /^Jan \d+$/.test(t))).toBe(true);
    // Gridlines run along the TIME axis by default (gantt sets xAxis.grid).
    const strokes = ctxOf(el).__props.filter((p) => p.prop === 'strokeStyle').map((p) => p.value);
    expect(strokes).toContain('#e1e0d9'); // lightTheme.gridline
  });

  it('axisArrangement derives from `horizontal` when a type does not declare it', () => {
    expect(axisArrangement({ cartesianAxes: true }, false)).toBe('value-y');
    expect(axisArrangement({ cartesianAxes: true }, true)).toBe('value-x');
    expect(axisArrangement({ cartesianAxes: true, axes: 'rows' }, true)).toBe('rows');
  });
});

describe('valueAxisOf / categoryAxisOf replace the model.horizontal guess', () => {
  const opts = resolveOptions({
    type: 'line',
    data: { series: [{ name: 'S', data: [1] }] },
    xAxis: { label: 'X' },
    yAxis: { label: 'Y' },
  });

  it('maps the two axis roles per arrangement', () => {
    expect(valueAxisOf({ cartesianAxes: true }, opts, false).label).toBe('Y');
    expect(categoryAxisOf({ cartesianAxes: true }, opts, false).label).toBe('X');
    expect(valueAxisOf({ cartesianAxes: true }, opts, true).label).toBe('X');
    expect(categoryAxisOf({ cartesianAxes: true }, opts, true).label).toBe('Y');
    // A mirrored, non-cartesian type declares the arrangement explicitly.
    expect(valueAxisOf({ cartesianAxes: false, axes: 'value-x' }, opts, false).label).toBe('X');
    expect(categoryAxisOf({ cartesianAxes: false, axes: 'value-x' }, opts, false).label).toBe('Y');
  });

  it('pyramid gets its category header from yAxis and its values from xAxis', () => {
    expect(getChartType('pyramid').needs.axes).toBe('value-x');
    const { el } = mount({
      type: 'pyramid',
      data: {
        categories: ['0-9', '10-19'],
        series: [
          { name: 'M', data: [5, 7] },
          { name: 'F', data: [6, 8] },
        ],
      },
      yAxis: { ticks: { format: (v) => `age ${String(v)}` } },
      xAxis: { ticks: { format: (v) => `${String(v)} k` } },
    });
    const texts = paintedText(el);
    expect(texts).toContain('age 0-9');
    expect(texts.some((t) => t.endsWith(' k'))).toBe(true);
  });

  it("violin declares bandIndex: 'position' instead of overriding its tooltip header", () => {
    expect(getChartType('violin').needs.bandIndex).toBe('position');
    // The PIPELINE resolves the category positionally now, so the tooltip header
    // names the right band with no per-type post-processing — and it goes through
    // the category axis formatter, which is what proves the pipeline built it.
    const { el } = mount({
      type: 'violin',
      data: {
        categories: ['first', 'second'],
        series: [{ name: 'V', data: [[1, 2, 3, 4] as never, [5, 6, 7, 8] as never] }],
      },
      xAxis: { ticks: { format: (v) => `cat:${String(v)}` } },
    });
    pointerMove(el, 440, 200);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.innerHTML).toContain('cat:second');
  });
});

// ---------------------------------------------------------------------------
// 5. The four Decorator seams

describe('Decorator.a11yTable — the table and exportData can never disagree', () => {
  const withBars: ChartOptions = {
    type: 'line',
    animation: false,
    width: 600,
    height: 400,
    theme: 'light',
    a11y: { table: 'visible' },
    data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20], errorBars: { value: 2 } }] },
  };

  beforeEach(() => {
    clearDecorators();
    registerBuiltinDecorators();
  });

  it('the ± columns reach BOTH the DOM table and exportData (CSV and JSON)', () => {
    const { el, chart } = mount(withBars);
    const headers = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
    expect(chart.exportData().split('\n')[0]).toBe('Category,S,S ± low,S ± high');
    const json = JSON.parse(chart.exportData({ format: 'json' })) as { columns: string[] };
    expect(json.columns).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
  });

  it('applies transforms in decorator order and can be opted out of', () => {
    const seen: string[] = [];
    const tag = (id: string, order: number): Decorator => ({
      id,
      layer: 'over',
      order,
      draw: () => {},
      a11yTable: (_ctx, spec) => {
        seen.push(id);
        return { ...spec, columns: [...spec.columns, id] };
      },
    });
    clearDecorators();
    registerDecorator(tag('second', 20));
    registerDecorator(tag('first', 10));
    registerDecorator({ id: 'skipped', layer: 'over', draw: () => {}, appliesTo: () => false, a11yTable: (_c, s) => s });
    const { chart } = mount({ ...withBars, data: { categories: ['A'], series: [{ name: 'S', data: [1] }] } });
    expect(chart.exportData().split('\n')[0]).toBe('Category,S,first,second');
    // Ascending `order`, and the opted-out decorator never ran. (The hook runs
    // once per table build: the DOM table on mount, then again for this export.)
    expect(seen.slice(0, 2)).toEqual(['first', 'second']);
    expect(seen).not.toContain('skipped');
  });

  it('error-bars no longer patches the built table DOM', () => {
    // The old code appended <th>/<td> to the BUILT table and stamped it with a
    // `data-cc-errorbars` marker. The spec transform leaves no such marker.
    const { el } = mount(withBars);
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect(table.dataset['ccErrorBars']).toBeUndefined();
    expect(table.querySelectorAll('thead th')).toHaveLength(4);
  });
});

describe('Decorator.tooltipPoints — no wrapping of the caller formatter', () => {
  beforeEach(() => {
    clearDecorators();
    registerBuiltinDecorators();
  });

  const opts = (format?: (pts: { formattedY: string }[]) => string): ChartOptions =>
    ({
      type: 'line',
      animation: false,
      width: 600,
      height: 400,
      theme: 'light',
      tooltip: format ? { format } : true,
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20], errorBars: { value: 2 } }] },
    }) as ChartOptions;

  it('the interval reaches the caller formatter, which is NOT replaced', () => {
    const format = vi.fn((pts: { formattedY: string }[]) => `[${pts[0]?.formattedY ?? ''}]`);
    const { chart, el } = mount(opts(format as never));
    const m = markerCenters(el)[0];
    pointerMove(el, m?.x ?? 0, m?.y ?? 0);
    expect(format).toHaveBeenCalled();
    expect(format.mock.calls[0]?.[0]?.[0]?.formattedY).toMatch(/\(8–12\)/);
    // getOptions still reports the caller's own function, not a wrapper.
    expect(chart.getOptions().tooltip).toMatchObject({ format });
  });

  it('leaves tooltip.format undefined when the caller passed none', () => {
    const { chart, el } = mount(opts());
    const m = markerCenters(el)[0];
    pointerMove(el, m?.x ?? 0, m?.y ?? 0);
    expect((chart.getOptions().tooltip as { format?: unknown }).format).toBeUndefined();
    const tip = document.querySelector('.chartcraft-tooltip');
    expect(tip?.innerHTML ?? '').toMatch(/\(8–12\)/);
  });
});

describe('a11yDescription — one node, one aria-describedby token', () => {
  beforeEach(() => {
    clearDecorators();
    registerBuiltinDecorators();
  });

  it('concatenates the caller text, the type stage and every decorator', () => {
    registerDecorator({
      id: 'test:desc',
      layer: 'over',
      order: 999,
      draw: () => {},
      a11yDescription: () => 'Decorator says hi.',
    });
    const { el } = mount({
      type: 'line',
      a11y: { description: 'Caller text.' },
      annotations: [{ kind: 'line', axis: 'y', value: 15 }],
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20] }] },
    });
    const canvas = canvasOf(el);
    const ids = (canvas.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids).toHaveLength(1);
    const text = el.querySelector(`#${ids[0]}`)?.textContent ?? '';
    expect(text.startsWith('Caller text.')).toBe(true);
    expect(text).toContain('reference line at y 15');
    expect(text.endsWith('Decorator says hi.')).toBe(true);
  });

  it('annotations keep no private hidden node', () => {
    const { el } = mount({
      type: 'line',
      annotations: [{ kind: 'line', axis: 'y', value: 15 }],
      data: { categories: ['A'], series: [{ name: 'S', data: [10] }] },
    });
    expect(el.querySelector('.chartcraft-annotations-desc')).toBeNull();
  });
});

describe('DecoratorContext.host — and the export-isolation property it must keep', () => {
  it('draw sees the live host on screen and NULL on the export renderer', async () => {
    const hosts: (DecoratorContext['host'] | undefined)[] = [];
    clearDecorators();
    registerDecorator({
      id: 'test:host',
      layer: 'over',
      draw: (ctx) => {
        hosts.push(ctx.host);
      },
    });
    const { chart, el } = mount({ type: 'line', data: { categories: ['A'], series: [{ name: 'S', data: [1] }] } });
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts[0]).not.toBeNull();
    expect(hosts[0]?.canvas).toBe(canvasOf(el));
    const before = hosts.length;
    await chart.exportImage();
    // The export pass ran, and it could not reach the live DOM.
    expect(hosts.length).toBeGreaterThan(before);
    expect(hosts[hosts.length - 1]).toBeNull();
  });

  it('the host identity is stable, so decorators can key per-chart state on it', () => {
    const seen = new Set<unknown>();
    clearDecorators();
    registerDecorator({
      id: 'test:host-stable',
      layer: 'over',
      draw: (ctx) => {
        if (ctx.host) seen.add(ctx.host);
      },
      attach: (host) => {
        seen.add(host);
      },
    });
    const { chart } = mount({ type: 'line', data: { categories: ['A'], series: [{ name: 'S', data: [1] }] } });
    chart.update({ title: 'again' });
    expect(seen.size).toBe(1);
  });

  it('an export never mutates the live a11y DOM (the ± columns stay as painted)', async () => {
    clearDecorators();
    registerBuiltinDecorators();
    const { chart, el } = mount({
      type: 'line',
      a11y: { table: 'visible' },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20], errorBars: { value: 2 } }] },
    });
    const before = el.querySelector('.chartcraft-a11y-table')?.innerHTML;
    await chart.exportImage();
    expect(el.querySelector('.chartcraft-a11y-table')?.innerHTML).toBe(before);
  });

  it('a decorator with no attach() still gets a host in draw', () => {
    // The old mechanism required `attach` to bind the host under the live
    // renderer, so a draw-only decorator could never reach it.
    let host: DecoratorContext['host'] | undefined;
    clearDecorators();
    registerDecorator({
      id: 'test:draw-only',
      layer: 'over',
      draw: (ctx) => {
        host = ctx.host;
      },
    });
    const { el } = mount({ type: 'line', data: { categories: ['A'], series: [{ name: 'S', data: [1] }] } });
    expect(host?.root).toBe(el.querySelector('.chartcraft'));
  });
});

// ---------------------------------------------------------------------------
// 6. 'rangearea' as a real SeriesKind

describe("'rangearea' is a legal per-series combo override", () => {
  const forecast: ChartOptions = {
    type: 'line',
    animation: false,
    width: 600,
    height: 400,
    theme: 'light',
    data: {
      series: [
        {
          name: 'CI',
          // A band on a LINE root — the per-series override the contract wanted.
          type: 'rangearea',
          data: [
            { x: 1, low: 8, high: 12 },
            { x: 2, low: 9, high: 14 },
          ],
        },
        { name: 'Actual', data: [[1, 10], [2, 11]] as [number, number][] },
      ],
    },
  };

  it('paints the band beneath the line on a line root', () => {
    const { el } = mount(forecast);
    const ctx = ctxOf(el);
    // The band fill uses the contract's 0.18 alpha.
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === 0.18)).toBe(true);
    const alphaAt = ctx.__props.findIndex((p) => p.prop === 'globalAlpha' && p.value === 0.18);
    const fills = ctx.__calls.map((c, i) => ({ c, i })).filter((e) => e.c.method === 'fill');
    expect(fills.length).toBeGreaterThan(0);
    expect(alphaAt).toBeGreaterThan(-1);
  });

  it('the band joins the value domain and the a11y table gets low/high columns', () => {
    const { chart } = mount(forecast);
    expect(chart.exportData().split('\n')[0]).toBe('X,CI,Actual');
  });

  it('the rangearea root decides band-ness from the data (needs.rangeFromData)', () => {
    expect(getChartType('rangearea').needs.rangeFromData).toBe(true);
    const { chart } = mount({
      type: 'rangearea',
      data: {
        series: [
          { name: 'Band', data: [[1, 8, 12], [2, 9, 14]] as [number, number, number][] },
          { name: 'Line', data: [[1, 10], [2, 11]] as [number, number][] },
        ],
      },
    });
    expect(chart.exportData().split('\n')[0]).toBe('X,Band low,Band high,Line');
  });

  it("an explicit per-series type beats the data (type: 'line' on band data)", () => {
    const { chart } = mount({
      type: 'rangearea',
      data: { series: [{ name: 'Band', type: 'line', data: [{ x: 1, low: 8, high: 12 }] }] },
    });
    // Rendered as a line, so the a11y table has ONE value column, not two.
    expect(chart.exportData().split('\n')[0]).toBe('X,Band');
  });

  it('rangearea reuses the shared kind dispatch: band FIRST, marks on top', () => {
    // KIND_Z_ORDER puts 'rangearea' before every other kind, so the band's
    // 0.18-alpha fill is set before the 2px line stroke that sits on it.
    const { el } = mount(forecast);
    const props = ctxOf(el).__props;
    const bandAlpha = props.findIndex((p) => p.prop === 'globalAlpha' && p.value === 0.18);
    const lineWidth = props.findIndex((p) => p.prop === 'lineWidth' && p.value === 2);
    expect(bandAlpha).toBeGreaterThan(-1);
    expect(lineWidth).toBeGreaterThan(bandAlpha);
  });
});

// ---------------------------------------------------------------------------
// 7. Choropleth unmatched-data policy

describe('choropleth unmatched-data policy', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Alpha' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
      },
    ],
  } as unknown as GeoFeatureCollection;

  const withRows = (unmatched?: 'warn' | 'strict' | 'omit'): ChartOptions =>
    ({
      type: 'choropleth',
      animation: false,
      width: 600,
      height: 400,
      theme: 'light',
      data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 1 }, { x: 'Atlantis', y: 2 }] }] },
      choropleth: { geojson, projection: 'equirectangular', ...(unmatched ? { unmatched } : {}) },
    }) as ChartOptions;

  it("defaults to 'warn': the map draws, and the diagnostic is loud", () => {
    expect(choroplethUnmatchedPolicy(undefined)).toBe('warn');
    expect(choroplethUnmatchedPolicy({})).toBe('warn');
    expect(choroplethUnmatchedPolicy({ unmatched: 'strict' })).toBe('strict');
    expect(choroplethUnmatchedPolicy({ unmatched: 'omit' })).toBe('omit');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mount(withRows())).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("'Atlantis'");
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ unmatched: ['Atlantis'], featureKey: 'name' });
  });

  it("'warn' surfaces the rows in the accessible description and keeps them in the table", () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { el, chart } = mount({ ...withRows(), a11y: { table: 'visible' } } as ChartOptions);
    const id = canvasOf(el).getAttribute('aria-describedby');
    expect(id).not.toBeNull();
    expect(el.querySelector(`#${id}`)?.textContent).toContain('could not be placed on the map: Atlantis');
    // No datum is lost: the row is still in the table and in exportData.
    expect(chart.exportData()).toContain('Atlantis,2');
  });

  it("'strict' throws with the same message the warning uses", () => {
    expect(() => mount(withRows('strict'))).toThrow(/'Atlantis'/);
    expect(unmatchedRowsMessage(['Atlantis'], 'name', 1)).toContain("1 row(s) with no matching feature: 'Atlantis'");
  });

  it("'omit' is silent: no warning, no description", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { el } = mount(withRows('omit'));
    expect(warn).not.toHaveBeenCalled();
    expect(canvasOf(el).getAttribute('aria-describedby')).toBeNull();
  });

  it('warns once per distinct diagnostic, not once per frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { chart } = mount(withRows());
    chart.update({ title: 'again' });
    chart.resize();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('describeUnmatchedRows is pure, plural-aware and elides long lists', () => {
    expect(describeUnmatchedRows([])).toBeNull();
    expect(describeUnmatchedRows(['A'])).toContain('1 data row');
    expect(describeUnmatchedRows(['A', 'B'])).toContain('2 data rows');
    const many = describeUnmatchedRows(['a', 'b', 'c', 'd', 'e', 'f', 'g']) ?? '';
    expect(many).toContain('and 2 more');
  });
});

// ---------------------------------------------------------------------------
// Public surface

describe('public surface gaps closed', () => {
  it('sankey / network data typechecks without a cast', () => {
    const data: SeriesData = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      links: [{ source: 'a', target: 'b', value: 4 }],
    };
    expect(() => mount({ type: 'sankey', data: { series: [{ name: 'Flow', data }] } })).not.toThrow();
    expect(() => mount({ type: 'network', data: { series: [{ name: 'Net', data }] } })).not.toThrow();
  });

  it("SeriesKind admits 'rangearea' and is exported", () => {
    const kinds: import('../src/index').SeriesKind[] = ['line', 'bar', 'area', 'scatter', 'rangearea'];
    expect(kinds).toHaveLength(5);
  });
});
