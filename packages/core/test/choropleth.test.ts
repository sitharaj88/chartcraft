/**
 * Choropleth chart type: rendering (ramp fills, "no data" grey, hairline
 * borders), the gradient scale legend, matching rules (exact; the
 * `unmatched` policy), point-in-polygon hit testing with holes, keyboard order, the a11y
 * table / exportData, tooltip content, theming and resize.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGeoChartTypes } from '../src/charts/geo';
import { choroplethExtent, choroplethRamp, choroplethRows, matchFeaturesToRows } from '../src/charts/geo/choropleth';
import { equirectangular, fitExtent } from '../src/charts/geo/projections';
import { allRings, parseGeoFeatures } from '../src/charts/geo/geojson';
import { sequentialPalette } from '../src/theme';
import type { ChartOptions, GeoFeatureCollection } from '../src/index';
import type { DataModel } from '../src/model';
import { cleanupDom, ctxOf, key, mount, pointerMove } from './helpers';

registerGeoChartTypes();
afterEach(cleanupDom);

/** Plot rect for the 600x400 test mount (padding 12, no title). */
const PLOT = { x: 12, y: 12, w: 576, h: 376 };

function box(name: string, lon0: number, lon1: number): unknown {
  return {
    type: 'Feature',
    properties: { name, iso: name.slice(0, 2).toUpperCase() },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon0, 0],
          [lon1, 0],
          [lon1, 10],
          [lon0, 10],
        ],
      ],
    },
  };
}

/** Three 10°x10° boxes side by side: Alpha, Beta, Gamma. */
const geojson = {
  type: 'FeatureCollection',
  features: [box('Alpha', 0, 10), box('Beta', 10, 20), box('Gamma', 20, 30)],
} as unknown as GeoFeatureCollection;

const data = { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 1 }, { x: 'Beta', y: 5 }] }] };

function mountMap(extra: Partial<ChartOptions> = {}, gj: GeoFeatureCollection = geojson) {
  return mount({
    type: 'choropleth',
    data,
    choropleth: { geojson: gj, projection: 'equirectangular' },
    ...extra,
  } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
}

/** Screen position of a lon/lat through the same fit the chart computes. */
function projector(gj: GeoFeatureCollection = geojson) {
  const t = fitExtent(allRings(parseGeoFeatures(gj, 'name')), equirectangular, PLOT);
  return (lon: number, lat: number): [number, number] => t.project(lon, lat) as [number, number];
}

function fillsOf(el: HTMLElement): unknown[] {
  return ctxOf(el)
    .__props.filter((p) => p.prop === 'fillStyle')
    .map((p) => p.value);
}

function modelWith(values: (number | null)[]): DataModel {
  return {
    series: [{ visible: true, points: values.map((y) => ({ y })), id: 's' }],
  } as unknown as DataModel;
}

describe('choropleth pure helpers', () => {
  it('extent defaults to the data extent; min/max override; degenerate widens', () => {
    expect(choroplethExtent(modelWith([1, 5, 3]))).toEqual([1, 5]);
    expect(choroplethExtent(modelWith([1, 5]), { min: 0, max: 10 })).toEqual([0, 10]);
    expect(choroplethExtent(modelWith([4, 4]))).toEqual([4, 5]);
    expect(choroplethExtent(modelWith([null]))).toEqual([0, 1]);
  });

  it('ramp defaults to the sequential palette and honors an override', () => {
    expect(choroplethRamp({}, 'light')).toEqual(sequentialPalette);
    expect(choroplethRamp({ choropleth: { geojson, ramp: ['#000000', '#ffffff'] } }, 'light')).toEqual([
      '#000000',
      '#ffffff',
    ]);
  });

  it('REVERSES the default ramp on a dark surface, and never a custom one', () => {
    expect(choroplethRamp({}, 'dark')).toEqual([...sequentialPalette].reverse());
    expect(choroplethRamp({ choropleth: { geojson, ramp: ['#000000', '#ffffff'] } }, 'dark')).toEqual([
      '#000000',
      '#ffffff',
    ]);
  });

  it('matching is EXACT and reports rows that match nothing', () => {
    const features = parseGeoFeatures(geojson, 'name');
    const rows = [
      { pi: 0, key: 'Alpha', value: 1 },
      { pi: 1, key: 'beta', value: 2 }, // wrong case: NOT a match
      { pi: 2, key: 'Gamma ', value: 3 }, // trailing space: NOT a match
    ];
    const { perFeature, unmatchedRows } = matchFeaturesToRows(features, rows);
    expect(perFeature.map((r) => r?.key ?? null)).toEqual(['Alpha', null, null]);
    expect(unmatchedRows).toEqual(['beta', 'Gamma ']);
  });

  it('choroplethRows reads label, then x, in data order', () => {
    const model = {
      series: [
        {
          visible: true,
          id: 's',
          points: [
            { x: 'Alpha', y: 1 },
            { x: 2, y: 2, label: 'Beta' },
          ],
        },
      ],
    } as unknown as DataModel;
    expect(choroplethRows(model).rows).toEqual([
      { pi: 0, key: 'Alpha', value: 1 },
      { pi: 1, key: 'Beta', value: 2 },
    ]);
  });
});

describe('choropleth rendering', () => {
  it('draws one filled path per feature with ramp-end colors at the extent', () => {
    const { el } = mountMap();
    const ctx = ctxOf(el);
    // 3 features -> 3 filled paths (no axes/grid on a non-cartesian type).
    expect(ctx.__calls.filter((c) => c.method === 'fill')).toHaveLength(3);
    const fills = fillsOf(el);
    expect(fills).toContain(sequentialPalette[0]); // value 1 = ramp start
    expect(fills).toContain(sequentialPalette[sequentialPalette.length - 1]); // value 5 = ramp end
  });

  it('features with no datum get theme.gridline ("no data"), borders are hairline axisLine', () => {
    const { el } = mountMap();
    expect(fillsOf(el)).toContain('#e1e0d9'); // light theme gridline = Gamma
    const props = ctxOf(el).__props;
    expect(props.some((p) => p.prop === 'strokeStyle' && p.value === '#c3c2b7')).toBe(true);
    expect(props.some((p) => p.prop === 'lineWidth' && p.value === 1)).toBe(true);
    // Drawing is clipped to the plot rect.
    expect(ctxOf(el).__calls.some((c) => c.method === 'clip')).toBe(true);
  });

  it('choropleth.min/max rescale the fills; a per-point color wins outright', () => {
    const { el } = mountMap({ choropleth: { geojson, projection: 'equirectangular', min: 0, max: 100 } });
    const fills = fillsOf(el);
    // 1 and 5 out of 0..100 are both near the ramp start, not at its end.
    expect(fills).not.toContain(sequentialPalette[sequentialPalette.length - 1]);

    const { el: el2 } = mount({
      type: 'choropleth',
      data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 1, color: '#123456' }] }] },
      choropleth: { geojson, projection: 'equirectangular' },
    } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
    expect(fillsOf(el2)).toContain('#123456');
  });

  it('dark theme: "no data" uses the dark gridline', () => {
    const { el } = mountMap({ theme: 'dark' });
    expect(fillsOf(el)).toContain('#2c2c2a');
  });

  it('orthographic clips features on the far hemisphere', () => {
    const far = {
      type: 'FeatureCollection',
      features: [box('Alpha', 0, 10), box('Far', 170, 175)],
    } as unknown as GeoFeatureCollection;
    const { el } = mount({
      type: 'choropleth',
      data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 1 }, { x: 'Far', y: 2 }] }] },
      choropleth: { geojson: far, projection: 'orthographic' },
    } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
    // Only the near-side feature is painted.
    expect(ctxOf(el).__calls.filter((c) => c.method === 'fill')).toHaveLength(1);
  });

  it('albersUsa renders a US topology and survives resize', () => {
    const us = {
      type: 'FeatureCollection',
      features: [box('Kansas', -100, -95), box('Alaska', -150, -145)],
    } as unknown as GeoFeatureCollection;
    const { el, chart } = mount({
      type: 'choropleth',
      data: { series: [{ name: 'Pop', data: [{ x: 'Kansas', y: 3 }, { x: 'Alaska', y: 7 }] }] },
      choropleth: { geojson: us, projection: 'albersUsa' },
    } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
    const before = ctxOf(el).__calls.filter((c) => c.method === 'fill').length;
    expect(before).toBe(2);
    chart.resize();
    expect(ctxOf(el).__calls.filter((c) => c.method === 'fill').length).toBe(2 * before);
  });
});

describe('choropleth data contract errors', () => {
  it('requires choropleth.geojson (never bundled)', () => {
    expect(() =>
      mount({ type: 'choropleth', data } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>),
    ).toThrow(/requires options\.choropleth\.geojson/);
  });

  it("unmatched: 'strict' throws naming the unmatched data labels and the key used", () => {
    expect(() =>
      mount({
        type: 'choropleth',
        data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 1 }, { x: 'Atlantis', y: 2 }] }] },
        choropleth: { geojson, projection: 'equirectangular', unmatched: 'strict' },
      } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>),
    ).toThrow(/'Atlantis'.*'name'/s);
  });

  it('featureKey selects which property is matched', () => {
    const { el } = mount({
      type: 'choropleth',
      data: { series: [{ name: 'Pop', data: [{ x: 'AL', y: 1 }, { x: 'BE', y: 4 }] }] },
      choropleth: { geojson, projection: 'equirectangular', featureKey: 'iso' },
    } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
    expect(ctxOf(el).__calls.filter((c) => c.method === 'fill')).toHaveLength(3);
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(['AL', 'BE', 'GA']);
  });
});

describe('choropleth legend (gradient color scale)', () => {
  it('mounts a gradient bar with min/max labels instead of legend items', () => {
    const { el } = mountMap();
    const legend = el.querySelector('.chartcraft-choropleth-legend') as HTMLElement;
    expect(legend).toBeTruthy();
    expect(el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
    const bar = legend.querySelector('.chartcraft-choropleth-legend-bar') as HTMLElement;
    expect(bar.style.background).toContain('linear-gradient');
    expect(legend.querySelector('.chartcraft-choropleth-legend-min')!.textContent).toBe('1');
    expect(legend.querySelector('.chartcraft-choropleth-legend-max')!.textContent).toBe('5');
    expect(legend.getAttribute('aria-label')).toBe('Color scale from 1 to 5');
  });

  it('shows by default (single series) and is non-toggleable; legend:false hides it', () => {
    const { el, chart } = mountMap();
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    (el.querySelector('.chartcraft-choropleth-legend') as HTMLElement).click();
    expect(onToggle).not.toHaveBeenCalled();

    const { el: el2 } = mountMap({ legend: false });
    expect((el2.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(el2.querySelector('.chartcraft-choropleth-legend')).toBeNull();
  });

  it('legend labels honor choropleth.min/max', () => {
    const { el } = mountMap({ choropleth: { geojson, projection: 'equirectangular', min: 0, max: 10 } });
    expect(el.querySelector('.chartcraft-choropleth-legend-min')!.textContent).toBe('0');
    expect(el.querySelector('.chartcraft-choropleth-legend-max')!.textContent).toBe('10');
  });
});

describe('choropleth a11y, keyboard & tooltip', () => {
  it('a11y table is feature + value in data order, then the no-data features', () => {
    const { el } = mountMap();
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Feature', 'Value']);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['Alpha', '1'],
      ['Beta', '5'],
      ['Gamma', 'no data'],
    ]);
  });

  it('exportData mirrors the a11y table exactly', () => {
    const { chart } = mountMap();
    expect(chart.exportData()).toBe('Feature,Value\nAlpha,1\nBeta,5\nGamma,no data');
  });

  it('keyboard walks features in DATA order and announces feature, value, position', () => {
    const { el, chart } = mountMap();
    const enters: { dataIndex: number; x: unknown; y: number | null }[] = [];
    chart.on('pointenter', (e) => enters.push({ dataIndex: e.dataIndex, x: e.x, y: e.y }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 0, x: 'Alpha', y: 1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('Alpha: 1. Feature 1 of 2.');
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 1, x: 'Beta', y: 5 });
    expect(region.textContent).toBe('Beta: 5. Feature 2 of 2.');
    // Only the 2 data rows are navigable (Gamma has no datum).
    key(el, 'ArrowRight');
    expect(enters).toHaveLength(2);
  });

  it('hit-testing uses point-in-polygon: inside hits, holes and no-data do not', () => {
    const holed = {
      type: 'FeatureCollection',
      features: [
        {
          properties: { name: 'Ring' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
              ],
              [
                [3, 3],
                [7, 3],
                [7, 7],
                [3, 7],
              ],
            ],
          },
        },
      ],
    } as unknown as GeoFeatureCollection;
    const { el, chart } = mount({
      type: 'choropleth',
      data: { series: [{ name: 'Pop', data: [{ x: 'Ring', y: 2 }] }] },
      choropleth: { geojson: holed, projection: 'equirectangular' },
    } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
    const at = projector(holed);
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // Dead center is inside the HOLE -> no hit.
    pointerMove(el, ...at(5, 5));
    expect(onEnter).not.toHaveBeenCalled();
    // Between the hole and the outer edge -> hit.
    pointerMove(el, ...at(1, 5));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ dataIndex: 0, y: 2 });
  });

  it('tooltip shows the feature name and its value; no-data features have none', () => {
    const { el } = mountMap();
    const at = projector();
    pointerMove(el, ...at(5, 5)); // inside Alpha
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('Alpha');
    expect(tip.innerHTML).toContain('Pop');
    expect(tip.innerHTML).toContain('>1<');
    // Gamma carries no datum: hovering it hides the tooltip again.
    pointerMove(el, ...at(25, 5));
    expect(tip.style.display).toBe('none');
  });

  it('click on a feature emits pointclick with the data index', () => {
    const { el, chart } = mountMap();
    const at = projector();
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    const [cx, cy] = at(15, 5); // inside Beta
    (el.querySelector('canvas') as HTMLCanvasElement).dispatchEvent(
      new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({ dataIndex: 1, y: 5, seriesName: 'Pop' });
  });

  it('aria label and hidden data table are wired up', () => {
    const { el } = mountMap();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Choropleth chart');
    expect(canvas.tabIndex).toBe(0);
    expect((el.querySelector('.chartcraft-a11y-table') as HTMLElement).style.clipPath).toBe('inset(50%)');
  });
});
