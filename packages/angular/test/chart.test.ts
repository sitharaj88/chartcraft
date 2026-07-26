/**
 * Integration tests against the real @chartcraft/core: mount, instance access
 * (both the `chart` signal and `viewChild`), immutable option updates,
 * event bridging through real template bindings, destroy on teardown, and the
 * per-type components.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CcBarChart,
  CcChart,
  CcChoroplethChart,
  CcGanttChart,
  CcGaugeChart,
  CcHeatmapChart,
  CcLineChart,
  CcNetworkChart,
  CcSankeyChart,
  CcViolinChart,
  type ChartEventMap,
  type ChartOptions,
  type DataValue,
  type GeoFeatureCollection,
  type TypedChartOptions,
} from '../src/public-api';
import { resizeObservers } from './setup';

function makeOptions(): ChartOptions {
  return {
    type: 'line',
    data: {
      categories: ['a', 'b', 'c'],
      series: [
        { name: 'One', data: [1, 2, 3] },
        { name: 'Two', data: [3, 2, 1] },
      ],
    },
    theme: 'light',
    animation: false,
    width: 600,
    height: 400,
  };
}

/** Host component: real template bindings for `[options]` and every output. */
@Component({
  selector: 'test-host',
  imports: [CcChart],
  template: `<cc-chart
    [options]="options()"
    (legendToggle)="legendToggles.push($event)"
    (zoom)="zooms.push($event)"
    style="height: 320px"
  />`,
})
class HostComponent {
  readonly options = signal<ChartOptions>(makeOptions());
  readonly legendToggles: ChartEventMap['legendtoggle'][] = [];
  readonly zooms: ChartEventMap['zoom'][] = [];
  readonly chartCmp = viewChild.required(CcChart);
}

function configure(): void {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
}

/** Mount a bare chart component with `options` set, fully rendered. */
async function mount<T>(component: Type<T>, options: ChartOptions | TypedChartOptions) {
  configure();
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('options', options);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

afterEach(() => {
  TestBed.resetTestingModule();
  resizeObservers.length = 0;
  document.body.innerHTML = '';
});

describe('<cc-chart> (Angular)', () => {
  it('mounts a chart into its own host element and exposes the instance', async () => {
    const fixture = await mount(CcChart, makeOptions());
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.chartcraft')).not.toBeNull();
    expect(el.querySelector('canvas')).not.toBeNull();
    expect(el.getAttribute('style')).toContain('display: block');

    const chart = fixture.componentInstance.chart();
    expect(chart).not.toBeNull();
    expect(typeof chart!.update).toBe('function');
    expect(chart!.getOptions().type).toBe('line');
  });

  it('binds through a real template and reaches the instance via viewChild', async () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const inner = fixture.componentInstance.chartCmp();
    expect(inner.chart()).not.toBeNull();
    expect(inner.chart()!.getOptions().type).toBe('line');
    expect((fixture.nativeElement as HTMLElement).querySelector('cc-chart canvas')).not.toBeNull();
  });

  it('routes a NEW options reference through chart.update()', async () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = fixture.componentInstance.chartCmp().chart()!;
    const spy = vi.spyOn(chart, 'update');

    fixture.componentInstance.options.set({ ...makeOptions(), title: 'Hello' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(chart.getOptions().title).toBe('Hello');
  });

  it('bridges legendtoggle to the (legendToggle) output', async () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const item = (fixture.nativeElement as HTMLElement).querySelector(
      '.chartcraft-legend-item',
    ) as HTMLElement;
    expect(item).toBeTruthy();
    item.click();

    expect(fixture.componentInstance.legendToggles).toHaveLength(1);
    expect(fixture.componentInstance.legendToggles[0]).toMatchObject({ visible: false });
  });

  it('renders nothing before the first render (the SSR shape)', () => {
    configure();
    const fixture = TestBed.createComponent(CcChart);
    fixture.componentRef.setInput('options', makeOptions());

    // This is what a server render emits: an empty, sized host element.
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.chart()).toBeNull();
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('.chartcraft')).toBeNull();
  });

  it('accepts a `type` change on the generic component through update()', async () => {
    const fixture = await mount(CcChart, makeOptions());
    const chart = fixture.componentInstance.chart()!;
    expect(chart.getOptions().type).toBe('line');

    fixture.componentRef.setInput('options', { ...makeOptions(), type: 'bar' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(chart.getOptions().type).toBe('bar');
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas')).not.toBeNull();
  });

  it('destroys the chart on teardown (no leaked observers, DOM removed)', async () => {
    const fixture = await mount(CcChart, makeOptions());
    const el = fixture.nativeElement as HTMLElement;
    const chart = fixture.componentInstance.chart()!;
    const destroy = vi.spyOn(chart, 'destroy');

    fixture.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.chart()).toBeNull();
    expect(el.querySelector('.chartcraft')).toBeNull();
    for (const ro of resizeObservers) {
      expect(ro.targets).toHaveLength(0);
    }
  });
});

describe('per-type components (Angular)', () => {
  it('CcLineChart injects type "line" and exposes the chart', async () => {
    const { type: _type, ...typeless } = makeOptions();
    const fixture = await mount(CcLineChart, typeless);
    expect(fixture.componentInstance.chart()!.getOptions().type).toBe('line');
  });

  it('CcBarChart injects type "bar" and forwards events', async () => {
    const { type: _type, ...typeless } = makeOptions();
    const fixture = await mount(CcBarChart, typeless);
    const seen: ChartEventMap['legendtoggle'][] = [];
    fixture.componentInstance.legendToggle.subscribe((ev) => seen.push(ev));

    expect(fixture.componentInstance.chart()!.getOptions().type).toBe('bar');
    (
      (fixture.nativeElement as HTMLElement).querySelector('.chartcraft-legend-item') as HTMLElement
    ).click();
    expect(seen).toHaveLength(1);
  });

  it('v0.2 components mount with the correct type (heatmap, gauge)', async () => {
    const heatmap = await mount(CcHeatmapChart, {
      data: {
        categories: ['Mon', 'Tue', 'Wed'],
        series: [
          { name: 'Morning', data: [4, 8, 6] },
          { name: 'Afternoon', data: [9, 12, 7] },
        ],
      },
      theme: 'light',
      animation: false,
      width: 600,
      height: 400,
    });
    expect(heatmap.componentInstance.chart()!.getOptions().type).toBe('heatmap');
    expect((heatmap.nativeElement as HTMLElement).querySelector('.chartcraft')).not.toBeNull();
    heatmap.destroy();
    TestBed.resetTestingModule();

    const gauge = await mount(CcGaugeChart, {
      data: { series: [{ name: 'CPU', data: [63] }] },
      gauge: { min: 0, max: 100 },
      theme: 'light',
      animation: false,
      width: 400,
      height: 300,
    });
    expect(gauge.componentInstance.chart()!.getOptions().type).toBe('gauge');
    expect(gauge.componentInstance.chart()!.getOptions().gauge).toMatchObject({ min: 0, max: 100 });
  });

  it('v0.3 components mount with the correct type (sankey, choropleth, gantt, network, violin)', async () => {
    const box = { theme: 'light' as const, animation: false, width: 600, height: 400 };
    const day = (n: number) => Date.UTC(2026, 0, n);

    const sankey = await mount(CcSankeyChart, {
      ...box,
      data: {
        series: [
          {
            name: 'Flow',
            data: {
              nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
              links: [{ source: 'a', target: 'b', value: 5 }],
            } as unknown as DataValue,
          } as never,
        ],
      },
    });
    expect(sankey.componentInstance.chart()!.getOptions().type).toBe('sankey');
    expect((sankey.nativeElement as HTMLElement).querySelector('canvas')).not.toBeNull();
    sankey.destroy();
    TestBed.resetTestingModule();

    const geojson: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Alpha' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] },
        },
      ],
    };
    const choropleth = await mount(CcChoroplethChart, {
      ...box,
      choropleth: { geojson },
      data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 3 }] }] },
    });
    expect(choropleth.componentInstance.chart()!.getOptions().type).toBe('choropleth');
    expect(
      choropleth.componentInstance.chart()!.getOptions().choropleth!.featureKey ?? 'name',
    ).toBe('name');
    choropleth.destroy();
    TestBed.resetTestingModule();

    const gantt = await mount(CcGanttChart, {
      ...box,
      gantt: { rowHeight: 24 },
      data: {
        series: [
          {
            name: 'Plan',
            data: [
              { x: 'Design', start: day(1), end: day(5) },
              { x: 'Build', start: day(5), end: day(12) },
            ],
          },
        ],
      },
    });
    expect(gantt.componentInstance.chart()!.getOptions().type).toBe('gantt');
    expect(gantt.componentInstance.chart()!.getOptions().gantt).toMatchObject({ rowHeight: 24 });
    gantt.destroy();
    TestBed.resetTestingModule();

    const network = await mount(CcNetworkChart, {
      ...box,
      network: { fixedSeed: 7 },
      data: {
        series: [
          {
            name: 'Graph',
            data: {
              nodes: [{ id: 'a', label: 'A', group: 'g1' }, { id: 'b', label: 'B', group: 'g2' }],
              links: [{ source: 'a', target: 'b' }],
            } as unknown as DataValue,
          } as never,
        ],
      },
    });
    expect(network.componentInstance.chart()!.getOptions().type).toBe('network');
    expect(network.componentInstance.chart()!.getOptions().network).toMatchObject({ fixedSeed: 7 });
    network.destroy();
    TestBed.resetTestingModule();

    const violin = await mount(CcViolinChart, {
      ...box,
      violin: { showBox: true },
      data: {
        categories: ['A', 'B'],
        series: [
          {
            name: 'Samples',
            data: [
              [1, 2, 2, 3, 4, 4, 5],
              [2, 3, 3, 4, 5, 6, 7],
            ] as unknown as DataValue[],
          },
        ],
      },
    });
    expect(violin.componentInstance.chart()!.getOptions().type).toBe('violin');
    expect(violin.componentInstance.chart()!.getOptions().violin).toMatchObject({ showBox: true });
  });
});

describe('v0.3 features through the wrapper (Angular)', () => {
  it('routes dataLabels / zoom / annotations changes through chart.update()', async () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.componentInstance;
    const chart = host.chartCmp().chart()!;
    const spy = vi.spyOn(chart, 'update');

    host.options.set({ ...host.options(), dataLabels: { select: 'all' } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(chart.getOptions().dataLabels).toMatchObject({ select: 'all' });

    host.options.set({ ...host.options(), zoom: { axis: 'x', drag: true } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(chart.getOptions().zoom).toMatchObject({ axis: 'x', drag: true });

    host.options.set({
      ...host.options(),
      annotations: [{ kind: 'line', axis: 'y', value: 2, label: 'Target' }],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(3);
    expect(chart.getOptions().annotations).toHaveLength(1);
  });

  it('exposes the v0.3 instance methods through the chart signal (exportData returns CSV)', async () => {
    const fixture = await mount(CcChart, { ...makeOptions(), zoom: true });
    const chart = fixture.componentInstance.chart()!;

    expect(typeof chart.exportImage).toBe('function');
    expect(typeof chart.exportData).toBe('function');
    expect(typeof chart.zoomTo).toBe('function');

    const csv = chart.exportData();
    expect(csv.split('\n')[0]).toContain('One');
    expect(csv.split('\n').length).toBeGreaterThan(1);

    const json = JSON.parse(chart.exportData({ format: 'json' })) as {
      columns: string[];
      rows: Record<string, string>[];
    };
    expect(json.columns).toContain('One');
    expect(json.rows.length).toBeGreaterThan(0);
  });

  it('bridges the zoom event to the (zoom) output (via zoomTo)', async () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.options.set({
      ...makeOptions(),
      data: { series: [{ name: 'One', data: [[0, 1], [1, 4], [2, 9], [3, 16]] }] },
      zoom: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = fixture.componentInstance.chartCmp().chart()!;
    chart.zoomTo({ x: [1, 2] });
    expect(fixture.componentInstance.zooms).toHaveLength(1);
    expect(fixture.componentInstance.zooms[0]).toMatchObject({ x: [1, 2] });

    chart.zoomTo(null);
    expect(fixture.componentInstance.zooms).toHaveLength(2);
    expect(fixture.componentInstance.zooms[1]).toBeNull();
  });
});
