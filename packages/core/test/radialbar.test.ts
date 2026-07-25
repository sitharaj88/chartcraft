/**
 * radialbar (v0.3): concentric arc tracks from `radialbar.innerRadius`
 * outward. Geometry is asserted numerically (band fit at 1..10 tracks, exact
 * radii/angles), plus legend policy, a11y table, renderer call log, tooltip
 * and keyboard navigation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPolarChartTypes } from '../src/charts/polar';
import {
  RADIALBAR_MIN_THICKNESS,
  RADIALBAR_START_ANGLE,
  RADIALBAR_TRACK_GAP,
  computeRadialBarFrame,
  computeRadialBarTracks,
  radialBarBands,
  radialBarDataMax,
  radialBarLabelStride,
} from '../src/charts/polar/radialbar';
import { lightTheme } from '../src/theme';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerPolarChartTypes();
afterEach(cleanupDom);

/** Wait past a hover-redraw frame (rAF or its 16ms setTimeout fallback). */
const frame = () => new Promise((r) => setTimeout(r, 40));

// Fresh data per mount: legend toggling mutates series.visible in place.
const data = () => ({
  categories: ['A', 'B', 'C', 'D'],
  series: [{ name: 'Traffic', data: [4, 3, 2, 1] }],
});

const twoSeries = () => ({
  categories: ['A', 'B'],
  series: [
    { name: 'S1', data: [10, 20] },
    { name: 'S2', data: [5, 15] },
  ],
});

// Geometry for the 600x400 mount: plain plot {12, 12, 576, 376} -> cx 300,
// cy 200, rOuter = 376/2 - 2 = 186, rInner = 0.3 * 186 = 55.8 (band 130.2).
// 4 tracks with the desired 4px gap -> thickness (130.2 - 12) / 4 = 29.55.
const PLOT = { x: 12, y: 12, w: 576, h: 376 };

function modelFor(raw: ChartOptions) {
  const opts = resolveOptions(raw);
  return { opts, model: buildModel(opts, new Map()) };
}

describe('radialbar — track band fitting (exact, 1..10 tracks)', () => {
  it('fills [r0, r1] exactly at every track count and never overlaps', () => {
    for (let n = 1; n <= 10; n++) {
      const fit = radialBarBands(n, 30, 130);
      expect(fit.bands).toHaveLength(n);
      // Outermost starts at r1, innermost ends at r0 — the band is filled.
      expect(fit.bands[0]!.rOuter).toBe(130);
      expect(fit.bands[n - 1]!.rInner).toBeCloseTo(30, 12);
      // n * thickness + (n - 1) * gap === total, exactly.
      expect(n * fit.thickness + (n - 1) * fit.gap).toBeCloseTo(100, 12);
      expect(fit.thickness).toBeGreaterThanOrEqual(RADIALBAR_MIN_THICKNESS);
      for (let i = 0; i < n; i++) {
        const b = fit.bands[i]!;
        expect(b.rOuter - b.rInner).toBeCloseTo(fit.thickness, 12);
        if (i > 0) {
          // Adjacent tracks are separated by exactly `gap` (never negative).
          expect(fit.bands[i - 1]!.rInner - b.rOuter).toBeCloseTo(fit.gap, 12);
        }
      }
    }
  });

  it('uses the desired 4px gap while thickness allows it', () => {
    const two = radialBarBands(2, 30, 130);
    expect(two.gap).toBe(RADIALBAR_TRACK_GAP);
    expect(two.thickness).toBe(48); // (100 - 4) / 2
    expect(two.bands).toEqual([
      { rInner: 82, rOuter: 130 },
      { rInner: 30, rOuter: 78 },
    ]);
    const five = radialBarBands(5, 30, 130);
    expect(five.gap).toBe(4);
    expect(five.thickness).toBeCloseTo(16.8, 12); // (100 - 16) / 5
  });

  it('gives up the gap (down to 0) before letting arcs get thinner than 2px', () => {
    const exact = radialBarBands(10, 0, 20); // 10 * 2px = the whole band
    expect(exact.gap).toBe(0);
    expect(exact.thickness).toBe(2);
    const tight = radialBarBands(10, 0, 10); // cannot even give 2px each
    expect(tight.gap).toBe(0);
    expect(tight.thickness).toBe(1);
    // Still no overlap: consecutive bands touch, never cross.
    for (let i = 1; i < 10; i++) {
      expect(tight.bands[i - 1]!.rInner).toBeCloseTo(tight.bands[i]!.rOuter, 12);
    }
    expect(radialBarBands(0, 30, 130).bands).toEqual([]);
  });

  it('label stride keeps direct labels selective when spacing is tight', () => {
    expect(radialBarLabelStride(33.55, 12)).toBe(1); // one line of text fits
    expect(radialBarLabelStride(14, 12)).toBe(1);
    expect(radialBarLabelStride(7, 12)).toBe(2);
    expect(radialBarLabelStride(6.71, 12)).toBe(3);
    expect(radialBarLabelStride(0, 12)).toBe(1);
  });
});

describe('radialbar — frame geometry (exact radii & angles)', () => {
  const frameOf = (raw: ChartOptions = { type: 'radialbar', data: data() }) => {
    const { opts, model } = modelFor(raw);
    return computeRadialBarFrame({
      tracks: computeRadialBarTracks(model, lightTheme),
      plot: PLOT,
      innerRadius: opts.radialbar?.innerRadius ?? 0.3,
      maxValue: opts.radialbar?.maxValue ?? radialBarDataMax(model),
      fontSize: lightTheme.fontSize,
    });
  };

  it('places tracks between innerRadius and the outer radius', () => {
    const f = frameOf();
    expect(f.cx).toBe(300);
    expect(f.cy).toBe(200);
    expect(f.rOuter).toBe(186);
    expect(f.rInner).toBeCloseTo(55.8, 12); // 0.3 * 186
    expect(f.thickness).toBeCloseTo(29.55, 12);
    expect(f.gap).toBe(4);
    expect(f.tracks[0]!.rOuter).toBe(186);
    expect(f.tracks[0]!.rInner).toBeCloseTo(156.45, 12);
    expect(f.tracks[0]!.rMid).toBeCloseTo(171.225, 12);
    expect(f.tracks[3]!.rInner).toBeCloseTo(55.8, 12);
    expect(f.labelStride).toBe(1);
  });

  it('arcs start at 12 o\'clock and sweep value/maxValue of a full turn', () => {
    const f = frameOf();
    expect(f.maxValue).toBe(4); // maxValue defaults to the data max
    for (const t of f.tracks) expect(t.a0).toBe(RADIALBAR_START_ANGLE);
    expect(f.tracks[0]!.a1 - f.tracks[0]!.a0).toBeCloseTo(Math.PI * 2, 12); // 4/4
    expect(f.tracks[1]!.a1 - f.tracks[1]!.a0).toBeCloseTo(Math.PI * 1.5, 12); // 3/4
    expect(f.tracks[2]!.a1 - f.tracks[2]!.a0).toBeCloseTo(Math.PI, 12); // 2/4
    expect(f.tracks[3]!.a1 - f.tracks[3]!.a0).toBeCloseTo(Math.PI * 0.5, 12); // 1/4
    expect(f.tracks[0]!.aFull - f.tracks[0]!.a0).toBeCloseTo(Math.PI * 2, 12);
  });

  it('honors radialbar.maxValue and innerRadius', () => {
    const f = frameOf({
      type: 'radialbar',
      data: data(),
      radialbar: { maxValue: 8, innerRadius: 0.5 },
    });
    expect(f.maxValue).toBe(8);
    expect(f.rInner).toBe(93); // 0.5 * 186
    expect(f.tracks[0]!.a1 - f.tracks[0]!.a0).toBeCloseTo(Math.PI, 12); // 4/8 of a turn
    expect(f.thickness).toBeCloseTo((93 - 3 * 4) / 4, 12);
  });

  it('tracks are category-major; colors are categorical for one series and per-series for many', () => {
    const single = computeRadialBarTracks(modelFor({ type: 'radialbar', data: data() }).model, lightTheme);
    expect(single.map((t) => [t.label, t.value, t.color])).toEqual([
      ['A', 4, '#2a78d6'],
      ['B', 3, '#eb6834'],
      ['C', 2, '#1baf7a'],
      ['D', 1, '#eda100'],
    ]);
    const multi = computeRadialBarTracks(modelFor({ type: 'radialbar', data: twoSeries() }).model, lightTheme);
    expect(multi.map((t) => [t.label, t.si, t.pi, t.color])).toEqual([
      ['A · S1', 0, 0, '#2a78d6'],
      ['A · S2', 1, 0, '#eb6834'],
      ['B · S1', 0, 1, '#2a78d6'],
      ['B · S2', 1, 1, '#eb6834'],
    ]);
  });
});

describe('radialbar — validation', () => {
  it('rejects negative values, naming the series and index', () => {
    expect(() => mount({ type: 'radialbar', data: { categories: ['A', 'B'], series: [{ name: 'Neg', data: [1, -2] }] } })).toThrow(
      />= 0.*"Neg".*index 1/,
    );
  });

  it('rejects an out-of-range innerRadius and a non-positive maxValue', () => {
    expect(() => mount({ type: 'radialbar', data: data(), radialbar: { innerRadius: 1 } })).toThrow(/innerRadius/);
    expect(() => mount({ type: 'radialbar', data: data(), radialbar: { maxValue: 0 } })).toThrow(/maxValue/);
  });
});

describe('radialbar — rendering smoke (call log)', () => {
  it('draws gridline tracks under palette-colored value arcs and direct labels', () => {
    const { el } = mount({ type: 'radialbar', data: data() });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#e1e0d9')).toBe(true); // track
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2a78d6')).toBe(true); // slot 1
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#eda100')).toBe(true); // slot 4
    // Arcs are drawn at the fitted radii, starting at 12 o'clock.
    const arcs = ctx.__calls.filter((c) => c.method === 'arc');
    expect(arcs.some((c) => c.args[2] === 186 && c.args[3] === RADIALBAR_START_ANGLE)).toBe(true);
    // Direct labels at the arc starts, in ink (textPrimary), not mark colors.
    const texts = paintedText(el);
    expect(texts).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#0b0b0b')).toBe(true);
  });

  it('radialbar.track: false suppresses the gridline rings', () => {
    const { el } = mount({ type: 'radialbar', data: data(), radialbar: { track: false } });
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#e1e0d9')).toBe(false);
  });

  it('drops labels that cannot fit: 20 tracks label every third arc', () => {
    const categories = Array.from({ length: 20 }, (_, i) => `C${i + 1}`);
    const { el } = mount({
      type: 'radialbar',
      data: { categories, series: [{ name: 'S', data: categories.map((_c, i) => i + 1) }] },
    });
    const texts = paintedText(el);
    expect(texts).toContain('C1');
    expect(texts).toContain('C4');
    expect(texts).not.toContain('C2');
  });
});

describe('radialbar — legend policy', () => {
  it('one series: arcs are the categories — non-toggleable items, auto-shown for >= 2 arcs', () => {
    const { el } = mount({ type: 'radialbar', data: data() });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(items.every((i) => i.disabled)).toBe(true);
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('flex');
  });

  it('one series with a single arc: legend hidden', () => {
    const { el } = mount({ type: 'radialbar', data: { categories: ['Only'], series: [{ name: 'S', data: [5] }] } });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('several series: toggleable series items', () => {
    const { el, chart } = mount({ type: 'radialbar', data: twoSeries() });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['S1', 'S2']);
    expect(items[0]!.disabled).toBe(false);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'S2', visible: false });
  });
});

describe('radialbar — a11y table', () => {
  it('one row per arc with the value and its share of the max', () => {
    const { el } = mount({ type: 'radialbar', data: data() });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Category', 'Value', '% of max']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['A', '4', '100%'],
      ['B', '3', '75%'],
      ['C', '2', '50%'],
      ['D', '1', '25%'],
    ]);
  });
});

describe('radialbar — tooltip & keyboard', () => {
  it('tooltip shows the arc label, value and share of the max', () => {
    const { el } = mount({ type: 'radialbar', data: data() });
    // Outermost track's mid radius is 171.225 -> straight up from the center.
    pointerMove(el, 300, 200 - 171.225);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('A');
    expect(tip.innerHTML).toContain('4');
    expect(tip.innerHTML).toContain('100%');
  });

  it('hover dims the other arcs', async () => {
    const { el } = mount({ type: 'radialbar', data: data() });
    pointerMove(el, 300, 200 - 171.225);
    await frame();
    expect(ctxOf(el).__props.some((p) => p.prop === 'globalAlpha' && p.value === 0.55)).toBe(true);
  });

  it('arrows walk the arcs and announce value, share and position', () => {
    const { el, chart } = mount({ type: 'radialbar', data: data() });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    expect(enters.map((e) => [e.seriesName, e.dataIndex])).toEqual([
      ['Traffic', 0],
      ['Traffic', 1],
    ]);
    expect(enters[0]!.clientX).toBe(-1); // keyboard-originated
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('B: 3');
    expect(region.textContent).toContain('75% of 4');
    expect(region.textContent).toContain('arc 2 of 4');
    expect(canvasOf(el).tabIndex).toBe(0);
  });
});

describe('radialbar — pipeline integration (animation, resize, theming)', () => {
  it('sweeps entering arcs from 12 o\'clock and themes from the palette', async () => {
    const { el, chart } = mount({ type: 'radialbar', data: data(), theme: 'dark', animation: { duration: 20 } });
    const ctx = ctxOf(el);
    // Dark surface straight from the theme; entering arcs have no extent yet
    // (slices sweep out of the start angle), so only the tracks are painted.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#1a1a19')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2c2c2a')).toBe(true); // dark gridline
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#3987e5')).toBe(false);
    chart.update({ title: 'Load' });
    await frame();
    // The retained target geometry paints in the dark palette slots.
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#3987e5')).toBe(true);
    chart.resize();
    chart.destroy();
    expect(el.querySelector('canvas')).toBeNull();
  });

  it('re-lays out on an option update (innerRadius) and on resize', () => {
    const { el, chart } = mount({ type: 'radialbar', data: data() });
    chart.update({ radialbar: { innerRadius: 0.6 } });
    const arcs = ctxOf(el).__calls.filter((c) => c.method === 'arc');
    expect(arcs.some((c) => c.args[2] === 186)).toBe(true); // outer radius unchanged
    // 4 tracks now fit in [111.6, 186]: thickness (74.4 - 12) / 4 = 15.6.
    expect(arcs.some((c) => Math.abs((c.args[2] as number) - 170.4) < 1e-9)).toBe(true);
    chart.resize();
    expect(ctxOf(el).__calls.filter((c) => c.method === 'arc').length).toBeGreaterThan(arcs.length);
  });
});
