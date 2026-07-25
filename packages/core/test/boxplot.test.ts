import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { quantileR7, summarizeBox } from '../src/charts/statistical/stats';
import { boxSummaryOf, boxplotValueDomain } from '../src/charts/statistical/boxplot';
import { cleanupDom, ctxOf, key, mount, paintedText } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

const fiveNum = { min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9] };
const raw = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
const data = {
  categories: ['A', 'B'],
  series: [{ name: 'One', data: [fiveNum, raw as unknown as number] }],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

describe('boxplot — summary math (R-7 quartiles, Tukey whiskers)', () => {
  it('quantileR7 uses linear interpolation between order statistics', () => {
    const v = [1, 2, 3, 4];
    expect(quantileR7(v, 0.25)).toBe(1.75);
    expect(quantileR7(v, 0.5)).toBe(2.5);
    expect(quantileR7(v, 0.75)).toBe(3.25);
  });

  it('summarizeBox computes the exact 5-number summary and 1.5×IQR outliers', () => {
    const sum = summarizeBox(raw)!;
    expect(sum.q1).toBe(3.25);
    expect(sum.median).toBe(5.5);
    expect(sum.q3).toBe(7.75);
    // Fence hi = 7.75 + 1.5·4.5 = 14.5 → 100 is an outlier; whiskers 1..9.
    expect(sum.min).toBe(1);
    expect(sum.max).toBe(9);
    expect(sum.outliers).toEqual([100]);
  });

  it('without outliers the whiskers reach the sample min/max', () => {
    const sum = summarizeBox([2, 4, 6, 8])!;
    expect(sum).toMatchObject({ min: 2, max: 8, outliers: [] });
    expect(sum.median).toBe(5);
  });

  it('boxSummaryOf accepts both the 5-number object and raw arrays', () => {
    expect(boxSummaryOf(fiveNum)).toEqual(fiveNum);
    expect(boxSummaryOf(raw)!.median).toBe(5.5);
    expect(boxSummaryOf(null)).toBeNull();
    expect(boxSummaryOf({ min: 1, q1: 2 })).toBeNull(); // incomplete object
  });
});

describe('boxplot — rendering', () => {
  it('draws a box per category plus a 2px median line and category labels on x', () => {
    const { el } = mount({ type: 'boxplot', data });
    const ctx = ctxOf(el);
    // Two boxes (fillRect, excluding the surface clear).
    const boxRects = ctx.__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0));
    expect(boxRects).toHaveLength(2);
    // Median lines are 2px wide.
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 2)).toBe(true);
    // Categories on the x axis.
    const texts = paintedText(el);
    expect(texts).toContain('A');
    expect(texts).toContain('B');
  });

  it('outlier dots are >= 8px diameter (radius 4 arcs)', () => {
    const { el } = mount({ type: 'boxplot', data });
    const arcs = ctxOf(el).__calls.filter((c) => c.method === 'arc' && c.args[2] === 4);
    expect(arcs).toHaveLength(2); // outlier 9 (category A) + outlier 100 (category B)
  });

  it('the y domain covers whiskers AND outliers', () => {
    // The domain comes from the pipeline's `extendValueDomain` stage, so it is
    // NOT written into the caller's `yAxis` any more — `getOptions()` reports
    // configuration, never a computed domain.
    const { chart } = mount({ type: 'boxplot', data });
    expect(chart.getOptions().yAxis!.min).toBeUndefined();
    expect(chart.getOptions().yAxis!.max).toBeUndefined();
    const domain = boxplotValueDomain(data);
    expect(domain![0]).toBeLessThanOrEqual(1);
    expect(domain![1]).toBeGreaterThanOrEqual(100);
    expect(boxplotValueDomain({ series: [] })).toBeNull();
  });
});

describe('boxplot — legend, a11y, tooltip, keyboard', () => {
  it('legend lists series and toggling hides its boxes', () => {
    const two = mount({
      type: 'boxplot',
      data: {
        categories: ['A'],
        series: [
          { name: 'P', data: [fiveNum] },
          { name: 'Q', data: [{ min: 2, q1: 3, median: 4, q3: 5, max: 6 }] },
        ],
      },
    });
    const legend = two.el.querySelector('.chartcraft-legend') as HTMLElement;
    expect(legend.style.display).not.toBe('none');
    const items = legend.querySelectorAll('.chartcraft-legend-item');
    expect(items).toHaveLength(2);
    const before = ctxOf(two.el).__calls.filter(
      (c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0),
    ).length;
    expect(before).toBe(2);
    (items[1] as HTMLElement).click();
    const boxesPerFrame = ctxOf(two.el).__calls.filter(
      (c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0),
    ).length;
    expect(boxesPerFrame).toBe(3); // 2 from first paint + 1 after the toggle
  });

  it('a11y table has Min/Q1/Median/Q3/Max/Outliers columns with exact values', () => {
    const { el } = mount({ type: 'boxplot', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Category', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Outliers']);
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(2);
    expect([...rows[0]!.children].map((c) => c.textContent)).toEqual(['A', '1', '2', '3', '4', '5', '9']);
    // Raw-array category: computed summary.
    expect([...rows[1]!.children].map((c) => c.textContent)).toEqual(['B', '1', '3.25', '5.5', '7.75', '9', '100']);
  });

  it('tooltip shows the full 5-number summary', () => {
    const { el } = mount({ type: 'boxplot', data });
    key(el, 'ArrowRight'); // category A
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('median 3');
    expect(tip.innerHTML).toContain('q1 2');
    expect(tip.innerHTML).toContain('max 5');
  });

  it('keyboard navigation announces the summary per category', () => {
    const { el, chart } = mount({ type: 'boxplot', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'One', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('A: min 1');
    expect(region.textContent).toContain('median 3');
    key(el, 'ArrowRight'); // category B (raw array, computed summary)
    expect(region.textContent).toContain('median 5.5');
  });
});
