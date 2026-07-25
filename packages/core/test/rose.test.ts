/**
 * rose (v0.3): Nightingale rose — equal-angle sectors whose RADIUS is
 * proportional to sqrt(value), so AREA is proportional to value. The
 * area-truth of the encoding is asserted numerically, plus start-angle
 * handling, legend policy, a11y table, renderer call log, tooltip and
 * keyboard navigation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { registerPolarChartTypes } from '../src/charts/polar';
import {
  ROSE_GAP,
  computeRoseFrame,
  computeRoseSectors,
  computeRoseSlices,
  roseRadius,
  roseSectorAngles,
  roseStartAngle,
} from '../src/charts/polar/rose';
import { lightTheme } from '../src/theme';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerPolarChartTypes();
afterEach(cleanupDom);

/** Wait past a hover/animation redraw frame (rAF or its 16ms fallback). */
const frame = () => new Promise((r) => setTimeout(r, 40));

const data = () => ({
  categories: ['N', 'E', 'S', 'W'],
  series: [{ name: 'Wind', data: [4, 1, 2, 3] }],
});

// Geometry for the 600x400 mount: plain plot {12, 12, 576, 376} -> cx 300,
// cy 200, rOuter = 376/2 - (fontSize 12 + label gap 8) = 168.
const PLOT = { x: 12, y: 12, w: 576, h: 376 };

function frameOf(raw: ChartOptions) {
  const opts = resolveOptions(raw);
  const model = buildModel(opts, new Map());
  return computeRoseFrame({
    sectors: computeRoseSectors(model, lightTheme),
    plot: PLOT,
    startAngle: roseStartAngle(opts.rose?.startAngle),
    fontSize: lightTheme.fontSize,
    si: 0,
  });
}

/** Sector area for a given sweep and radius. */
const sectorArea = (sweep: number, r: number) => 0.5 * sweep * r * r;

describe('rose — radius ∝ √value (area-true encoding)', () => {
  it('a 4x value gets exactly 2x the radius and 4x the area', () => {
    const rMax = 100;
    const r1 = roseRadius(1, 4, rMax);
    const r4 = roseRadius(4, 4, rMax);
    expect(r4).toBe(100);
    expect(r1).toBe(50);
    expect(r4 / r1).toBe(2);
    const sweep = (Math.PI * 2) / 4;
    expect(sectorArea(sweep, r4) / sectorArea(sweep, r1)).toBeCloseTo(4, 12);
  });

  it('radius follows sqrt exactly across the scale (never linear)', () => {
    expect(roseRadius(2, 4, 100)).toBeCloseTo(70.71067811865476, 12); // 100*sqrt(0.5)
    expect(roseRadius(3, 4, 100)).toBeCloseTo(86.60254037844386, 12); // 100*sqrt(0.75)
    expect(roseRadius(1, 100, 100)).toBe(10); // sqrt(1/100) = 0.1 — NOT 1
    // Equal-value areas per unit: area/value is constant.
    const sweep = (Math.PI * 2) / 8;
    const perValue = [1, 2, 4, 8].map((v) => sectorArea(sweep, roseRadius(v, 8, 100)) / v);
    for (const p of perValue) expect(p).toBeCloseTo(perValue[0]!, 12);
  });

  it('clamps degenerate inputs to a zero radius', () => {
    expect(roseRadius(0, 4, 100)).toBe(0);
    expect(roseRadius(-3, 4, 100)).toBe(0);
    expect(roseRadius(2, 0, 100)).toBe(0);
    expect(roseRadius(9, 4, 100)).toBe(100); // clamped at the max radius
  });
});

describe('rose — equal-angle sectors & start angle', () => {
  it('gives every category an identical angular slot', () => {
    const start = roseStartAngle(0);
    const angles = [0, 1, 2, 3].map((i) => roseSectorAngles(i, 4, start));
    expect(angles[0]).toEqual([-Math.PI / 2, -Math.PI / 2 + Math.PI / 2]);
    expect(angles[1]![0]).toBeCloseTo(0, 12);
    expect(angles[2]![0]).toBeCloseTo(Math.PI / 2, 12);
    expect(angles[3]![1]).toBeCloseTo((3 * Math.PI) / 2, 12);
    for (const [a0, a1] of angles) expect(a1 - a0).toBeCloseTo(Math.PI / 2, 12);
    expect(roseSectorAngles(1, 5, start)[1]! - roseSectorAngles(1, 5, start)[0]!).toBeCloseTo((Math.PI * 2) / 5, 12);
  });

  it('rose.startAngle is degrees clockwise from 12 o\'clock (default 0)', () => {
    expect(roseStartAngle()).toBeCloseTo(-Math.PI / 2, 12);
    expect(roseStartAngle(90)).toBeCloseTo(0, 12);
    expect(roseStartAngle(180)).toBeCloseTo(Math.PI / 2, 12);
    expect(roseStartAngle(-90)).toBeCloseTo(-Math.PI, 12);
    const f = frameOf({ type: 'rose', data: data(), rose: { startAngle: 90 } });
    expect(f.sectors[0]!.a0).toBeCloseTo(0, 12);
    expect(f.sectors[0]!.a1).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('rose — frame & sector identity', () => {
  it('computes exact radii for the mounted plot', () => {
    const f = frameOf({ type: 'rose', data: data() });
    expect(f.cx).toBe(300);
    expect(f.cy).toBe(200);
    expect(f.rOuter).toBe(168);
    expect(f.maxValue).toBe(4);
    expect(f.sectors.map((s) => s.r)).toEqual([
      168,
      84,
      168 * Math.SQRT1_2,
      168 * Math.sqrt(0.75),
    ]);
    // The sqrt encoding is visible in the slices handed to the pipeline.
    expect(computeRoseSlices(f).map((s) => s.r1)).toEqual(f.sectors.map((s) => s.r));
    expect(computeRoseSlices(f).every((s) => s.r0 === 0)).toBe(true);
  });

  it('sectors take categorical slots in order and keep zero-value slots', () => {
    const opts = resolveOptions({ type: 'rose', data: { categories: ['a', 'b', 'c'], series: [{ name: 'S', data: [5, 0, null] }] } });
    const sectors = computeRoseSectors(buildModel(opts, new Map()), lightTheme);
    expect(sectors.map((s) => [s.label, s.value, s.color])).toEqual([
      ['a', 5, '#2a78d6'],
      ['b', 0, '#eb6834'],
      ['c', 0, '#1baf7a'],
    ]);
  });
});

describe('rose — validation', () => {
  it('rejects negative values, naming the series and index', () => {
    expect(() =>
      mount({ type: 'rose', data: { categories: ['A', 'B'], series: [{ name: 'Neg', data: [1, -1] }] } }),
    ).toThrow(/>= 0.*"Neg".*index 1/);
  });

  it('rejects a non-finite startAngle', () => {
    expect(() => mount({ type: 'rose', data: data(), rose: { startAngle: Number.NaN } })).toThrow(/startAngle/);
  });
});

describe('rose — rendering smoke (call log)', () => {
  it('draws sqrt-radius sectors with 2px surface gaps and perimeter labels', () => {
    const { el } = mount({ type: 'rose', data: data() });
    const ctx = ctxOf(el);
    const arcs = ctx.__calls.filter((c) => c.method === 'arc');
    // Sector radii come straight from the sqrt encoding.
    expect(arcs.some((c) => c.args[2] === 168)).toBe(true);
    expect(arcs.some((c) => c.args[2] === 84)).toBe(true);
    // 2px surface-colored gap between sectors.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#fcfcfb')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === ROSE_GAP)).toBe(true);
    // Palette slots in order.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#eda100')).toBe(true);
    // Sector labels around the perimeter, in textMuted.
    expect(paintedText(el)).toEqual(expect.arrayContaining(['N', 'E', 'S', 'W']));
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });
});

describe('rose — legend policy (sectors, non-toggleable)', () => {
  it('lists sectors and keys auto visibility off the sector count', () => {
    const { el } = mount({ type: 'rose', data: data() });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['N', 'E', 'S', 'W']);
    expect(items.every((i) => i.disabled)).toBe(true);
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('flex');
  });

  it('hides the legend for a single sector', () => {
    const { el } = mount({ type: 'rose', data: { categories: ['Solo'], series: [{ name: 'S', data: [3] }] } });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});

describe('rose — a11y table', () => {
  it('lists sector, value and share of the total', () => {
    const { el } = mount({ type: 'rose', data: data() });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Sector', 'Value', '% of total']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['N', '4', '40%'],
      ['E', '1', '10%'],
      ['S', '2', '20%'],
      ['W', '3', '30%'],
    ]);
  });
});

describe('rose — tooltip & keyboard', () => {
  it('tooltip shows the sector label and value', () => {
    const { el } = mount({ type: 'rose', data: data() });
    pointerMove(el, 300 + 42.426, 200 - 42.426); // inside sector 0 (mid-angle)
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('N');
    expect(tip.innerHTML).toContain('4');
  });

  it('a pointer beyond a short sector\'s radius does not hit it', () => {
    const { el } = mount({ type: 'rose', data: data() });
    // Sector 1 (value 1) has radius 84; probe at 120px along its mid-angle.
    pointerMove(el, 300 + 120 * Math.cos(Math.PI / 4), 200 + 120 * Math.sin(Math.PI / 4));
    expect((document.querySelector('.chartcraft-tooltip') as HTMLElement).style.display).toBe('none');
  });

  it('arrows walk sectors clockwise and announce the sector position', () => {
    const { el, chart } = mount({ type: 'rose', data: data() });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    expect(enters.map((e) => [e.seriesName, e.dataIndex])).toEqual([
      ['Wind', 0],
      ['Wind', 1],
    ]);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('E: 1');
    expect(region.textContent).toContain('Sector 2 of 4');
    expect(canvasOf(el).tabIndex).toBe(0);
  });
});

describe('rose — pipeline integration (animation, resize, theming)', () => {
  it('animates, themes from the dark palette and tears down cleanly', async () => {
    const { el, chart } = mount({ type: 'rose', data: data(), theme: 'dark', animation: { duration: 20 } });
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#1a1a19')).toBe(true);
    chart.update({ title: 'Wind rose' });
    await frame();
    // Dark palette slot 1 for the sectors, dark surface for the 2px gaps.
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#3987e5')).toBe(true);
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#1a1a19')).toBe(true);
    expect(paintedText(el)).toContain('Wind rose');
    chart.resize();
    chart.destroy();
    expect(el.querySelector('canvas')).toBeNull();
  });

  it('re-lays out sectors when rose.startAngle changes', () => {
    const { el, chart } = mount({ type: 'rose', data: data() });
    chart.update({ rose: { startAngle: 45 } });
    const arcs = ctxOf(el).__calls.filter((c) => c.method === 'arc');
    expect(arcs.some((c) => Math.abs((c.args[3] as number) - -Math.PI / 4) < 1e-9)).toBe(true);
  });
});
