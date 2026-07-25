/**
 * The per-type fixture corpus: minimal valid data for every contract chart
 * type, per the contract's per-type data shapes.
 *
 * Extracted from `all-types.smoke.test.ts` so the smoke test, the parameterized
 * a11y conformance audit (`a11y.conformance.test.ts`) and the robustness sweep
 * (`robustness.test.ts`) all drive the SAME 39 fixtures — a type cannot be
 * quietly exempted from one suite by carrying a softer fixture there.
 */
import type { ChartOptions, ChartType } from '../src/index';

const d = (day: number) => Date.UTC(2026, 0, day);

/** Minimal valid data for each type, per the contract's per-type shapes. */
export const FIXTURES: Record<ChartType, Partial<ChartOptions>> = {
  // v0.1
  line: { data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [1, 2, 3] }] } },
  area: { data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [1, 2, 3] }] } },
  bar: { data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [1, 2, 3] }] } },
  scatter: { data: { series: [{ name: 'S', data: [[1, 2], [2, 4], [3, 6]] }] } },
  pie: { data: { series: [{ name: 'S', data: [{ x: 'A', y: 3 }, { x: 'B', y: 2 }] }] } },
  donut: { data: { series: [{ name: 'S', data: [{ x: 'A', y: 3 }, { x: 'B', y: 2 }] }] } },
  // v0.2
  sparkline: { data: { series: [{ name: 'S', data: [1, 3, 2, 5, 4] }] } },
  bubble: { data: { series: [{ name: 'S', data: [[1, 2, 10], [2, 4, 20], [3, 6, 30]] }] } },
  histogram: { data: { series: [{ name: 'S', data: [1, 2, 2, 3, 3, 3, 4, 4, 5, 9] }] } },
  boxplot: {
    // Raw samples per category — no cast needed (`SampleList` is in `DataValue`).
    data: { categories: ['A', 'B'], series: [{ name: 'S', data: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 9]] }] },
  },
  candlestick: { data: { series: [{ name: 'S', data: [[d(1), 10, 12, 9, 11], [d(2), 11, 13, 10, 10]] as never }] } },
  ohlc: { data: { series: [{ name: 'S', data: [[d(1), 10, 12, 9, 11], [d(2), 11, 13, 10, 10]] as never }] } },
  waterfall: {
    data: {
      categories: ['Start', 'Up', 'Down', 'End'],
      series: [{ name: 'S', data: [{ y: 10, isTotal: true }, { y: 5 }, { y: -3 }, { y: 12, isTotal: true }] }],
    },
  },
  heatmap: {
    data: { categories: ['c1', 'c2', 'c3'], series: [{ name: 'r1', data: [1, 2, 3] }, { name: 'r2', data: [3, 2, 1] }] },
  },
  treemap: {
    data: {
      series: [
        {
          name: 'S',
          data: [
            { label: 'A', children: [{ label: 'A1', value: 5 }, { label: 'A2', value: 3 }] },
            { label: 'B', value: 4 },
          ] as never,
        },
      ],
    },
  },
  sunburst: {
    data: {
      series: [
        {
          name: 'S',
          data: [
            { label: 'A', children: [{ label: 'A1', value: 5 }, { label: 'A2', value: 3 }] },
            { label: 'B', value: 4 },
          ] as never,
        },
      ],
    },
  },
  funnel: {
    data: { series: [{ name: 'S', data: [{ x: 'Visit', y: 100 }, { x: 'Trial', y: 40 }, { x: 'Paid', y: 12 }] }] },
  },
  radar: {
    data: { categories: ['a', 'b', 'c', 'd'], series: [{ name: 'S', data: [3, 4, 2, 5] }] },
  },
  gauge: { data: { series: [{ name: 'Utilization', data: [72] }] } },
  // v0.3
  rangearea: { data: { series: [{ name: 'S', data: [[1, 8, 12], [2, 9, 14], [3, 10, 13]] as never }] } },
  bullet: {
    bullet: { ranges: [50, 75, 100] },
    data: { series: [{ name: 'S', data: [{ x: 'Revenue', y: 68, target: 80 }] }] },
  },
  dumbbell: {
    data: { categories: ['A', 'B'], series: [{ name: 'S', data: [{ low: 3, high: 8 }, { low: 5, high: 6 }] as never }] },
  },
  lollipop: { data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [3, 5, 2] }] } },
  slope: {
    data: {
      categories: ['2025', '2026'],
      series: [{ name: 'Alpha', data: [3, 6] }, { name: 'Beta', data: [5, 4] }],
    },
  },
  streamgraph: {
    data: {
      categories: ['t1', 't2', 't3'],
      series: [{ name: 'A', data: [1, 3, 2] }, { name: 'B', data: [2, 1, 4] }],
    },
  },
  marimekko: {
    data: {
      categories: ['c1', 'c2'],
      series: [{ name: 'A', data: [3, 5] }, { name: 'B', data: [2, 4] }],
    },
  },
  pyramid: {
    data: {
      categories: ['0-9', '10-19', '20-29'],
      series: [{ name: 'Male', data: [5, 6, 7] }, { name: 'Female', data: [4, 6, 8] }],
    },
  },
  calendar: {
    data: { series: [{ name: 'S', data: [{ x: new Date(d(1)), y: 2 }, { x: new Date(d(9)), y: 7 }] }] },
  },
  radialbar: { data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [30, 60, 90] }] } },
  rose: { data: { categories: ['N', 'E', 'S', 'W'], series: [{ name: 'S', data: [4, 8, 2, 6] }] } },
  violin: {
    data: {
      categories: ['A', 'B'],
      // Raw samples per category — no cast needed (`SampleList` is in `DataValue`).
      series: [{ name: 'S', data: [[1, 2, 2, 3, 4, 4, 5], [2, 3, 3, 4, 5, 6, 7]] }],
    },
  },
  parallel: {
    parallel: { axes: ['x', 'y', 'z'] },
    data: { series: [{ name: 'A', data: [1, 50, 3] }, { name: 'B', data: [2, 20, 9] }] },
  },
  icicle: {
    data: {
      series: [
        {
          name: 'S',
          data: [
            { label: 'A', children: [{ label: 'A1', value: 5 }, { label: 'A2', value: 3 }] },
            { label: 'B', value: 4 },
          ] as never,
        },
      ],
    },
  },
  circlepack: {
    data: {
      series: [
        {
          name: 'S',
          data: [
            { label: 'A', children: [{ label: 'A1', value: 5 }, { label: 'A2', value: 3 }] },
            { label: 'B', value: 4 },
          ] as never,
        },
      ],
    },
  },
  wordcloud: {
    data: { series: [{ name: 'S', data: [{ x: 'alpha', y: 9 }, { x: 'beta', y: 5 }, { x: 'gamma', y: 2 }] }] },
  },
  sankey: {
    data: {
      series: [
        {
          name: 'S',
          // The contract's graph payload, no cast: `SeriesData` admits it.
          data: {
            nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
            links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }],
          },
        },
      ],
    },
  },
  gantt: {
    data: {
      series: [
        {
          name: 'Plan',
          data: [
            { x: 'Design', start: d(1), end: d(5) },
            { x: 'Build', start: d(5), end: d(12) },
          ] as never,
        },
      ],
    },
  },
  choropleth: {
    choropleth: {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Alpha' },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
          },
          {
            type: 'Feature',
            properties: { name: 'Beta' },
            geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] },
          },
        ],
      },
    },
    data: { series: [{ name: 'S', data: [{ x: 'Alpha', y: 3 }, { x: 'Beta', y: 8 }] }] },
  },
  network: {
    data: {
      series: [
        {
          name: 'S',
          data: {
            nodes: [{ id: 'a', label: 'A', group: 'g1' }, { id: 'b', label: 'B', group: 'g2' }],
            links: [{ source: 'a', target: 'b' }],
          },
        },
      ],
    },
  },
};
