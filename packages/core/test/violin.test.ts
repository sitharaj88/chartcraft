/**
 * violin (v0.3): Gaussian-KDE density mirrored around each category axis.
 * Silverman's rule of thumb and the KDE itself are asserted against the
 * closed-form formulas on worked samples, plus the mirrored geometry, the
 * inner box (reusing the shared R-7/Tukey helpers), legend policy, a11y table,
 * renderer call log, tooltip and keyboard navigation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDistributionChartTypes } from '../src/charts/distribution';
import {
  SILVERMAN_FACTOR,
  SILVERMAN_IQR_DIVISOR,
  VIOLIN_FILL_ALPHA,
  VIOLIN_KDE_SAMPLES,
  VIOLIN_MEDIAN_RADIUS,
  gaussianKernel,
  kdeCurve,
  kdeDensityAt,
  sampleStdDev,
  silvermanBandwidth,
  violinBandwidth,
  violinExtent,
  violinSampleOf,
  violinSamples,
  violinShape,
} from '../src/charts/distribution/violin';
import { quantileR7, summarizeBox } from '../src/charts/statistical/stats';
import type { PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerDistributionChartTypes();
afterEach(cleanupDom);

const frame = () => new Promise((r) => setTimeout(r, 40));

/** Worked samples: A is symmetric, B has a Tukey outlier at 9. */
const A = [1, 2, 3, 4];
const B = [2, 4, 4, 4, 5, 5, 7, 9];
/** Silverman bandwidth of A: 0.9 * min(sd, IQR/1.34) * 4^(-1/5). */
const H_A = 0.7635139420854616;

const data = () => ({
  categories: ['A', 'B'],
  series: [{ name: 'Lab', data: [A as unknown as number, B as unknown as number] }],
});

// Geometry for the 600x400 mount with an explicit yAxis 0..20:
// ticks 0/5/10/15/20 -> left margin 12 + 14 = 26 -> plot {38, 12, 550, 354}.
// Band (2 categories, no bars): step 275, band start 120.5, bandwidth 110 ->
// single-series slot center 175.5 (and 450.5), half width 55.
// yScale: y(v) = 366 - (v / 20) * 354.
const y = (v: number) => 366 - (v / 20) * 354;
const mountFixture = () => mount({ type: 'violin', data: data(), yAxis: { min: 0, max: 20 } });

describe('violin — Silverman bandwidth (exact formula)', () => {
  it('matches 0.9 * min(sd, IQR/1.34) * n^(-1/5) on a worked sample', () => {
    const sd = sampleStdDev(A);
    expect(sd).toBeCloseTo(Math.sqrt(5 / 3), 12); // sum sq dev 5, n-1 = 3
    expect(sd).toBeCloseTo(1.2909944487358056, 12);
    const iqr = quantileR7(A, 0.75) - quantileR7(A, 0.25);
    expect(iqr).toBe(1.5); // 3.25 - 1.75
    const expected = SILVERMAN_FACTOR * Math.min(sd, iqr / SILVERMAN_IQR_DIVISOR) * Math.pow(A.length, -1 / 5);
    expect(silvermanBandwidth(A)).toBeCloseTo(expected, 12);
    expect(silvermanBandwidth(A)).toBeCloseTo(H_A, 12);
    // The IQR term wins here (1.5/1.34 = 1.1194... < sd).
    expect(iqr / SILVERMAN_IQR_DIVISOR).toBeCloseTo(1.1194029850746268, 12);
  });

  it('falls back to the sd when the IQR is zero, and is order-independent', () => {
    const flatIqr = [0, 5, 5, 5, 5, 10]; // q1 = q3 = 5 -> IQR 0
    expect(quantileR7([...flatIqr].sort((a, b) => a - b), 0.75) - quantileR7(flatIqr, 0.25)).toBe(0);
    expect(silvermanBandwidth(flatIqr)).toBeCloseTo(
      SILVERMAN_FACTOR * sampleStdDev(flatIqr) * Math.pow(6, -1 / 5),
      12,
    );
    expect(silvermanBandwidth([...B].reverse())).toBeCloseTo(silvermanBandwidth(B), 12);
    expect(silvermanBandwidth(B)).toBeCloseTo(0.664677492366943, 12);
  });

  it('returns 0 where no bandwidth exists, and an explicit bandwidth always wins', () => {
    expect(silvermanBandwidth([])).toBe(0);
    expect(silvermanBandwidth([5])).toBe(0);
    expect(silvermanBandwidth([7, 7, 7, 7])).toBe(0); // zero spread
    expect(violinBandwidth(A, 2)).toBe(2);
    expect(violinBandwidth(A, 'auto')).toBeCloseTo(H_A, 12);
    expect(violinBandwidth(A, undefined)).toBeCloseTo(H_A, 12);
    expect(violinBandwidth(A, 0)).toBeCloseTo(H_A, 12); // invalid -> auto
  });
});

describe('violin — Gaussian KDE (exact densities)', () => {
  it('kernel is the standard normal density', () => {
    expect(gaussianKernel(0)).toBeCloseTo(1 / Math.sqrt(Math.PI * 2), 12);
    expect(gaussianKernel(0)).toBeCloseTo(0.3989422804014327, 12);
    expect(gaussianKernel(1)).toBeCloseTo(0.24197072451914337, 12);
    expect(gaussianKernel(-1)).toBe(gaussianKernel(1));
  });

  it('density equals (1/(n*h)) * sum K((x - xi)/h)', () => {
    const manual = (x: number) => A.reduce((acc, xi) => acc + gaussianKernel((x - xi) / H_A), 0) / (A.length * H_A);
    expect(kdeDensityAt(A, H_A, 2.5)).toBeCloseTo(manual(2.5), 12);
    expect(kdeDensityAt(A, H_A, 2.5)).toBeCloseTo(0.24876046429439205, 12);
    expect(kdeDensityAt(A, H_A, 1)).toBeCloseTo(0.1903158939521179, 12);
    expect(kdeDensityAt(A, H_A, 4)).toBeCloseTo(0.1903158939521179, 12); // symmetric
    expect(kdeDensityAt(A, 0, 2.5)).toBe(0); // no bandwidth -> no density
    expect(kdeDensityAt([], H_A, 2.5)).toBe(0);
  });

  it('kdeCurve samples the data range inclusively with exact densities', () => {
    const curve = kdeCurve(A, H_A, 5);
    expect(curve.map((c) => c.value)).toEqual([1, 1.75, 2.5, 3.25, 4]);
    expect(curve.map((c) => c.density)).toEqual([
      0.1903158939521179, 0.2403385221546045, 0.24876046429439205, 0.24033852215460444, 0.1903158939521179,
    ]);
    const full = kdeCurve(A, H_A);
    expect(full).toHaveLength(VIOLIN_KDE_SAMPLES);
    expect(full[0]!.value).toBe(1); // trimmed to the sample's own extent
    expect(full[VIOLIN_KDE_SAMPLES - 1]!.value).toBe(4);
    expect(kdeCurve([7, 7, 7], H_A)).toEqual([]); // zero-width sample
    expect(kdeCurve(A, 0)).toEqual([]);
  });

  it('violinShape mirrors the curve, peaking at the full slot half-width', () => {
    const shape = violinShape(kdeCurve(A, H_A, 5), 55, (v) => y(v));
    expect(shape).toHaveLength(5);
    const peak = Math.max(...shape.map((s) => s.half));
    expect(peak).toBe(55); // the densest sample gets the full half width
    expect(shape[2]!.half).toBe(55); // 2.5 is the mode of a symmetric sample
    expect(shape[0]!.half).toBeCloseTo((0.1903158939521179 / 0.24876046429439205) * 55, 12);
    expect(shape[0]!.half).toBe(shape[4]!.half); // mirrored tails
    expect(shape[0]!.y).toBeCloseTo(y(1), 12);
    expect(shape[4]!.y).toBeCloseTo(y(4), 12);
    expect(violinShape([], 55, y)).toEqual([]);
  });
});

describe('violin — raw sample plumbing', () => {
  it('reads raw number[] entries and ignores non-samples', () => {
    expect(violinSampleOf(A)).toEqual(A);
    expect(violinSampleOf([1, 'x', null, 4] as unknown)).toEqual([1, 4]);
    expect(violinSampleOf(5)).toEqual([]);
    expect(violinSampleOf(null)).toEqual([]);
    expect(violinSamples(data())).toEqual([[A, B]]);
  });

  it('the value extent covers every visible sample', () => {
    expect(violinExtent(data())).toEqual([1, 9]);
    expect(violinExtent({ series: [{ name: 'H', visible: false, data: [A as unknown as number] }] })).toEqual([0, 1]);
    expect(violinExtent({ series: [{ name: 'S', data: [[3, 3, 3] as unknown as number] }] })).toEqual([2, 4]);
  });
});

describe('violin — rendering smoke (call log)', () => {
  it('draws a 0.35-alpha fill, 1px outline, neutral inner box and surface median dot', () => {
    const { el } = mountFixture();
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === VIOLIN_FILL_ALPHA)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 1)).toBe(true);
    // The mirrored outline reaches the slot half width (175.5 ± 55).
    const pathPts = ctx.__calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    expect(pathPts.some((c) => c.args[0] === 120.5)).toBe(true);
    expect(pathPts.some((c) => c.args[0] === 230.5)).toBe(true);
    // Inner box: neutral fill, 8px wide, spanning q1..q3 (1.75..3.25).
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#52514e')).toBe(true);
    const boxRects = ctx.__calls.filter((c) => c.method === 'fillRect' && c.args[2] === 8);
    expect(boxRects.some((c) => c.args[0] === 171.5 && Math.abs((c.args[3] as number) - (y(1.75) - y(3.25))) < 1e-9)).toBe(
      true,
    );
    // Median dot in surface color on the box.
    const dots = ctx.__calls.filter((c) => c.method === 'arc' && c.args[2] === VIOLIN_MEDIAN_RADIUS);
    expect(dots.some((c) => c.args[0] === 175.5 && Math.abs((c.args[1] as number) - y(2.5)) < 1e-9)).toBe(true);
    // Category labels on the band axis.
    expect(paintedText(el)).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('violin.showBox: false draws the density only', () => {
    const { el } = mount({ type: 'violin', data: data(), yAxis: { min: 0, max: 20 }, violin: { showBox: false } });
    const ctx = ctxOf(el);
    expect(ctx.__calls.some((c) => c.method === 'arc' && c.args[2] === VIOLIN_MEDIAN_RADIUS)).toBe(false);
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === VIOLIN_FILL_ALPHA)).toBe(true);
  });

  it('rejects a non-positive explicit bandwidth', () => {
    expect(() => mount({ type: 'violin', data: data(), violin: { bandwidth: -1 } })).toThrow(/bandwidth/);
  });
});

describe('violin — legend policy', () => {
  it('series items, toggleable, auto-hidden for a single series', () => {
    const { el } = mountFixture();
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const two = mount({
      type: 'violin',
      data: {
        categories: ['A', 'B'],
        series: [
          { name: 'Ctrl', data: [A as unknown as number, B as unknown as number] },
          { name: 'Test', data: [B as unknown as number, A as unknown as number] },
        ],
      },
    });
    const items = [...two.el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['Ctrl', 'Test']);
    expect(items[0]!.disabled).toBe(false);
    const onToggle = vi.fn();
    two.chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'Test', visible: false });
  });
});

describe('violin — a11y table (5-number summary + n)', () => {
  it('lists n and the Tukey five-number summary per category', () => {
    const { el } = mountFixture();
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Category', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    // B's whiskers stop at 7 (9 is beyond the 1.5*IQR fence) — the shared
    // Tukey helper decides that, not this type.
    expect(summarizeBox(B)).toMatchObject({ min: 2, q1: 4, median: 4.5, q3: 5.5, max: 7, outliers: [9] });
    expect(rows).toEqual([
      ['A', '4', '1', '1.75', '2.5', '3.25', '4'],
      ['B', '8', '2', '4', '4.5', '5.5', '7'],
    ]);
  });
});

describe('violin — tooltip & keyboard', () => {
  it('tooltip carries the category, n and the five-number summary', () => {
    const { el } = mountFixture();
    pointerMove(el, 175.5, 300);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('A');
    expect(tip.innerHTML).toContain('n 4');
    expect(tip.innerHTML).toContain('median 2.5');
    expect(tip.innerHTML).toContain('q3 3.25');
  });

  it('hover dims the sibling violins', async () => {
    const { el } = mountFixture();
    pointerMove(el, 450.5, 300);
    await frame();
    expect(ctxOf(el).__props.some((p) => p.prop === 'globalAlpha' && p.value === 0.5)).toBe(true);
  });

  it('arrows walk categories and announce n plus the summary', () => {
    const { el, chart } = mountFixture();
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    expect(enters.map((e) => e.dataIndex)).toEqual([0, 1]);
    expect(enters[0]!.clientX).toBe(-1);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('B: n 8');
    expect(region.textContent).toContain('median 4.5');
    expect(region.textContent).toContain('point 2 of 2');
    expect(canvasOf(el).tabIndex).toBe(0);
  });
});

describe('violin — pipeline integration (animation, resize, theming)', () => {
  it('animates, resizes and re-themes with no per-type plumbing', async () => {
    const { el, chart } = mount({
      type: 'violin',
      data: data(),
      yAxis: { min: 0, max: 20 },
      theme: 'dark',
      animation: { duration: 20 },
    });
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#1a1a19')).toBe(true);
    await frame();
    // Dark neutral inner box + dark palette outline.
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#c3c2b7')).toBe(true);
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#3987e5')).toBe(true);
    chart.resize();
    chart.update({ violin: { bandwidth: 1 } });
    await frame();
    expect(ctxOf(el).__props.some((p) => p.prop === 'globalAlpha' && p.value === VIOLIN_FILL_ALPHA)).toBe(true);
    chart.destroy();
    expect(el.querySelector('canvas')).toBeNull();
  });
});
