import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, resolveTheme } from '../src/theme';
import { normalizeSeriesData } from '../src/data/normalize';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions, DataValue, TreeNode } from '../src/types';

describe('v0.2 theme fields (exact contract hexes)', () => {
  it('lightTheme carries up/down/neutral', () => {
    expect(lightTheme.up).toBe('#0ca30c');
    expect(lightTheme.down).toBe('#d03b3b');
    expect(lightTheme.neutral).toBe('#52514e');
  });

  it('darkTheme carries up/down/neutral', () => {
    expect(darkTheme.up).toBe('#0ca30c');
    expect(darkTheme.down).toBe('#d03b3b');
    expect(darkTheme.neutral).toBe('#c3c2b7');
  });

  it('partial custom themes are completed with the status colors', () => {
    const custom = resolveTheme({ colorScheme: 'dark', surface: '#000000' } as never);
    expect(custom.up).toBe('#0ca30c');
    expect(custom.down).toBe('#d03b3b');
    expect(custom.neutral).toBe('#c3c2b7');
  });
});

describe('v0.2 DataPoint normalization', () => {
  it('[x, y, r] bubble triples carry r', () => {
    const pts = normalizeSeriesData([[1, 10, 4], [2, 20, 9]] as DataValue[], null);
    expect(pts[0]).toMatchObject({ x: 1, xv: 1, y: 10, r: 4 });
    expect(pts[1]).toMatchObject({ y: 20, r: 9 });
  });

  it('[x, o, h, l, c] tuples carry OHLC and default y to the close', () => {
    const d = new Date(2024, 0, 2);
    const pts = normalizeSeriesData([[d, 10, 15, 8, 12]] as DataValue[], null);
    expect(pts[0]).toMatchObject({ o: 10, h: 15, l: 8, c: 12, y: 12 });
    expect(pts[0]!.xv).toBe(d.getTime());
  });

  it('object DataPoints carry the rich fields verbatim', () => {
    const children: TreeNode[] = [{ label: 'leaf', value: 3 }];
    const pts = normalizeSeriesData(
      [
        { x: 1, min: 0, q1: 1, median: 2, q3: 3, max: 4, outliers: [9] },
        { x: 2, y: 5, isTotal: true },
        { x: 3, r: 7, y: 1 },
        { x: 4, o: 1, h: 2, l: 0.5, c: 1.5 },
        { label: 'root', children },
      ] as DataValue[],
      null,
    );
    expect(pts[0]).toMatchObject({ min: 0, q1: 1, median: 2, q3: 3, max: 4, outliers: [9] });
    expect(pts[1]).toMatchObject({ y: 5, isTotal: true });
    expect(pts[2]).toMatchObject({ r: 7 });
    // OHLC object without y defaults y to the close.
    expect(pts[3]).toMatchObject({ o: 1, h: 2, l: 0.5, c: 1.5, y: 1.5 });
    expect(pts[4]!.children).toBe(children);
    expect(pts[4]!.label).toBe('root');
  });

  it('v0.1 object shape is unchanged (y required semantics, label/color)', () => {
    const pts = normalizeSeriesData([{ x: 'a', y: 4, label: 'A', color: '#123456' }] as DataValue[], ['a']);
    expect(pts[0]).toMatchObject({ x: 'a', xv: 0, y: 4, label: 'A', color: '#123456' });
  });
});

describe('v0.2 series options in the model', () => {
  it('sizeRange is carried onto the normalized series', () => {
    const opts = resolveOptions({
      type: 'scatter',
      data: { series: [{ name: 'S', sizeRange: [10, 50], data: [[1, 2, 3]] }] },
    } as ChartOptions);
    const m = buildModel(opts, new Map());
    expect(m.series[0]!.sizeRange).toEqual([10, 50]);
    expect(m.series[0]!.points[0]!.r).toBe(3);
  });

  it('per-type option blocks pass through resolution', () => {
    const opts = resolveOptions({
      type: 'line',
      data: { series: [{ name: 'S', data: [1] }] },
      histogram: { bins: 12 },
      heatmap: { min: 0, max: 10 },
      gauge: { min: 0, max: 200 },
      waterfall: { connectors: false },
    } as ChartOptions);
    expect(opts.histogram).toEqual({ bins: 12 });
    expect(opts.heatmap).toEqual({ min: 0, max: 10 });
    expect(opts.gauge).toEqual({ min: 0, max: 200 });
    expect(opts.waterfall).toEqual({ connectors: false });
  });

  it('non-cartesian types resolve kind = null; cartesian roots resolve their base kind', () => {
    const pie = buildModel(
      resolveOptions({ type: 'pie', data: { series: [{ name: 'S', data: [1, 2] }] } } as ChartOptions),
      new Map(),
    );
    expect(pie.series[0]!.kind).toBeNull();
    const line = buildModel(
      resolveOptions({ type: 'line', data: { series: [{ name: 'S', data: [1, 2] }] } } as ChartOptions),
      new Map(),
    );
    expect(line.series[0]!.kind).toBe('line');
  });
});
