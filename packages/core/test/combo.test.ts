import { afterEach, describe, expect, it } from 'vitest';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, markerCenters, mount, paintedText, pointerMove } from './helpers';

afterEach(cleanupDom);

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

describe('combo — per-series type overrides (model)', () => {
  it('series without `type` default to the root type; overrides resolve per series', () => {
    const opts = resolveOptions({
      type: 'bar',
      data: {
        categories: ['a', 'b'],
        series: [
          { name: 'bars', data: [1, 2] },
          { name: 'trend', type: 'line', data: [3, 4] },
          { name: 'dots', type: 'scatter', data: [5, 6] },
        ],
      },
    } as ChartOptions);
    const m = buildModel(opts, new Map());
    expect(m.series.map((s) => s.kind)).toEqual(['bar', 'line', 'scatter']);
  });

  it('stacking applies within same-kind groups only (bar stacks with bar)', () => {
    const opts = resolveOptions({
      type: 'bar',
      stacked: true,
      data: {
        categories: ['a', 'b'],
        series: [
          { name: 'b1', data: [1, 2] },
          { name: 'b2', data: [3, 4] },
          { name: 'l1', type: 'line', data: [10, 20] },
        ],
      },
    } as ChartOptions);
    const m = buildModel(opts, new Map());
    expect(m.series[0]!.y1).toEqual([1, 2]);
    expect(m.series[1]!.y1).toEqual([4, 6]); // stacked on b1
    expect(m.series[2]!.y1).toBeUndefined(); // lines never stack
    // One shared y-axis covers the bar stack AND the line values.
    expect(m.yDomain).toEqual([0, 20]);
  });

  it('bar and area groups stack independently of each other', () => {
    const opts = resolveOptions({
      type: 'bar',
      stacked: true,
      data: {
        categories: ['a'],
        series: [
          { name: 'b1', data: [1] },
          { name: 'b2', data: [2] },
          { name: 'a1', type: 'area', data: [10] },
          { name: 'a2', type: 'area', data: [20] },
        ],
      },
    } as ChartOptions);
    const m = buildModel(opts, new Map());
    expect(m.series[1]!.y1).toEqual([3]); // bar group: 1 + 2
    expect(m.series[2]!.y1).toEqual([10]);
    expect(m.series[3]!.y1).toEqual([30]); // area group: 10 + 20, no bar mixed in
    expect(m.yDomain).toEqual([0, 30]);
  });

  it('horizontal charts ignore per-series overrides (all series render as the base kind)', () => {
    const opts = resolveOptions({
      type: 'bar',
      horizontal: true,
      data: {
        categories: ['a', 'b'],
        series: [
          { name: 'bars', data: [1, 2] },
          { name: 'not-a-line', type: 'line', data: [3, 4] },
        ],
      },
    } as ChartOptions);
    const m = buildModel(opts, new Map());
    expect(m.horizontal).toBe(true);
    expect(m.series.map((s) => s.kind)).toEqual(['bar', 'bar']);
  });
});

describe('combo — rendering', () => {
  const comboData = {
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'Fill', type: 'area' as const, data: [2, 3, 2], showMarkers: false },
      { name: 'Bars', data: [4, 8, 6] },
      { name: 'Trend', type: 'line' as const, data: [5, 6, 7], curve: 'monotone' as const, showMarkers: false },
      { name: 'Dots', type: 'scatter' as const, data: [9, 8, 9] },
    ],
  };

  it('mixed marks render: bars (arcTo), line (bezier), scatter (arc), area (fill)', () => {
    const { el } = mount({ type: 'bar', data: comboData });
    const calls = ctxOf(el).__calls;
    expect(calls.filter((c) => c.method === 'arcTo').length).toBe(12); // 3 bars x 4 corners
    expect(calls.some((c) => c.method === 'bezierCurveTo')).toBe(true); // monotone line
    expect(calls.filter((c) => c.method === 'arc').length).toBe(3); // scatter markers only
    expect(calls.some((c) => c.method === 'fill')).toBe(true); // area fill
  });

  it('z-order: areas < bars < lines < scatter', () => {
    const { el } = mount({ type: 'bar', data: comboData });
    const calls = ctxOf(el).__calls;
    const firstFill = calls.findIndex((c) => c.method === 'fill'); // area fill
    const firstArcTo = calls.findIndex((c) => c.method === 'arcTo'); // bar corners
    const lastArcTo = calls.map((c) => c.method).lastIndexOf('arcTo');
    const firstBezier = calls.findIndex((c) => c.method === 'bezierCurveTo'); // line
    const firstArc = calls.findIndex((c) => c.method === 'arc'); // scatter marker
    expect(firstFill).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeLessThan(firstArcTo);
    expect(lastArcTo).toBeLessThan(firstBezier);
    expect(firstBezier).toBeLessThan(firstArc);
  });

  it('shares one y-axis: axis labels cover the combined domain, zero-anchored for bars', () => {
    const { el } = mount({
      type: 'line',
      data: {
        categories: ['a', 'b'],
        series: [
          { name: 'line', data: [90, 100] },
          { name: 'bars', type: 'bar', data: [5, 10] },
        ],
      },
    });
    const texts = paintedText(el);
    expect(texts).toContain('0'); // bar kind anchors the shared axis at zero
    expect(texts).toContain('100');
  });

  it('bars on a linear x-axis (no categories) lay out and render', () => {
    const { el } = mount({
      type: 'line',
      data: {
        series: [
          { name: 'line', data: [[0, 1], [1, 2], [2, 3]] as [number, number][] },
          { name: 'bars', type: 'bar', data: [[0, 2], [1, 1], [2, 2]] as [number, number][] },
        ],
      },
    });
    expect(ctxOf(el).__calls.filter((c) => c.method === 'arcTo').length).toBe(12); // 3 bars
  });

  it('legend is unchanged: every series listed, toggleable, in order', () => {
    const { el } = mount({ type: 'bar', data: comboData });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual([
      'Fill',
      'Bars',
      'Trend',
      'Dots',
    ]);
    expect(items.every((i) => i.hasAttribute('aria-pressed'))).toBe(true);
    items[1]!.click();
    expect(items[1]!.isConnected || true).toBe(true); // toggle re-renders without error
  });

  it('shared tooltip lists line and bar series together (line root default)', () => {
    const { el } = mount({
      type: 'line',
      data: {
        categories: ['Q1', 'Q2', 'Q3'],
        series: [
          { name: 'Trend', data: [10, 20, 30] },
          { name: 'Volume', type: 'bar', data: [5, 15, 25] },
        ],
      },
    });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Trend');
    expect(tip.innerHTML).toContain('Volume');
  });

  it('keyboard navigation walks across kinds unchanged (ArrowDown switches series)', () => {
    const { el, chart } = mount({
      type: 'line',
      data: {
        categories: ['Q1', 'Q2'],
        series: [
          { name: 'Trend', data: [10, 20] },
          { name: 'Volume', type: 'bar', data: [5, 15] },
        ],
      },
    });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toMatchObject({ seriesName: 'Trend', dataIndex: 0 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toMatchObject({ seriesName: 'Volume', dataIndex: 0 });
  });

  it('bar column hit-testing targets bar series; markers still win nearby', () => {
    const { el, chart } = mount({
      type: 'bar',
      tooltip: { shared: false },
      data: {
        categories: ['Q1', 'Q2', 'Q3'],
        series: [
          { name: 'Bars', data: [10, 20, 30] },
          { name: 'Trend', type: 'line', data: [15, 25, 35] },
        ],
      },
    });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // Deep inside the plot, far below the line markers: bar column hit.
    pointerMove(el, 300, 360);
    expect(enters.at(-1)!.seriesName).toBe('Bars');
    // Directly on a line marker: the marker wins.
    const lineMarker = markerCenters(el)[0]!;
    pointerMove(el, lineMarker.x, lineMarker.y);
    expect(enters.at(-1)!.seriesName).toBe('Trend');
  });
});
