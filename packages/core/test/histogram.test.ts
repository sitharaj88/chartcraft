import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { autoBinEdges, binCounts, binEdges, freedmanDiaconisWidth, AUTO_BIN_MAX, AUTO_BIN_MIN } from '../src/charts/statistical/binning';
import { cleanupDom, ctxOf, key, mount, paintedText } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

// 10 samples: bins [1,2):1  [2,3):2  [3,4):3  [4,5):2  [5,6):1  [6,7):0  [7,8]:1
const samples = [1, 2, 2, 3, 3, 3, 4, 4, 5, 8];
const data = { series: [{ name: 'Sample', data: samples }] };

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

/** fillRect calls excluding the full-surface clear. */
function barRects(el: HTMLElement): { x: number; y: number; w: number; h: number }[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0))
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number, w: c.args[2] as number, h: c.args[3] as number }));
}

describe('histogram — binning math', () => {
  it("Freedman–Diaconis 'auto' on 1..8 gives unit-width bins on nice edges", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8];
    // IQR (R-7) = 6.25 - 2.75 = 3.5; n^(1/3) = 2 → FD width = 3.5 exactly.
    expect(freedmanDiaconisWidth(v)).toBeCloseTo(3.5, 12);
    // Nice-width ladder + 5..60 clamp lands on width 1, edges 1..8.
    expect(autoBinEdges(v)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('clamps the auto bin count to at least 5', () => {
    // Two points: FD width 7.94 → nice 10 → 1 bin → ladder down to width 2.
    expect(autoBinEdges([0, 10])).toEqual([0, 2, 4, 6, 8, 10]);
    expect(autoBinEdges([0, 10]).length - 1).toBeGreaterThanOrEqual(AUTO_BIN_MIN);
  });

  it('clamps the auto bin count to at most 60', () => {
    // Heavy skew: FD width would give thousands of bins over [0, 1000].
    const v: number[] = [];
    for (let i = 0; i < 500; i++) v.push((i % 100) / 100);
    v.push(1000);
    const edges = autoBinEdges(v);
    const bins = edges.length - 1;
    expect(bins).toBeLessThanOrEqual(AUTO_BIN_MAX);
    expect(bins).toBeGreaterThanOrEqual(AUTO_BIN_MIN);
    expect(bins).toBe(50); // width ladder lands on 20 → 50 bins over 0..1000
    expect(edges[1]! - edges[0]!).toBe(20);
  });

  it('an explicit bin count splits the data extent into equal bins', () => {
    const edges = binEdges([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(edges).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('binCounts: left-inclusive bins, last bin right-inclusive', () => {
    expect(binCounts([1, 2, 2, 3, 7], [1, 3, 5, 7])).toEqual([3, 1, 1]);
    expect(binCounts(samples, [1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 2, 1, 0, 1]);
  });
});

describe('histogram — rendering', () => {
  it('renders one full-bin-width bar per non-empty bin with a 1px hairline gap', () => {
    const { el } = mount({ type: 'histogram', data });
    const rects = barRects(el);
    expect(rects).toHaveLength(6); // 7 bins, one empty
    // All bars share the bin width minus the 1px hairline gap.
    const w = rects[0]!.w;
    for (const r of rects) expect(r.w).toBeCloseTo(w, 6);
    // Bars of adjacent bins are exactly 1px apart (hairline).
    const sorted = [...rects].sort((a, b) => a.x - b.x);
    expect(sorted[1]!.x - (sorted[0]!.x + sorted[0]!.w)).toBeCloseTo(1, 6);
  });

  it('multi-series histograms overlay at alpha 0.7', () => {
    const { el } = mount({
      type: 'histogram',
      data: { series: [{ name: 'A', data: samples }, { name: 'B', data: [2, 3, 4, 5, 6] }] },
    });
    expect(ctxOf(el).__props.some((p) => p.prop === 'globalAlpha' && p.value === 0.7)).toBe(true);
  });

  it('x axis is linear with bin-edge tick labels', () => {
    const { el, chart } = mount({ type: 'histogram', data });
    const texts = paintedText(el);
    for (const edge of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      expect(texts).toContain(edge);
    }
    // The resolved axis extents are the outer bin edges; counts start at 0.
    const o = chart.getOptions();
    expect(o.xAxis!.min).toBe(1);
    expect(o.xAxis!.max).toBe(8);
    expect(o.yAxis!.min).toBe(0);
    expect(o.yAxis!.max).toBe(3); // max count, niced
  });
});

describe('histogram — legend, a11y, tooltip, keyboard', () => {
  it('legend: hidden for one series, shown for two (auto policy)', () => {
    const one = mount({ type: 'histogram', data });
    expect((one.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const two = mount({
      type: 'histogram',
      data: { series: [{ name: 'A', data: samples }, { name: 'B', data: [2, 3, 4] }] },
    });
    expect((two.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
  });

  it('a11y table rows are bin ranges with counts', () => {
    const { el } = mount({ type: 'histogram', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Bin', 'Sample']);
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(7);
    expect([...rows[0]!.children].map((c) => c.textContent)).toEqual(['1 – 2', '1']);
    expect([...rows[2]!.children].map((c) => c.textContent)).toEqual(['3 – 4', '3']);
    expect([...rows[5]!.children].map((c) => c.textContent)).toEqual(['6 – 7', '0']);
  });

  it('tooltip shows the bin range and count', () => {
    const { el } = mount({ type: 'histogram', data });
    key(el, 'ArrowRight'); // bin 1
    key(el, 'ArrowRight');
    key(el, 'ArrowRight'); // bin 3 → count 3
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('3 – 4');
    expect(tip.innerHTML).toContain('3 samples');
  });

  it('keyboard navigation walks bins (dataIndex = bin index) and announces ranges', () => {
    const { el, chart } = mount({ type: 'histogram', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'Sample', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('1 – 2');
    expect(region.textContent).toContain('bin 1 of 7');
    key(el, 'End'); // last bin
    expect(region.textContent).toContain('bin 7 of 7');
  });

  it('honors an explicit histogram.bins count', () => {
    const { el } = mount({ type: 'histogram', data, histogram: { bins: 7 } });
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(7);
  });
});
