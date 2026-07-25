/**
 * parallel (v0.3): one vertical axis per dimension, each INDEPENDENTLY scaled
 * and labeled top and bottom. Per-axis scaling and polyline coordinates are
 * asserted numerically, plus label-collision handling, legend policy, a11y
 * table, renderer call log, tooltip and keyboard navigation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDistributionChartTypes } from '../src/charts/distribution';
import {
  PARALLEL_HOVER_WIDTH,
  PARALLEL_LINE_ALPHA,
  PARALLEL_VERTEX_RADIUS,
  computeParallelFrame,
  ellipsize,
  nearestPolyline,
  parallelAxisAtX,
  parallelAxisX,
  parallelDimensionNames,
  parallelDimensions,
  parallelExtent,
  parallelLabelLayout,
  parallelValueToY,
  parallelYToValue,
} from '../src/charts/distribution/parallel';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerDistributionChartTypes();
afterEach(cleanupDom);

const frame = () => new Promise((r) => setTimeout(r, 40));

// 600x400 mount -> plain plot {12, 12, 576, 376}. 3 dimensions -> slot 192,
// axes at x 108 / 300 / 492; one label row -> axisTop 44, axisBottom 372
// (span 328). Independent extents: Speed 10..20, Power 50..100, Range 5..8 —
// so series C (15 / 75 / 6.5) is the midpoint of EVERY axis: y 208 three times.
const PLOT = { x: 12, y: 12, w: 576, h: 376 };
const measure6 = (s: string) => s.length * 6; // matches the test canvas stub

const data = () => ({
  categories: ['Speed', 'Power', 'Range'],
  series: [
    { name: 'A', data: [10, 100, 5] },
    { name: 'B', data: [20, 50, 8] },
    { name: 'C', data: [15, 75, 6.5] },
  ],
});

function frameOf(raw: ChartOptions) {
  const opts = resolveOptions(raw);
  const model = buildModel(opts, new Map());
  return computeParallelFrame({
    dims: parallelDimensions(model, opts.parallel?.axes),
    plot: PLOT,
    fontSize: 12,
    measure: measure6,
  });
}

describe('parallel — axis placement & independent scaling', () => {
  it('spreads axes over equal slots', () => {
    expect(parallelAxisX(0, 3, PLOT)).toBe(108);
    expect(parallelAxisX(1, 3, PLOT)).toBe(300);
    expect(parallelAxisX(2, 3, PLOT)).toBe(492);
    expect(parallelAxisX(0, 1, PLOT)).toBe(300); // a single axis centers
    expect(parallelAxisX(0, 2, PLOT)).toBe(156);
    expect(parallelAxisX(1, 2, PLOT)).toBe(444);
  });

  it('each dimension gets its OWN extent (no shared domain, no nice())', () => {
    expect(parallelExtent([10, 20, 15])).toEqual([10, 20]);
    expect(parallelExtent([50, 100, 75])).toEqual([50, 100]);
    expect(parallelExtent([5, 8, 6.5])).toEqual([5, 8]);
    expect(parallelExtent([7, null, 7])).toEqual([6.5, 7.5]); // degenerate widening
    expect(parallelExtent([null])).toEqual([0, 1]);
    const dims = parallelDimensions(buildModel(resolveOptions({ type: 'parallel', data: data() }), new Map()), undefined);
    expect(dims).toEqual([
      { name: 'Speed', min: 10, max: 20 },
      { name: 'Power', min: 50, max: 100 },
      { name: 'Range', min: 5, max: 8 },
    ]);
  });

  it('maps values with the max at the top and inverts exactly', () => {
    expect(parallelValueToY(20, 10, 20, 44, 372)).toBe(44);
    expect(parallelValueToY(10, 10, 20, 44, 372)).toBe(372);
    expect(parallelValueToY(15, 10, 20, 44, 372)).toBe(208);
    // Same pixel row, completely different values — that IS the form.
    expect(parallelValueToY(75, 50, 100, 44, 372)).toBe(208);
    expect(parallelValueToY(6.5, 5, 8, 44, 372)).toBe(208);
    expect(parallelYToValue(208, 50, 100, 44, 372)).toBeCloseTo(75, 12);
    expect(parallelYToValue(44, 5, 8, 44, 372)).toBeCloseTo(8, 12);
    expect(parallelValueToY(3, 3, 3, 44, 372)).toBe(208); // degenerate axis
  });

  it('names come from parallel.axes, else categories, else the 1-based index', () => {
    expect(parallelDimensionNames(['X', 'Y'], ['a', 'b'], 2)).toEqual(['X', 'Y']);
    expect(parallelDimensionNames(undefined, ['a', 'b'], 2)).toEqual(['a', 'b']);
    expect(parallelDimensionNames(undefined, null, 3)).toEqual(['1', '2', '3']);
    const f = frameOf({ type: 'parallel', data: data(), parallel: { axes: ['P', 'Q', 'R'] } });
    expect(f.dims.map((d) => d.name)).toEqual(['P', 'Q', 'R']);
  });
});

describe('parallel — frame geometry (exact)', () => {
  it('reserves label rows above and below the axes', () => {
    const f = frameOf({ type: 'parallel', data: data() });
    expect(f.slotW).toBe(192);
    expect(f.labelRows).toBe(1);
    expect(f.labelStrategy).toBe('fit');
    expect(f.axisTop).toBe(44); // plot.y + 2 rows of (12 + 4)
    expect(f.axisBottom).toBe(372); // plot bottom - 1 row
    expect(f.nameRowY).toEqual([12]);
    expect(f.maxLabelY).toBe(28);
    expect(f.minLabelY).toBe(376);
    expect(f.dims.map((d) => [d.x, d.min, d.max])).toEqual([
      [108, 10, 20],
      [300, 50, 100],
      [492, 5, 8],
    ]);
  });

  it('exposes the axis-brushing seam (dimension under a pointer x)', () => {
    const f = frameOf({ type: 'parallel', data: data() });
    expect(parallelAxisAtX(f, 108)).toBe(0);
    expect(parallelAxisAtX(f, 306)).toBe(1); // within tolerance
    expect(parallelAxisAtX(f, 492)).toBe(2);
    expect(parallelAxisAtX(f, 200)).toBe(-1); // between axes
  });
});

describe('parallel — axis label collision handling', () => {
  it('paints names verbatim when they fit their slot', () => {
    const layout = parallelLabelLayout(['Speed', 'Power', 'Range'], 192, measure6);
    expect(layout.strategy).toBe('fit');
    expect(layout.rows).toBe(1);
    expect(layout.labels.map((l) => [l.text, l.row])).toEqual([
      ['Speed', 0],
      ['Power', 0],
      ['Range', 0],
    ]);
  });

  it('staggers over two rows when names need up to two slots', () => {
    const names = ['Fuel efficiency (mpg)', 'Horsepower rating', 'Curb weight (kg)'];
    const layout = parallelLabelLayout(names, 96, measure6); // 92px avail, 188px staggered
    expect(layout.strategy).toBe('stagger');
    expect(layout.rows).toBe(2);
    expect(layout.labels.map((l) => l.row)).toEqual([0, 1, 0]);
    expect(layout.labels.map((l) => l.text)).toEqual(names); // never truncated
    // A staggered layout reserves one more label row above the axes (a 288px
    // plot gives the same 96px slots).
    const f = computeParallelFrame({
      dims: names.map((name) => ({ name, min: 0, max: 1 })),
      plot: { x: 12, y: 12, w: 288, h: 376 },
      fontSize: 12,
      measure: measure6,
    });
    expect(f.slotW).toBe(96);
    expect(f.labelRows).toBe(2);
    expect(f.axisTop).toBe(60); // 3 rows of 16
    expect(f.nameRowY).toEqual([12, 28]);
    expect(f.maxLabelY).toBe(44);
  });

  it('ellipsizes to the slot width when even staggering cannot fit', () => {
    const long = 'A dimension name far too long for any slot in this plot';
    const layout = parallelLabelLayout([long, 'Short', long], 60, measure6);
    expect(layout.strategy).toBe('ellipsize');
    expect(layout.rows).toBe(1);
    // 56px available at 6px/char -> 8 chars of text + the ellipsis (54px).
    expect(layout.labels[0]!.text).toBe('A dimens…');
    expect(measure6(layout.labels[0]!.text)).toBe(54);
    expect(measure6(layout.labels[0]!.text)).toBeLessThanOrEqual(56);
    expect(layout.labels[1]!.text).toBe('Short'); // already fits
    expect(ellipsize('abcdef', 60, measure6)).toBe('abcdef');
    expect(ellipsize('abcdef', 24, measure6)).toBe('abc…');
    expect(ellipsize('abcdef', 3, measure6)).toBe('');
  });
});

describe('parallel — polyline hit-testing', () => {
  it('nearestPolyline hits a segment and focuses its closer endpoint', () => {
    const pos = [[
      { x: 108, y: 372, y0: 372 },
      { x: 300, y: 44, y0: 372 },
    ]];
    expect(nearestPolyline(pos, 156, 290)).toEqual({ si: 0, pi: 0 }); // 25% along
    expect(nearestPolyline(pos, 252, 126)).toEqual({ si: 0, pi: 1 }); // 75% along
    expect(nearestPolyline(pos, 156, 320)).toBeNull(); // 30px off the line
    expect(nearestPolyline([[{ x: 1, y: 1, y0: 1 }, null]], 1, 1)).toBeNull();
  });
});

describe('parallel — rendering smoke (call log)', () => {
  it('draws hairline axes, 0.7-alpha polylines and per-axis extremes', () => {
    const { el } = mount({ type: 'parallel', data: data() });
    const ctx = ctxOf(el);
    // Axis lines in axisLine color from axisTop to axisBottom.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#c3c2b7')).toBe(true);
    const pts = ctx.__calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    expect(pts.some((c) => c.method === 'moveTo' && c.args[0] === 108 && c.args[1] === 44)).toBe(true);
    expect(pts.some((c) => c.method === 'lineTo' && c.args[0] === 108 && c.args[1] === 372)).toBe(true);
    // Polylines at 0.7 alpha in the series colors.
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === PARALLEL_LINE_ALPHA)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#1baf7a')).toBe(true);
    // Names + each axis's own max (top) and min (bottom).
    const texts = paintedText(el);
    expect(texts).toEqual(expect.arrayContaining(['Speed', 'Power', 'Range', '20', '10', '100', '50', '8', '5']));
    // Text in ink colors: secondary for names, muted for the extremes.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#52514e')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
    // No 2px strokes at rest — 2px is reserved for hover/focus.
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === PARALLEL_HOVER_WIDTH)).toBe(false);
  });

  it('polyline vertices prove per-axis independent scaling', () => {
    const { el } = mount({ type: 'parallel', data: data() });
    const pts = ctxOf(el).__calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    const at = (x: number, y: number) => pts.some((c) => c.args[0] === x && c.args[1] === y);
    // A: min / max / min -> bottom, top, bottom.
    expect(at(108, 372)).toBe(true);
    expect(at(300, 44)).toBe(true);
    expect(at(492, 372)).toBe(true);
    // B: max / min / max.
    expect(at(108, 44)).toBe(true);
    expect(at(300, 372)).toBe(true);
    expect(at(492, 44)).toBe(true);
    // C sits at the midpoint of all three DIFFERENT scales: 15, 75 and 6.5.
    expect(at(108, 208)).toBe(true);
    expect(at(300, 208)).toBe(true);
    expect(at(492, 208)).toBe(true);
  });

  it('a null dimension breaks the polyline instead of inventing a value', () => {
    const { el } = mount({
      type: 'parallel',
      data: { categories: ['Speed', 'Power', 'Range'], series: [{ name: 'Gap', data: [10, null, 5] }] },
    });
    const moves = ctxOf(el).__calls.filter((c) => c.method === 'moveTo');
    // Both surviving vertices start their own sub-path (axis extents collapse
    // to a degenerate ±0.5 window, so both land mid-axis at y 208).
    expect(moves.filter((c) => c.args[0] === 108 && c.args[1] === 208)).toHaveLength(1);
    expect(moves.filter((c) => c.args[0] === 492 && c.args[1] === 208)).toHaveLength(1);
  });

  it('hover emphasises the focused line at 2px and marks the vertex', async () => {
    const { el } = mount({ type: 'parallel', data: data() });
    pointerMove(el, 108, 372); // series A on the first axis
    await frame();
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === PARALLEL_HOVER_WIDTH)).toBe(true);
    expect(
      ctx.__calls.some(
        (c) => c.method === 'arc' && c.args[2] === PARALLEL_VERTEX_RADIUS && c.args[0] === 108 && c.args[1] === 372,
      ),
    ).toBe(true);
  });
});

describe('parallel — legend policy', () => {
  it('series items, toggleable, auto-shown from 2 series', () => {
    const { el, chart } = mount({ type: 'parallel', data: data() });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['A', 'B', 'C']);
    expect(items.every((i) => i.disabled)).toBe(false);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[2]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'C', visible: false });
    // Hiding C re-derives the extents from the remaining lines only.
    const opts = resolveOptions({
      type: 'parallel',
      data: { categories: ['Speed'], series: [{ name: 'A', data: [10] }, { name: 'B', visible: false, data: [20] }] },
    });
    expect(parallelDimensions(buildModel(opts, new Map()), undefined)).toEqual([{ name: 'Speed', min: 9.5, max: 10.5 }]);
  });

  it('a single line hides the legend', () => {
    const { el } = mount({
      type: 'parallel',
      data: { categories: ['a', 'b'], series: [{ name: 'Solo', data: [1, 2] }] },
    });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});

describe('parallel — a11y table (series rows x dimension columns)', () => {
  it('lists one row per line with a cell per dimension', () => {
    const { el } = mount({ type: 'parallel', data: data() });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Series', 'Speed', 'Power', 'Range']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['A', '10', '100', '5'],
      ['B', '20', '50', '8'],
      ['C', '15', '75', '6.5'],
    ]);
  });

  it('uses parallel.axes for the column names', () => {
    const { el } = mount({ type: 'parallel', data: data(), parallel: { axes: ['P', 'Q', 'R'] } });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Series', 'P', 'Q', 'R']);
  });
});

describe('parallel — tooltip & keyboard', () => {
  it('tooltip names the dimension and the value', () => {
    const { el } = mount({ type: 'parallel', data: data() });
    pointerMove(el, 300, 208); // series C on the Power axis
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Power');
    expect(tip.innerHTML).toContain('C');
    expect(tip.innerHTML).toContain('75');
  });

  it('arrows walk dimensions then series, announcing the axis range', () => {
    const { el, chart } = mount({ type: 'parallel', data: data() });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    key(el, 'ArrowDown');
    expect(enters.map((e) => [e.seriesName, e.dataIndex])).toEqual([
      ['A', 0],
      ['A', 1],
      ['B', 1],
    ]);
    expect(enters[0]!.clientX).toBe(-1);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('Power: 50');
    expect(region.textContent).toContain('axis 50 to 100');
    expect(region.textContent).toContain('dimension 2 of 3');
    expect(canvasOf(el).tabIndex).toBe(0);
  });
});

describe('parallel — pipeline integration (animation, resize, theming)', () => {
  it('animates, resizes and re-themes with no per-type plumbing', async () => {
    const { el, chart } = mount({ type: 'parallel', data: data(), theme: 'dark', animation: { duration: 20 } });
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#1a1a19')).toBe(true);
    await frame();
    // Dark axisLine + dark palette slot 1.
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#383835')).toBe(true);
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#3987e5')).toBe(true);
    chart.resize();
    chart.update({ parallel: { axes: ['P', 'Q', 'R'] } });
    await frame();
    expect(paintedText(el)).toEqual(expect.arrayContaining(['P', 'Q', 'R']));
    chart.destroy();
    expect(el.querySelector('canvas')).toBeNull();
  });
});
