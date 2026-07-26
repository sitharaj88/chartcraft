/**
 * @vitest-environment jsdom
 *
 * 0.3.1 DX fixes for @chartcraft/svelte:
 *
 * - GAP 1: core's runtime values are re-exported from the package entry, so an
 *   app needs one dependency instead of two. Because the entry imports
 *   `.svelte` sources it cannot be imported directly in this suite (no Svelte
 *   vitest plugin — see test/loader.js), so the re-export lists in `index.js`
 *   and `index.d.ts` are cross-checked against the live `@chartcraft/core`
 *   module: a typo or a name core does not export fails here.
 * - GAP 2: `ChartSpec` is declared, options-shaped, and used by the props types.
 * - GAP 4: `onready`/`on:ready` give setup code a reliable instance hook, and
 *   the Svelte-5 callback-prop form works for every bridged event.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@chartcraft/core';
import './setup.js';
import { mountComponent, tick } from './loader.js';
import { EVENTS } from '../src/options.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const indexSource = readFileSync(join(SRC, 'index.js'), 'utf8');
const dtsSource = readFileSync(join(SRC, 'index.d.ts'), 'utf8');
const chartSource = readFileSync(join(SRC, 'Chart.svelte'), 'utf8');

/** The runtime values the wrapper promises to re-export from core. */
const CORE_VALUES = [
  'createChart',
  'version',
  'lightTheme',
  'darkTheme',
  'categoricalPalette',
  'sequentialPalette',
  'sequentialRampFor',
  'LinearScale',
  'TimeScale',
  'BandScale',
  'LogScale',
  'downsampleLTTB',
  'registerDecorator',
  'unregisterDecorator',
  'decorators',
  'clearDecorators',
];

const BOX = { theme: 'light', animation: false, width: 600, height: 400 };
const baseOptions = () => ({
  ...BOX,
  data: { categories: ['a', 'b', 'c'], series: [{ name: 'One', data: [1, 2, 3] }] },
});

/** @type {{ component: any, host: HTMLElement }[]} */
const mounted = [];

function mount(name, props) {
  const entry = mountComponent(name, props);
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  while (mounted.length) {
    const { component, host } = mounted.pop();
    component.$destroy();
    host.remove();
  }
});

// ---------------------------------------------------------------- GAP 1

describe('core runtime values are re-exported (one dependency, not two)', () => {
  it('every promised value is exported by index.js and really exists in core', () => {
    for (const name of CORE_VALUES) {
      expect(indexSource, `index.js must re-export ${name}`).toContain(name);
      expect(typeof core[name], `@chartcraft/core has no runtime export ${name}`).not.toBe(
        'undefined',
      );
    }
    // Sanity on the values themselves, so a rename in core is caught here too.
    expect(core.lightTheme.colorScheme).toBe('light');
    expect(core.darkTheme.colorScheme).toBe('dark');
    expect(typeof core.version).toBe('string');
  });

  it('index.d.ts declares the same value re-exports', () => {
    for (const name of CORE_VALUES) {
      expect(dtsSource, `index.d.ts must declare ${name}`).toContain(name);
    }
  });

  it('uses named re-exports only — never `export *`, which would defeat tree-shaking', () => {
    expect(indexSource).not.toMatch(/^export\s+\*/m);
    expect(dtsSource).not.toMatch(/^export\s+\*/m);
  });

  it('re-exports the graph payload types 0.3.0 left out', () => {
    for (const type of ['GraphData', 'GraphNodeInput', 'GraphLinkInput', 'SeriesKind', 'SeriesData']) {
      expect(dtsSource, `index.d.ts must re-export ${type}`).toContain(type);
    }
  });
});

// ---------------------------------------------------------------- GAP 2

describe('ChartSpec', () => {
  it('is declared options-shaped and backs the per-type props type', () => {
    expect(dtsSource).toContain("export type ChartSpec = Omit<ChartOptions, 'type'>;");
    expect(dtsSource).toMatch(/interface TypedChartProps[^}]*options: ChartSpec;/s);
  });
});

// ---------------------------------------------------------------- GAP 4

describe('onready / on:ready', () => {
  it('calls `onready` with the live instance, once', () => {
    const onready = vi.fn();
    const { component } = mount('LineChart', { options: baseOptions(), onready });
    expect(onready).toHaveBeenCalledTimes(1);
    expect(onready.mock.calls[0][0]).toBe(component.getChart());
    expect(typeof onready.mock.calls[0][0].exportData).toBe('function');
  });

  it('fires on the generic <Chart> too, and the instance is already usable', () => {
    let seen = null;
    mount('Chart', {
      options: { ...baseOptions(), type: 'line' },
      onready: (chart) => {
        seen = chart.exportData();
      },
    });
    expect(typeof seen).toBe('string');
    expect(seen.length).toBeGreaterThan(0);
  });

  it('dispatches a `ready` component event as well, and every alias forwards it', () => {
    expect(chartSource).toContain("dispatch('ready', chart)");
    expect(dtsSource).toContain('ready: CustomEvent<ChartInstance>;');
    for (const name of ['LineChart', 'GaugeChart', 'SankeyChart', 'NetworkChart']) {
      const source = readFileSync(join(SRC, `${name}.svelte`), 'utf8');
      expect(source, `${name} must forward on:ready`).toContain('on:ready');
      expect(source, `${name} must forward {onready}`).toContain('{onready}');
    }
  });
});

describe('Svelte 5 callback props', () => {
  it('every bridged event has a callback prop on <Chart> and on the aliases', () => {
    for (const event of EVENTS) {
      expect(chartSource, `<Chart> must accept on${event}`).toContain(`export let on${event}`);
      const alias = readFileSync(join(SRC, 'LineChart.svelte'), 'utf8');
      expect(alias, `LineChart must forward on${event}`).toContain(`{on${event}}`);
      expect(dtsSource, `index.d.ts must type on${event}`).toContain(`on${event}?:`);
    }
  });

  it('a callback prop and the matching `on:` directive both fire for one event', () => {
    const viaProp = vi.fn();
    const viaDirective = vi.fn();
    const { component } = mount('LineChart', {
      options: { ...baseOptions(), zoom: true },
      onzoom: viaProp,
    });
    component.$on('zoom', (ev) => viaDirective(ev.detail));

    component.getChart().zoomTo({ x: [0, 1] });
    expect(viaProp).toHaveBeenCalledTimes(1);
    expect(viaProp.mock.calls[0][0]).toMatchObject({ x: [0, 1] });
    expect(viaDirective).toHaveBeenCalledTimes(1);
    expect(viaDirective.mock.calls[0][0]).toMatchObject({ x: [0, 1] });
  });

  it('swapping a callback prop does not re-subscribe and the new one is used', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { component } = mount('Chart', {
      options: { ...baseOptions(), type: 'line', zoom: true },
      onzoom: first,
    });
    const chart = component.getChart();

    component.$set({ onzoom: second });
    await tick();
    chart.zoomTo({ x: [0, 1] });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('omitting the callback props is a no-op (no throw)', () => {
    const { component } = mount('LineChart', { options: { ...baseOptions(), zoom: true } });
    expect(() => component.getChart().zoomTo({ x: [0, 1] })).not.toThrow();
  });
});
