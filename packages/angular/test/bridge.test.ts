/**
 * Wrapper-logic tests against a mocked @chartcraft/core: bridging of all six
 * events to `output()`s, the immutable-reference update contract, the
 * "no update before the chart exists / none at mount" guard, and destroy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CcChart, CcDonutChart } from '../src/public-api';
import type { Annotation, ChartEventMap, ChartOptions, PointEvent } from '../src/public-api';

interface FakeChart {
  el: HTMLElement;
  options: Record<string, unknown>;
  update: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  getOptions: () => Record<string, unknown>;
  emit: (type: string, ev: unknown) => void;
}

const state = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('@chartcraft/core', () => ({
  createChart: (el: HTMLElement, options: Record<string, unknown>) => {
    const listeners = new Map<string, Set<(ev: unknown) => void>>();
    const chart = {
      el,
      options: { ...options },
      update: vi.fn((o: Record<string, unknown>) => {
        chart.options = { ...chart.options, ...o };
      }),
      setData: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      getOptions: () => chart.options,
      on: vi.fn((type: string, handler: (ev: unknown) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(handler);
        return () => set!.delete(handler);
      }),
      off: vi.fn(),
      emit: (type: string, ev: unknown) => {
        listeners.get(type)?.forEach((h) => h(ev));
      },
    };
    state.instances.push(chart);
    return chart;
  },
}));

function lastChart(): FakeChart {
  return state.instances[state.instances.length - 1] as FakeChart;
}

const pointEvent: PointEvent = {
  seriesId: 'One',
  seriesName: 'One',
  dataIndex: 0,
  x: 0,
  y: 1,
  clientX: 5,
  clientY: 6,
  native: null,
};

const options: ChartOptions = { type: 'line', data: { series: [{ name: 'One', data: [1] }] } };

/** Host with every output bound in a template (proves the public event names). */
@Component({
  selector: 'test-bridge-host',
  imports: [CcChart],
  template: `<cc-chart
    [options]="options()"
    (pointClick)="log.pointClick.push($event)"
    (pointEnter)="log.pointEnter.push($event)"
    (pointLeave)="log.pointLeave.push($event)"
    (legendToggle)="log.legendToggle.push($event)"
    (zoom)="log.zoom.push($event)"
    (annotationClick)="log.annotationClick.push($event)"
  />`,
})
class BridgeHost {
  readonly options = signal<ChartOptions>(options);
  readonly chartCmp = viewChild.required(CcChart);
  readonly log = {
    pointClick: [] as PointEvent[],
    pointEnter: [] as PointEvent[],
    pointLeave: [] as PointEvent[],
    legendToggle: [] as ChartEventMap['legendtoggle'][],
    zoom: [] as ChartEventMap['zoom'][],
    annotationClick: [] as ChartEventMap['annotationclick'][],
  };
}

function configure(): void {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
}

afterEach(() => {
  TestBed.resetTestingModule();
  state.instances.length = 0;
  document.body.innerHTML = '';
});

describe('event bridging (mocked core, Angular)', () => {
  it('bridges all six core events to camelCase outputs', async () => {
    configure();
    const fixture = TestBed.createComponent(BridgeHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    expect(chart.on).toHaveBeenCalledTimes(6);
    expect(chart.on.mock.calls.map((c) => c[0])).toEqual([
      'pointclick',
      'pointenter',
      'pointleave',
      'legendtoggle',
      'zoom',
      'annotationclick',
    ]);

    const annotation: Annotation = { kind: 'line', axis: 'y', value: 2, label: 'Target' };
    chart.emit('pointclick', pointEvent);
    chart.emit('pointenter', pointEvent);
    chart.emit('pointleave', pointEvent);
    chart.emit('legendtoggle', { seriesId: 'One', visible: false });
    chart.emit('zoom', { x: [0, 5] });
    chart.emit('zoom', null);
    chart.emit('annotationclick', { index: 0, annotation });

    const { log } = fixture.componentInstance;
    expect(log.pointClick).toEqual([pointEvent]);
    expect(log.pointEnter).toEqual([pointEvent]);
    expect(log.pointLeave).toEqual([pointEvent]);
    expect(log.legendToggle).toEqual([{ seriesId: 'One', visible: false }]);
    expect(log.zoom).toEqual([{ x: [0, 5] }, null]);
    expect(log.annotationClick).toEqual([{ index: 0, annotation }]);
  });

  it('per-type components forward the v0.3 events (zoom, annotationClick) too', async () => {
    configure();
    const fixture = TestBed.createComponent(CcDonutChart);
    fixture.componentRef.setInput('options', { data: options.data });
    fixture.detectChanges();
    await fixture.whenStable();

    const zooms: ChartEventMap['zoom'][] = [];
    const clicks: ChartEventMap['annotationclick'][] = [];
    fixture.componentInstance.zoom.subscribe((ev) => zooms.push(ev));
    fixture.componentInstance.annotationClick.subscribe((ev) => clicks.push(ev));

    const chart = lastChart();
    const annotation: Annotation = { kind: 'point', x: 'A', y: 1, label: 'Peak' };
    chart.emit('zoom', null);
    chart.emit('annotationclick', { index: 1, annotation });

    expect(zooms).toEqual([null]);
    expect(clicks).toEqual([{ index: 1, annotation }]);
  });
});

describe('the effect-based update contract (mocked core, Angular)', () => {
  it('does not update on mount, and updates once per NEW options reference', async () => {
    configure();
    const fixture = TestBed.createComponent(BridgeHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    expect(chart.update).not.toHaveBeenCalled();

    fixture.componentInstance.options.set({ ...options, title: 'T' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(chart.update).toHaveBeenCalledTimes(1);
    expect((chart.update.mock.calls[0]![0] as ChartOptions).title).toBe('T');
  });

  it('ignores in-place mutation — the update contract is immutable (documented)', async () => {
    configure();
    const live: ChartOptions = { ...options };
    const fixture = TestBed.createComponent(BridgeHost);
    fixture.componentInstance.options.set(live);
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    live.title = 'mutated in place';
    fixture.detectChanges();
    await fixture.whenStable();

    expect(chart.update).not.toHaveBeenCalled();
  });

  it('guards the effect until the chart exists (mount-time guard)', async () => {
    configure();
    const fixture = TestBed.createComponent(CcChart);
    fixture.componentRef.setInput('options', options);

    // View-local change detection runs the options `effect()` but NOT the
    // `afterNextRender` hook, so the chart genuinely does not exist yet.
    fixture.componentRef.changeDetectorRef.detectChanges();
    expect(fixture.componentInstance.chart()).toBeNull();
    expect(state.instances).toHaveLength(0);

    // A second options reference while the chart is still missing must be a
    // no-op, not a crash.
    fixture.componentRef.setInput('options', { ...options, title: 'B' });
    fixture.componentRef.changeDetectorRef.detectChanges();
    expect(fixture.componentInstance.chart()).toBeNull();
    expect(state.instances).toHaveLength(0);

    // Now let the render hooks run: the chart is created with the LATEST
    // options and no redundant mount-time update is issued.
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    expect(chart.options['title']).toBe('B');
    expect(chart.update).not.toHaveBeenCalled();
  });

  it('per-type components inject their type into every update payload', async () => {
    configure();
    const fixture = TestBed.createComponent(CcDonutChart);
    fixture.componentRef.setInput('options', { data: options.data });
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    expect(chart.options['type']).toBe('donut');

    fixture.componentRef.setInput('options', { data: options.data, title: 'Donut' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(chart.update).toHaveBeenCalledTimes(1);
    expect(chart.update.mock.calls[0]![0]).toMatchObject({ type: 'donut', title: 'Donut' });
  });

  it('subscribes to core exactly once — updates never re-register listeners', async () => {
    configure();
    const fixture = TestBed.createComponent(BridgeHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    for (const title of ['a', 'b', 'c']) {
      fixture.componentInstance.options.set({ ...options, title });
      fixture.detectChanges();
      await fixture.whenStable();
    }

    expect(chart.update).toHaveBeenCalledTimes(3);
    expect(chart.on).toHaveBeenCalledTimes(6); // still 6 — one chart, one subscription each
    expect(state.instances).toHaveLength(1); // never recreated
  });

  it('destroys the chart when the component is destroyed', async () => {
    configure();
    const fixture = TestBed.createComponent(CcDonutChart);
    fixture.componentRef.setInput('options', { data: options.data });
    fixture.detectChanges();
    await fixture.whenStable();

    const chart = lastChart();
    fixture.destroy();

    expect(chart.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.chart()).toBeNull();
  });
});
