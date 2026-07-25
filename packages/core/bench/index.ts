/**
 * @chartcraft/core benchmark suite.
 *
 *   npm run bench -w @chartcraft/core
 *
 * Measures MOUNT and UPDATE cost per chart type at realistic sizes, plus the
 * pure hot paths (LTTB, scales) and the ingest clone. Prints one table.
 *
 * Scope, stated plainly: this runs against jsdom with a no-op 2D context, so it
 * measures the work the LIBRARY does — ingest, model, downsample, scales, layout,
 * per-type geometry, draw-call issuing — and not rasterization. That makes it the
 * right tool for finding O(n^2) layouts, multi-second layouts, per-frame
 * allocation and ingest-copy costs; it is the wrong tool for a frame rate.
 *
 * Every measurement is a MEDIAN of the stated iteration count after a warm-up.
 * All input is seeded, so a before/after comparison is meaningful.
 */
import { setupDom } from './dom';
import { allRows, bench, heading, heapDelta, printTable, record, rng, time } from './harness';
import { categories, dag, graph, matrix, terms, tree, values, xyTuples } from './data';

// The DOM must exist before `../src/index` is touched: nothing in core reads
// `window` at import time, but `createChart` refuses to run without it.
const dom = setupDom();

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { createChart, downsampleLTTB, LinearScale } from '../src/index';
import type { Chart, ChartOptions } from '../src/index';
import { deepClone } from '../src/util';

const W = 1200;
const H = 700;

/**
 * Mount a chart with animation off (the bench measures work, not interpolation)
 * and — unless a case says otherwise — with the a11y DOM table OFF.
 *
 * Turning the table off is METHODOLOGY, not flattery: building it is a separate,
 * independently measured cost (see the "A11y table" section) that is linear in
 * ROWS while everything else here is linear in POINTS. Leaving it on would mix
 * the two and hide which one moved. Every number in the render sections is
 * therefore "render pipeline only"; add the a11y row for a default-configured
 * chart's true mount cost.
 */
function mountChart(options: ChartOptions): { el: HTMLElement; chart: Chart } {
  const el = dom.container(W, H);
  const chart = createChart(el, {
    theme: 'light',
    animation: false,
    width: W,
    height: H,
    a11y: { table: 'off' },
    ...options,
  } as ChartOptions);
  return { el, chart };
}

/**
 * Time a full mount + destroy cycle, and separately a `setData` update on a
 * live chart. Records two rows.
 */
function mountAndUpdate(
  group: string,
  name: string,
  size: string,
  iterations: number,
  options: ChartOptions,
  updateData?: ChartOptions['data'],
  note?: string,
): void {
  // MOUNT: construct + first paint + teardown.
  bench(group, `${name} mount`, size, iterations, () => {
    const { chart } = mountChart(options);
    chart.destroy();
  }, note !== undefined ? { note } : undefined);

  // UPDATE: a data swap on an already-mounted chart (the steady-state cost).
  const live = mountChart(options);
  try {
    const next = updateData ?? options.data;
    bench(group, `${name} update`, size, iterations, () => {
      live.chart.setData(next);
    });
    bench(group, `${name} resize`, size, Math.max(iterations, 5), () => {
      live.chart.resize();
    });
  } finally {
    live.chart.destroy();
  }
}

console.log('@chartcraft/core benchmarks');
console.log(`node ${process.version} · ${process.platform} ${process.arch} · jsdom host, no-op 2D context`);
console.log('median of N iterations after warm-up; all input seeded (no Math.random)');

// ---------------------------------------------------------------------------
heading('Pure hot paths');

for (const n of [10_000, 100_000, 1_000_000]) {
  const data = xyTuples(n).map(([x, y]) => ({ x, y }));
  bench('pure', 'LTTB -> 1,000 points', n.toLocaleString(), n >= 1_000_000 ? 3 : 10, () => {
    downsampleLTTB(data, 1000);
  }, { units: n });
}

const scale = new LinearScale([0, 1_000_000], [0, 800]);
bench('pure', 'LinearScale.scale', '1,000,000', 10, () => {
  let acc = 0;
  for (let i = 0; i < 1_000_000; i++) acc += scale.scale(i);
  if (acc === Infinity) throw new Error('unreachable');
}, { units: 1_000_000 });

bench('pure', 'nice ticks', '10,000 domains', 10, () => {
  for (let i = 1; i <= 10_000; i++) scale.ticks(5);
}, { units: 10_000 });

// ---------------------------------------------------------------------------
heading('Ingest clone (deepClone on the options payload)');

for (const n of [100_000, 1_000_000]) {
  const tuples = xyTuples(n);
  bench('ingest', 'deepClone tuple data [x,y][]', n.toLocaleString(), 3, () => {
    deepClone({ series: [{ name: 'S', data: tuples }] });
  }, { units: n, note: 'array spine + per-tuple copy' });

  const objects = tuples.map(([x, y]) => ({ x, y }));
  bench('ingest', 'deepClone object data {x,y}[]', n.toLocaleString(), 3, () => {
    deepClone({ series: [{ name: 'S', data: objects }] });
  }, { units: n, note: 'one object allocated per datum' });

  const flat = new Array<number>(n);
  for (let i = 0; i < n; i++) flat[i] = i;
  bench('ingest', 'deepClone number[]', n.toLocaleString(), 3, () => {
    deepClone({ series: [{ name: 'S', data: flat }] });
  }, { units: n, note: 'spine only (documented fast path)' });
}

// ---------------------------------------------------------------------------
heading('Cartesian at scale: downsampling on vs off');

for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
  const data = xyTuples(n);
  // `line` carries the full size sweep; `area` and `scatter` are sampled at the
  // two sizes where the paths diverge (fill construction, per-point markers).
  const types = n >= 100_000 ? (['line', 'area', 'scatter'] as const) : (['line'] as const);
  for (const type of types) {
    for (const ds of [true, false]) {
      const iterations = n >= 1_000_000 ? 3 : n >= 100_000 ? 5 : 10;
      mountAndUpdate(
        'cartesian',
        `${type} ds=${ds ? 'on' : 'off'}`,
        n.toLocaleString(),
        iterations,
        {
          type,
          downsample: { enabled: ds, threshold: 5000 },
          data: { series: [{ name: 'S', data }] },
        } as ChartOptions,
      );
    }
  }
}

// ---------------------------------------------------------------------------
heading('Per-type layouts at realistic sizes');

mountAndUpdate('types', 'bar (1k categories)', '1,000', 10, {
  type: 'bar',
  data: { categories: categories(1000), series: [{ name: 'S', data: values(1000) }] },
} as ChartOptions);

mountAndUpdate('types', 'bar stacked x8 (1k categories)', '8,000', 5, {
  type: 'bar',
  stacked: true,
  data: {
    categories: categories(1000),
    series: Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, data: values(1000, i + 10) })),
  },
} as ChartOptions);

mountAndUpdate('types', 'heatmap (100x100 cells)', '10,000', 5, {
  type: 'heatmap',
  data: matrix(100, 100),
} as ChartOptions);

mountAndUpdate('types', 'heatmap (300x300 cells)', '90,000', 3, {
  type: 'heatmap',
  data: matrix(300, 300),
} as ChartOptions, undefined, 'scaling check for the matrix path');

mountAndUpdate('types', 'sankey (200 nodes / 500 links)', '200/500', 5, {
  type: 'sankey',
  data: { series: [{ name: 'flow', data: dag(200, 500) }] },
} as ChartOptions);

mountAndUpdate('types', 'sankey (400 nodes / 1000 links)', '400/1000', 3, {
  type: 'sankey',
  data: { series: [{ name: 'flow', data: dag(400, 1000) }] },
} as ChartOptions, undefined, 'scaling check for crossing reduction');

mountAndUpdate('types', 'network (500 nodes)', '500/1500', 3, {
  type: 'network',
  data: { series: [{ name: 'g', data: graph(500, 1500) }] },
} as ChartOptions);

mountAndUpdate('types', 'network (1000 nodes)', '1000/3000', 3, {
  type: 'network',
  data: { series: [{ name: 'g', data: graph(1000, 3000) }] },
} as ChartOptions, undefined, 'scaling check for the force layout');

for (const type of ['treemap', 'circlepack', 'icicle', 'sunburst'] as const) {
  mountAndUpdate('types', `${type} (2k leaves)`, '2,000', 3, {
    type,
    data: { series: [{ name: 'tree', data: tree(2000) as never }] },
  } as ChartOptions);
}

mountAndUpdate('types', 'wordcloud (500 terms)', '500', 3, {
  type: 'wordcloud',
  data: { series: [{ name: 'terms', data: terms(500) as never }] },
} as ChartOptions);

mountAndUpdate('types', 'wordcloud (1500 terms)', '1,500', 3, {
  type: 'wordcloud',
  data: { series: [{ name: 'terms', data: terms(1500) as never }] },
} as ChartOptions, undefined, 'scaling check for spiral placement');

mountAndUpdate('types', 'calendar (3 years of days)', '1,095', 5, {
  type: 'calendar',
  data: {
    series: [
      {
        name: 'commits',
        data: Array.from({ length: 1095 }, (_, i) => ({
          x: new Date(Date.UTC(2024, 0, 1 + i)),
          y: Math.round(rng(9 + i)() * 20),
        })),
      },
    ],
  },
} as ChartOptions);

mountAndUpdate('types', 'violin (20 x 5k samples)', '100,000', 3, {
  type: 'violin',
  data: {
    categories: categories(20),
    series: [{ name: 'S', data: Array.from({ length: 20 }, (_, i) => values(5000, i + 40)) as never }],
  },
} as ChartOptions);

mountAndUpdate('types', 'gantt (2k tasks)', '2,000', 3, {
  type: 'gantt',
  data: {
    series: [
      {
        name: 'plan',
        data: Array.from({ length: 2000 }, (_, i) => ({
          x: `task-${i}`,
          start: Date.UTC(2026, 0, 1 + (i % 300)),
          end: Date.UTC(2026, 0, 4 + (i % 300)),
          group: `phase-${i % 20}`,
        })) as never,
      },
    ],
  },
} as ChartOptions);

// ---------------------------------------------------------------------------
heading('Zoom: does downsampling re-run inside the viewport?');
{
  const data = xyTuples(1_000_000);
  const { chart } = mountChart({
    type: 'line',
    zoom: true,
    downsample: { enabled: true, threshold: 5000 },
    data: { series: [{ name: 'S', data }] },
  } as ChartOptions);
  try {
    bench('zoom', 'zoomTo 0.1% window of 1M', '1,000,000', 5, () => {
      chart.zoomTo({ x: [400_000, 401_000] });
    });
    bench('zoom', 'zoomTo reset from 1M', '1,000,000', 5, () => {
      chart.zoomTo(null);
    });
  } finally {
    chart.destroy();
  }
}

// ---------------------------------------------------------------------------
heading('Allocation: is a redraw allocation-free?');
{
  const data = xyTuples(100_000);
  const { chart } = mountChart({
    type: 'line',
    downsample: { enabled: true, threshold: 5000 },
    data: { series: [{ name: 'S', data }] },
  } as ChartOptions);
  try {
    // 200 redraws of an unchanged chart. A truly allocation-free redraw path
    // shows a heap delta near zero; a large delta means per-frame garbage.
    const mb = heapDelta(() => {
      for (let i = 0; i < 200; i++) chart.resize();
    });
    record({
      group: 'alloc',
      case: '200 redraws, 100k points (downsampled)',
      n: '200 frames',
      ms: 0,
      note: `heap delta ${mb.toFixed(1)} MB (${((mb * 1024) / 200).toFixed(1)} KB/frame)`,
    });
  } finally {
    chart.destroy();
  }
}

// ---------------------------------------------------------------------------
heading('A11y table: what the accessible layer costs on top of the render');
for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
  const data = xyTuples(n);
  const opts = (table: 'off' | 'hidden'): ChartOptions =>
    ({ type: 'line', a11y: { table }, data: { series: [{ name: 'S', data }] } }) as ChartOptions;

  // The delta between these two rows IS the accessible layer's mount cost:
  // building the FULL-fidelity table spec (one row object per datum, a string
  // per cell) plus materializing up to A11Y_TABLE_MAX_ROWS <tr> nodes.
  const iterations = n >= 1_000_000 ? 3 : 5;
  bench('a11y', 'mount, table off', n.toLocaleString(), iterations, () => {
    const { chart } = mountChart(opts('off'));
    chart.destroy();
  });
  bench('a11y', "mount, table 'hidden' (the DEFAULT)", n.toLocaleString(), iterations, () => {
    const { chart } = mountChart(opts('hidden'));
    chart.destroy();
  }, { note: 'delta vs the row above = the a11y layer' });

  // A resize must NOT rebuild the table (it is cached against the data).
  const live = mountChart(opts('hidden'));
  try {
    bench('a11y', 'resize with the table mounted', n.toLocaleString(), 5, () => {
      live.chart.resize();
    }, { note: 'table is cached, so this must not scale with rows' });
    bench('a11y', 'exportData(csv) — FULL data, uncapped', n.toLocaleString(), 3, () => {
      live.chart.exportData({ format: 'csv' });
    }, { units: n });
  } finally {
    live.chart.destroy();
  }
}

// ---------------------------------------------------------------------------
printTable();
console.log(`${allRows().length} measurements. Draw calls issued during the run: ${dom.drawCount().toLocaleString()}.`);
void time;
