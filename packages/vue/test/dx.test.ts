/**
 * 0.3.1 DX fixes, against the real @chartcraft/core:
 *
 * - GAP 1: core's runtime values (themes, palette, scales, decorators, version)
 *   are reachable from `@chartcraft/vue` alone, and the type re-export list is
 *   complete (`GraphData` & friends were missing in 0.3.0).
 * - GAP 2: `ChartSpec` is the options-shaped spec type, spelled identically in
 *   every wrapper, with `TypedChartOptions` kept as a deprecated alias.
 * - GAP 3 (the React `useMemo` trap): documents what Vue actually does with a
 *   new-but-equal `options` object, so the wrapper's contract is pinned.
 * - GAP 4: a parent's `onMounted` can already reach the instance — no `ready`
 *   affordance is needed here (unlike Svelte/Angular).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, onMounted, ref, shallowRef, type App } from 'vue';
import * as api from '../src/index';
import { LineChart, type ChartExposed, type ChartInstance, type ChartSpec, type GraphData } from '../src/index';
import './setup';

const apps: App[] = [];
const hosts: HTMLElement[] = [];

function mount(root: Parameters<typeof createApp>[0]): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(root);
  app.config.warnHandler = () => undefined;
  app.mount(host);
  apps.push(app);
  hosts.push(host);
  return host;
}

const spec = (): ChartSpec => ({
  theme: 'light',
  animation: false,
  width: 600,
  height: 400,
  data: { categories: ['a', 'b', 'c'], series: [{ name: 'One', data: [1, 2, 3] }] },
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  while (hosts.length) hosts.pop()!.remove();
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
    api.registerDecorator({ id: 'vue-dx-probe', layer: 'over', draw: () => undefined });
    expect(api.decorators().some((d) => d.id === 'vue-dx-probe')).toBe(true);
    api.unregisterDecorator('vue-dx-probe');
    expect(api.decorators().some((d) => d.id === 'vue-dx-probe')).toBe(false);
    expect(typeof api.clearDecorators).toBe('function');
  });

  it('re-exports the graph payload types that 0.3.0 left out', () => {
    // Compile-time assertion: `GraphData` etc. resolve from the wrapper alone.
    const graph: GraphData = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      links: [{ source: 'a', target: 'b', value: 5 }],
    };
    expect(graph.nodes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- GAP 2

describe('ChartSpec', () => {
  it('is options-shaped (no `type`) and binds to a per-type component', async () => {
    const exposed = shallowRef<ChartExposed | null>(null);
    mount({ render: () => h(LineChart, { options: { ...spec(), title: 'Revenue' }, ref: exposed }) });
    await nextTick();
    expect(exposed.value!.chart!.getOptions().type).toBe('line');
    expect(exposed.value!.chart!.getOptions().title).toBe('Revenue');
  });

  it('TypedChartOptions is still exported as the deprecated alias of ChartSpec', () => {
    // Compile-time: assignable in both directions, so 0.3.0 code keeps working.
    const asOld: api.TypedChartOptions = spec();
    const asNew: ChartSpec = asOld;
    expect(asNew.width).toBe(600);
  });
});

// ---------------------------------------------------------------- GAP 3

describe('the identity trap, for the record', () => {
  it('a new-but-equal `options` object DOES re-enter chart.update() (deep watch fires on the reference change)', async () => {
    const options = ref<ChartSpec>(spec());
    const exposed = shallowRef<ChartExposed | null>(null);
    mount({ render: () => h(LineChart, { options: options.value, ref: exposed }) });
    await nextTick();
    const update = vi.spyOn(exposed.value!.chart as ChartInstance, 'update');

    options.value = spec(); // same contents, new reference
    await nextTick();
    expect(update).toHaveBeenCalledTimes(1);

    // …but Vue's deep watch means a MUTATION is picked up too, which is why the
    // Vue wrapper has no React-style "you must memoise" cliff: the safe way to
    // keep a stable reference (a `ref`/`computed`/`reactive`) is also the
    // idiomatic way to write Vue, and mutating it still works.
    (options.value.data!.series as { name: string; data: number[] }[])[0]!.data = [9, 9, 9];
    await nextTick();
    expect(update).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- GAP 4

describe('instance availability', () => {
  it("the child's chart already exists when the PARENT's onMounted runs", async () => {
    const seen: (ChartInstance | null | undefined)[] = [];
    mount({
      setup() {
        const chartRef = shallowRef<ChartExposed | null>(null);
        onMounted(() => seen.push(chartRef.value?.chart));
        return () => h(LineChart, { options: spec(), ref: chartRef });
      },
    });
    await nextTick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeTruthy();
    expect(typeof seen[0]!.exportData).toBe('function');
  });
});
