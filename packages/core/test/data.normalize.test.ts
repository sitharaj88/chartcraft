import { describe, expect, it } from 'vitest';
import { inferXType, normalizeSeriesData } from '../src/data/normalize';
import { buildModel, resolveOptions } from '../src/model';
import type { ChartOptions } from '../src/types';

describe('normalizeSeriesData — the three DataValue shapes', () => {
  it('shape 1: plain numbers (y against categories/index), null = gap', () => {
    const pts = normalizeSeriesData([3, null, 5], ['a', 'b', 'c']);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toMatchObject({ x: 'a', xv: 0, y: 3 });
    expect(pts[1]).toMatchObject({ x: 'b', xv: 1, y: null });
    expect(pts[2]).toMatchObject({ x: 'c', xv: 2, y: 5 });
  });

  it('shape 1 without categories uses the index as x', () => {
    const pts = normalizeSeriesData([7, 8], null);
    expect(pts[0]).toMatchObject({ x: 0, xv: 0, y: 7 });
    expect(pts[1]).toMatchObject({ x: 1, xv: 1, y: 8 });
  });

  it('shape 2: [x, y] pairs, including Date x and null y', () => {
    const d = new Date(2024, 0, 2);
    const pts = normalizeSeriesData(
      [
        [10, 1],
        [d, null],
      ],
      null,
    );
    expect(pts[0]).toMatchObject({ x: 10, xv: 10, y: 1 });
    expect(pts[1]!.x).toBe(d);
    expect(pts[1]!.xv).toBe(d.getTime());
    expect(pts[1]!.y).toBeNull();
  });

  it('shape 3: object form with x/label/color; string x maps to category index', () => {
    const pts = normalizeSeriesData(
      [
        { x: 'beta', y: 4, label: 'Beta', color: '#123456' },
        { y: 9 },
      ],
      ['alpha', 'beta'],
    );
    expect(pts[0]).toMatchObject({ x: 'beta', xv: 1, y: 4, label: 'Beta', color: '#123456' });
    // Missing x falls back to the category at that index.
    expect(pts[1]).toMatchObject({ x: 'beta', xv: 1, y: 9 });
  });
});

describe('inferXType', () => {
  it('explicit axis type wins', () => {
    expect(inferXType({ explicit: 'log', chartType: 'line', hasCategories: true, sampleXs: [] })).toBe('log');
  });
  it('bar charts are always category', () => {
    expect(inferXType({ chartType: 'bar', hasCategories: false, sampleXs: [1, 2] })).toBe('category');
  });
  it('Dates imply time; strings imply category; numbers imply linear', () => {
    expect(inferXType({ chartType: 'line', hasCategories: false, sampleXs: [new Date()] })).toBe('time');
    expect(inferXType({ chartType: 'line', hasCategories: false, sampleXs: ['a'] })).toBe('category');
    expect(inferXType({ chartType: 'line', hasCategories: false, sampleXs: [1, 2] })).toBe('linear');
  });
});

describe('buildModel', () => {
  const base = (over: Partial<ChartOptions>): ChartOptions =>
    ({
      type: 'line',
      data: { series: [{ name: 'A', data: [1, 2, 3] }] },
      ...over,
    }) as ChartOptions;

  it('computes y domain over visible series only', () => {
    const opts = resolveOptions(
      base({
        data: {
          series: [
            { name: 'A', data: [1, 2, 3] },
            { name: 'B', data: [100, 200, 300], visible: false },
          ],
        },
      }),
    );
    const m = buildModel(opts, new Map());
    expect(m.yDomain).toEqual([1, 3]);
  });

  it('derives categories from string x values', () => {
    const opts = resolveOptions(
      base({
        data: {
          series: [
            {
              name: 'A',
              data: [
                { x: 'jan', y: 1 },
                { x: 'feb', y: 2 },
              ],
            },
          ],
        },
      }),
    );
    const m = buildModel(opts, new Map());
    expect(m.xType).toBe('category');
    expect(m.categories).toEqual(['jan', 'feb']);
  });

  it('palette slots follow first-seen identity, stable across rebuilds', () => {
    const slots = new Map<string, number>();
    const opts1 = resolveOptions(
      base({
        data: {
          series: [
            { name: 'A', data: [1] },
            { name: 'B', data: [2] },
          ],
        },
      }),
    );
    const m1 = buildModel(opts1, slots);
    expect(m1.series[0]!.paletteIndex).toBe(0);
    expect(m1.series[1]!.paletteIndex).toBe(1);
    // Rebuild with A removed: B keeps its slot (identity, not rank).
    const opts2 = resolveOptions(base({ data: { series: [{ name: 'B', data: [2] }] } }));
    const m2 = buildModel(opts2, slots);
    expect(m2.series[0]!.paletteIndex).toBe(1);
  });

  it('bar/area domains are anchored at zero', () => {
    const opts = resolveOptions(base({ type: 'bar', data: { series: [{ name: 'A', data: [5, 9] }] } }));
    const m = buildModel(opts, new Map());
    expect(m.yDomain[0]).toBe(0);
    expect(m.yDomain[1]).toBe(9);
  });

  it('downsamples large line series beyond the threshold', () => {
    const big = Array.from({ length: 500 }, (_, i) => [i, Math.sin(i / 10)] as [number, number]);
    const opts = resolveOptions(base({ data: { series: [{ name: 'A', data: big }] }, downsample: { threshold: 100 } }));
    const m = buildModel(opts, new Map());
    expect(m.series[0]!.points.length).toBeLessThanOrEqual(100);
    expect(m.series[0]!.points.length).toBeGreaterThan(50);
    // Endpoints kept.
    expect(m.series[0]!.points[0]!.xv).toBe(0);
    expect(m.series[0]!.points.at(-1)!.xv).toBe(499);
  });
});
