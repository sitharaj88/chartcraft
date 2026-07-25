/**
 * v0.3 plumbing: type declarations + lossless normalization of every new
 * DataPoint field, the [x, low, high] tuple, and the low/high value extent.
 */
import { describe, expect, it } from 'vitest';
import { normalizeSeriesData, windowNormalized } from '../src/data/normalize';
import { buildModel, resolveOptions } from '../src/model';
import { registerBuiltinChartTypes } from '../src/charts';
import { getChartType, registerChartType } from '../src/charts/registry';
import type {
  Annotation,
  ChartOptions,
  DataLabelOptions,
  DataPoint,
  ErrorBarOptions,
  GeoFeatureCollection,
  SeriesOptions,
  TrendlineOptions,
  ZoomOptions,
} from '../src/index';

const build = (opts: ChartOptions) => buildModel(resolveOptions(opts), new Map());

describe('v0.3 DataPoint fields survive normalization losslessly', () => {
  const point: DataPoint = {
    x: 'Q1',
    y: 5,
    label: 'first',
    color: '#123456',
    low: 2,
    high: 9,
    eLow: 0.5,
    eHigh: 1.5,
    target: 7,
    start: 1000,
    end: 2000,
    group: 'lane-a',
    weight: 42,
    id: 'node-1',
  };

  it('carries low/high through verbatim', () => {
    const [p] = normalizeSeriesData([point], ['Q1']);
    expect(p?.low).toBe(2);
    expect(p?.high).toBe(9);
  });

  it('carries eLow/eHigh through verbatim', () => {
    const [p] = normalizeSeriesData([point], ['Q1']);
    expect(p?.eLow).toBe(0.5);
    expect(p?.eHigh).toBe(1.5);
  });

  it('carries target through verbatim', () => {
    const [p] = normalizeSeriesData([{ x: 'A', y: 1, target: 3 }], ['A']);
    expect(p?.target).toBe(3);
  });

  it('carries start/end through verbatim, preserving Date identity', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-02-01T00:00:00Z');
    const [p] = normalizeSeriesData([{ x: 'Task', start, end }], ['Task']);
    expect(p?.start).toBe(start);
    expect(p?.end).toBe(end);
    const [q] = normalizeSeriesData([{ x: 'Task', start: 5, end: 9 }], ['Task']);
    expect(q?.start).toBe(5);
    expect(q?.end).toBe(9);
  });

  it('carries group through verbatim', () => {
    const [p] = normalizeSeriesData([{ x: 'T', group: 'lane-a' }], ['T']);
    expect(p?.group).toBe('lane-a');
  });

  it('carries weight through verbatim and folds it into y (contract: alias of y)', () => {
    const [p] = normalizeSeriesData([{ x: 'term', weight: 42 }], null);
    expect(p?.weight).toBe(42);
    expect(p?.y).toBe(42);
  });

  it('carries id through verbatim', () => {
    const [p] = normalizeSeriesData([{ id: 'node-1', y: 1 }], null);
    expect(p?.id).toBe('node-1');
  });

  it('round-trips every new field at once, leaving v0.2 semantics intact', () => {
    const [p] = normalizeSeriesData([point], ['Q1']);
    expect(p).toMatchObject({
      x: 'Q1',
      xv: 0,
      y: 5,
      label: 'first',
      color: '#123456',
      low: 2,
      high: 9,
      eLow: 0.5,
      eHigh: 1.5,
      target: 7,
      start: 1000,
      end: 2000,
      group: 'lane-a',
      weight: 42,
      id: 'node-1',
    });
  });

  it('omits fields the caller did not set (no undefined keys invented)', () => {
    const [p] = normalizeSeriesData([{ x: 'A', y: 1 }], ['A']);
    for (const k of ['low', 'high', 'eLow', 'eHigh', 'target', 'start', 'end', 'group', 'weight', 'id']) {
      expect(k in (p as object)).toBe(false);
    }
  });

  it('uses low as the y fallback so gaps/domains/navigation keep working', () => {
    const [p] = normalizeSeriesData([{ x: 'A', low: 3, high: 8 }], ['A']);
    expect(p?.y).toBe(3);
  });

  it('honors SeriesOptions.lowKey / highKey for object data', () => {
    const [p] = normalizeSeriesData([{ x: 'A', p10: 2, p90: 11 } as unknown as DataPoint], ['A'], {
      lowKey: 'p10',
      highKey: 'p90',
    });
    expect(p?.low).toBe(2);
    expect(p?.high).toBe(11);
    expect(p?.y).toBe(2);
  });
});

describe('the [x, low, high] tuple', () => {
  it('reads as [x, y, r] by default — v0.2 behavior is byte-identical', () => {
    const [p] = normalizeSeriesData([[1, 20, 30]], null);
    expect(p).toEqual({ x: 1, xv: 1, y: 20, r: 30 });
  });

  it("reads as [x, low, high] under triple: 'range'", () => {
    const [p] = normalizeSeriesData([[1, 20, 30]], null, { triple: 'range' });
    expect(p).toEqual({ x: 1, xv: 1, y: 20, low: 20, high: 30 });
  });

  it("leaves 2-tuples and 5-tuples untouched under triple: 'range'", () => {
    const [pair] = normalizeSeriesData([[1, 2]], null, { triple: 'range' });
    expect(pair).toEqual({ x: 1, xv: 1, y: 2 });
    const [ohlc] = normalizeSeriesData([[1, 2, 3, 4, 5]], null, { triple: 'range' });
    expect(ohlc).toEqual({ x: 1, xv: 1, y: 5, o: 2, h: 3, l: 4, c: 5 });
  });

  it('the registry drives the tuple mode via needs.triple', () => {
    // 'line' declares no triple mode -> 'size', so r (not high) is populated.
    const m = build({ type: 'line', data: { series: [{ name: 'S', data: [[0, 1, 9]] }] } });
    expect(m.series[0]?.points[0]?.r).toBe(9);
    expect(m.series[0]?.points[0]?.high).toBeUndefined();
  });

  it("a definition declaring needs.triple: 'range' gets low/high from the model", () => {
    registerBuiltinChartTypes();
    const real = getChartType('line');
    try {
      registerChartType({ ...real, needs: { ...real.needs, triple: 'range' } });
      const m = build({ type: 'line', data: { series: [{ name: 'S', data: [[0, 1, 9]] }] } });
      expect(m.series[0]?.points[0]).toMatchObject({ y: 1, low: 1, high: 9 });
      expect(m.series[0]?.points[0]?.r).toBeUndefined();
      // ... and the band is inside the value domain, with no type-side work.
      expect(m.yDomain[1]).toBeGreaterThanOrEqual(9);
    } finally {
      registerChartType(real);
    }
  });

  it('honors lowKey/highKey end-to-end through buildModel', () => {
    const m = build({
      type: 'line',
      data: {
        series: [
          {
            name: 'CI',
            lowKey: 'p10',
            highKey: 'p90',
            data: [{ x: 0, y: 5, p10: 1, p90: 11 } as unknown as DataPoint],
          },
        ],
      },
    });
    expect(m.series[0]?.points[0]).toMatchObject({ y: 5, low: 1, high: 11 });
    expect(m.yDomain[0]).toBeLessThanOrEqual(1);
    expect(m.yDomain[1]).toBeGreaterThanOrEqual(11);
  });
});

describe('low/high join the value extent', () => {
  it('widens yDomain to cover a range band', () => {
    const m = build({
      type: 'line',
      data: { series: [{ name: 'S', data: [{ x: 0, y: 5, low: -4, high: 12 }] }] },
    });
    expect(m.yDomain[0]).toBeLessThanOrEqual(-4);
    expect(m.yDomain[1]).toBeGreaterThanOrEqual(12);
  });

  it('does not widen anything when no point carries low/high', () => {
    const m = build({ type: 'line', data: { series: [{ name: 'S', data: [1, 2, 3] }] } });
    expect(m.yDomain).toEqual([1, 3]);
  });
});

describe('resolveOptions: v0.3 feature + per-type blocks', () => {
  it('dataLabels default to off with auto selectivity', () => {
    const o = resolveOptions({ type: 'line', data: { series: [] } });
    expect(o.dataLabels).toEqual({ show: false, select: 'auto', position: 'auto' });
  });

  it('dataLabels: true enables with the mandatory auto selectivity', () => {
    const o = resolveOptions({ type: 'line', data: { series: [] }, dataLabels: true });
    expect(o.dataLabels).toEqual({ show: true, select: 'auto', position: 'auto' });
  });

  it('dataLabels object form is honored, format carried through', () => {
    const format: NonNullable<DataLabelOptions['format']> = (p) => p.formattedY;
    const o = resolveOptions({
      type: 'line',
      data: { series: [] },
      dataLabels: { select: 'extremes', position: 'inside', format },
    });
    expect(o.dataLabels).toEqual({ show: true, select: 'extremes', position: 'inside', format });
  });

  it('zoom defaults to disabled, axis x, wheel/drag/pan on', () => {
    const o = resolveOptions({ type: 'line', data: { series: [] } });
    expect(o.zoom).toEqual({ enabled: false, axis: 'x', wheel: true, drag: true, pan: true });
    const on = resolveOptions({ type: 'line', data: { series: [] }, zoom: { axis: 'xy', minSpan: 5 } });
    expect(on.zoom).toEqual({ enabled: true, axis: 'xy', wheel: true, drag: true, pan: true, minSpan: 5 });
  });

  it('annotations resolve to a copied array (never the caller\'s reference)', () => {
    const annotations: Annotation[] = [{ kind: 'line', axis: 'y', value: 10, label: 'SLO' }];
    const o = resolveOptions({ type: 'line', data: { series: [] }, annotations });
    expect(o.annotations).toEqual(annotations);
    expect(o.annotations).not.toBe(annotations);
    expect(resolveOptions({ type: 'line', data: { series: [] } }).annotations).toEqual([]);
  });

  it('passes every v0.3 per-type block through untouched', () => {
    const geojson: GeoFeatureCollection = { type: 'FeatureCollection', features: [] };
    const raw: ChartOptions = {
      type: 'line',
      data: { series: [] },
      rangearea: { showBounds: false },
      bullet: { ranges: [50, 80], target: 90 },
      calendar: { weekStart: 1 },
      violin: { bandwidth: 'auto', showBox: false },
      radialbar: { innerRadius: 0.5, track: true },
      rose: { startAngle: 1 },
      sankey: { nodeWidth: 12, align: 'justify' },
      gantt: { rowHeight: 20 },
      wordcloud: { minFontSize: 10, maxFontSize: 40, rotate: true },
      network: { fixedSeed: 7, iterations: 100 },
      choropleth: { geojson, projection: 'mercator', featureKey: 'iso' },
      parallel: { axes: ['a', 'b'] },
    };
    const o = resolveOptions(raw);
    expect(o.rangearea).toEqual({ showBounds: false });
    expect(o.bullet).toEqual({ ranges: [50, 80], target: 90 });
    expect(o.calendar).toEqual({ weekStart: 1 });
    expect(o.violin).toEqual({ bandwidth: 'auto', showBox: false });
    expect(o.radialbar).toEqual({ innerRadius: 0.5, track: true });
    expect(o.rose).toEqual({ startAngle: 1 });
    expect(o.sankey).toEqual({ nodeWidth: 12, align: 'justify' });
    expect(o.gantt).toEqual({ rowHeight: 20 });
    expect(o.wordcloud).toEqual({ minFontSize: 10, maxFontSize: 40, rotate: true });
    expect(o.network).toEqual({ fixedSeed: 7, iterations: 100 });
    expect(o.choropleth?.geojson).toBe(geojson);
    expect(o.parallel).toEqual({ axes: ['a', 'b'] });
  });

  it('accepts errorBars/trendline/lowKey/highKey on a series (type-level contract)', () => {
    const errorBars: ErrorBarOptions = { percent: 5, capWidth: 8, color: '#333' };
    const trendline: TrendlineOptions = { type: 'movingAverage', period: 5, dashed: true, label: 'trend' };
    const zoom: ZoomOptions = { enabled: true };
    const series: SeriesOptions = {
      name: 'S',
      data: [1, 2],
      errorBars,
      trendline,
      lowKey: 'lo',
      highKey: 'hi',
    };
    const o = resolveOptions({ type: 'line', data: { series: [series] }, zoom });
    expect(o.data.series[0]?.errorBars).toBe(errorBars);
    expect(o.data.series[0]?.trendline).toBe(trendline);
    expect(o.data.series[0]?.lowKey).toBe('lo');
    expect(o.data.series[0]?.highKey).toBe('hi');
  });
});

describe('windowNormalized', () => {
  const pts = normalizeSeriesData([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], null);

  it('slices to the window and pads one point on each side', () => {
    expect(windowNormalized(pts, 2, 3).map((p) => p.xv)).toEqual([1, 2, 3, 4]);
  });

  it('clamps padding at the series bounds', () => {
    expect(windowNormalized(pts, 0, 1).map((p) => p.xv)).toEqual([0, 1, 2]);
    expect(windowNormalized(pts, 4, 5).map((p) => p.xv)).toEqual([3, 4, 5]);
  });

  it('returns nothing when the window misses every point', () => {
    expect(windowNormalized(pts, 100, 200)).toEqual([]);
  });
});
