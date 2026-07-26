/**
 * 0.3.1 DX fixes, against the real @chartcraft/core:
 *
 * - GAP 1: core's runtime values (themes, palette, scales, decorators, version)
 *   are reachable from `@chartcraft/angular` alone, and the type re-export list
 *   is complete (`GraphData` & friends were missing in 0.3.0).
 * - GAP 2: `ChartSpec` is the options-shaped spec type, spelled identically in
 *   every wrapper, with `TypedChartOptions` kept as a deprecated alias.
 * - GAP 3: the development-only "hold [options] in a signal" warning — fires
 *   once, only for genuinely redundant reference churn, and never in production.
 * - GAP 4: `(ready)` and `whenReady()` remove the two levels of nullability
 *   (`this.hero()?.chart()?.…`) that setup code used to have to carry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Component,
  afterNextRender,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as api from '../src/public-api';
import { CcLineChart } from '../src/public-api';
import type { ChartInstance, ChartSpec, GraphData } from '../src/public-api';
import { trackOptionStability, unstableOptionsMessage } from '../src/lib/dev';
import './setup';

const spec = (): ChartSpec => ({
  data: { categories: ['a', 'b', 'c'], series: [{ name: 'One', data: [1, 2, 3] }] },
  theme: 'light',
  animation: false,
  width: 600,
  height: 400,
});

function configure(): void {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
}

afterEach(() => {
  TestBed.resetTestingModule();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- GAP 1

describe('core runtime values are re-exported (one dependency, not two)', () => {
  it('exposes the themes, palettes and version without importing @chartcraft/core', () => {
    expect(typeof api.version).toBe('string');
    expect(typeof api.createChart).toBe('function');
    expect(api.lightTheme.colorScheme).toBe('light');
    expect(api.darkTheme.colorScheme).toBe('dark');
    expect(api.lightTheme.surface).not.toBe(api.darkTheme.surface);
    expect(api.categoricalPalette.light.length).toBeGreaterThan(0);
    expect(api.categoricalPalette.dark.length).toBeGreaterThan(0);
    expect(Array.isArray(api.sequentialPalette)).toBe(true);
    expect(api.sequentialRampFor('light').length).toBeGreaterThan(0);
  });

  it('exposes the scale classes and the downsampler', () => {
    expect(new api.LinearScale([0, 10], [0, 100]).scale(5)).toBeCloseTo(50);
    expect(typeof api.TimeScale).toBe('function');
    expect(typeof api.BandScale).toBe('function');
    expect(typeof api.LogScale).toBe('function');
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: x * x }));
    expect(api.downsampleLTTB(points, 3)).toHaveLength(3);
  });

  it('exposes the decorator registry', () => {
    api.registerDecorator({ id: 'ng-dx-probe', layer: 'over', draw: () => undefined });
    expect(api.decorators().some((d) => d.id === 'ng-dx-probe')).toBe(true);
    api.unregisterDecorator('ng-dx-probe');
    expect(api.decorators().some((d) => d.id === 'ng-dx-probe')).toBe(false);
    expect(typeof api.clearDecorators).toBe('function');
  });

  it('re-exports the graph payload types that 0.3.0 left out', () => {
    const graph: GraphData = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      links: [{ source: 'a', target: 'b', value: 5 }],
    };
    expect(graph.links).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- GAP 2

describe('ChartSpec', () => {
  it('TypedChartOptions is still exported as the deprecated alias of ChartSpec', () => {
    const asOld: api.TypedChartOptions = spec();
    const asNew: ChartSpec = asOld;
    expect(asNew.width).toBe(600);
  });
});

// ---------------------------------------------------------------- GAP 4

/** Host that reaches the instance the OLD way and the two NEW ways. */
@Component({
  selector: 'test-ready-host',
  imports: [CcLineChart],
  template: `<cc-line-chart [options]="options()" (ready)="onReady($event)" style="height: 320px" />`,
})
class ReadyHost {
  readonly options = signal<ChartSpec>(spec());
  readonly hero = viewChild.required(CcLineChart);

  /**
   * What `this.hero()?.chart()` looked like from the host's own
   * afterNextRender. Deliberately typed with both nullish cases, because that
   * is exactly the burden `(ready)`/`whenReady()` remove: whether the child's
   * own afterNextRender has already run is an ordering detail an app should not
   * have to reason about.
   */
  chartSignalInSetup: ChartInstance | null | undefined = undefined;
  /** What `whenReady()` resolved with, awaited from the same place. */
  awaited: ChartInstance | null = null;
  /** Payloads seen on the `(ready)` output. */
  readonly readyEvents: ChartInstance[] = [];

  constructor() {
    afterNextRender(() => {
      // The documented trap: registered before the child's own afterNextRender,
      // so the signal is still null here.
      this.chartSignalInSetup = this.hero().chart();
      void this.hero()
        .whenReady()
        .then((chart) => {
          this.awaited = chart;
        });
    });
  }

  onReady(chart: ChartInstance): void {
    this.readyEvents.push(chart);
  }
}

describe('(ready) / whenReady()', () => {
  it('emits (ready) exactly once with the live instance', async () => {
    configure();
    const fixture = TestBed.createComponent(ReadyHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.componentInstance;
    expect(host.readyEvents).toHaveLength(1);
    expect(host.readyEvents[0]).toBe(host.hero().chart());
    expect(typeof host.readyEvents[0]!.exportData).toBe('function');

    // The signal is already set when (ready) fires, so a handler can use both.
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.readyEvents).toHaveLength(1);
  });

  it('whenReady() resolves from a host afterNextRender, whatever the render ordering', async () => {
    configure();
    const fixture = TestBed.createComponent(ReadyHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;

    // `chart()` in setup code is null-or-not depending on which
    // afterNextRender ran first — the ambiguity the app used to have to branch
    // on with `this.hero()?.chart()?.…`. `whenReady()` removes it: one await,
    // no optional chain, correct either way.
    expect(host.chartSignalInSetup === null || host.chartSignalInSetup === host.hero().chart()).toBe(
      true,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(host.awaited).not.toBeNull();
    expect(host.awaited).toBe(host.hero().chart());
  });

  it('whenReady() resolves immediately once the chart is up', async () => {
    configure();
    const fixture = TestBed.createComponent(ReadyHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const chart = await fixture.componentInstance.hero().whenReady();
    expect(chart).toBe(fixture.componentInstance.hero().chart());
  });
});

// ---------------------------------------------------------------- GAP 3

describe('development-only unstable-options warning', () => {
  it('warns once when [options] is a new-but-equal object three passes in a row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    const fixture = TestBed.createComponent(ReadyHost);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(warn).not.toHaveBeenCalled();

    for (let i = 0; i < 2; i += 1) {
      fixture.componentInstance.options.set(spec());
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(warn).not.toHaveBeenCalled(); // still inside the tolerance

    fixture.componentInstance.options.set(spec());
    fixture.detectChanges();
    await fixture.whenStable();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain('@chartcraft/angular');
    expect(message).toContain('[options]');
    expect(message).toContain('computed()');
    expect(message).toContain('cc-line-chart');

    // Warned once per component, not once per pass.
    for (let i = 0; i < 3; i += 1) {
      fixture.componentInstance.options.set(spec());
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stays silent when [options] only changes for real', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    configure();
    const fixture = TestBed.createComponent(ReadyHost);
    fixture.detectChanges();
    await fixture.whenStable();

    for (const title of ['a', 'b', 'c', 'd', 'e']) {
      fixture.componentInstance.options.set({ ...spec(), title });
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('cannot fire when isDevMode() is false (production builds)', async () => {
    const globals = globalThis as { ngDevMode?: unknown };
    const saved = globals.ngDevMode;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      globals.ngDevMode = false; // exactly what a production build defines
      configure();
      const fixture = TestBed.createComponent(ReadyHost);
      fixture.detectChanges();
      await fixture.whenStable();
      for (let i = 0; i < 8; i += 1) {
        fixture.componentInstance.options.set(spec());
        fixture.detectChanges();
        await fixture.whenStable();
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      globals.ngDevMode = saved;
    }
  });

  it('the probe resets its streak on a real change and warns once', () => {
    const warn = vi.fn();
    let probe = trackOptionStability(null, spec(), 'cc-line-chart', warn);
    probe = trackOptionStability(probe, spec(), 'cc-line-chart', warn); // streak 1
    probe = trackOptionStability(probe, { ...spec(), title: 'x' }, 'cc-line-chart', warn); // 0
    probe = trackOptionStability(probe, { ...spec(), title: 'x' }, 'cc-line-chart', warn); // 1
    probe = trackOptionStability(probe, { ...spec(), title: 'x' }, 'cc-line-chart', warn); // 2
    expect(warn).not.toHaveBeenCalled();
    probe = trackOptionStability(probe, { ...spec(), title: 'x' }, 'cc-line-chart', warn); // 3
    expect(warn).toHaveBeenCalledTimes(1);
    expect(probe.warned).toBe(true);

    trackOptionStability(probe, { ...spec(), title: 'x' }, 'cc-line-chart', warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('the same reference twice is never treated as churn', () => {
    const warn = vi.fn();
    const same = spec();
    let probe = trackOptionStability(null, same, 'cc-chart', warn);
    for (let i = 0; i < 10; i += 1) probe = trackOptionStability(probe, same, 'cc-chart', warn);
    expect(warn).not.toHaveBeenCalled();
    expect(probe.streak).toBe(0);
  });

  it('the message names the input and the selector', () => {
    expect(unstableOptionsMessage('cc-gauge-chart')).toContain('[options]');
    expect(unstableOptionsMessage('cc-gauge-chart')).toContain('cc-gauge-chart');
  });
});
