/**
 * Data for the visual gallery on /examples/.
 *
 * Every entry is a REAL `ChartOptions` payload for one of the 39 chart types
 * (plus `combo`, which is not a type — it is a per-series mark override, and
 * its card says so). Datasets are deliberately tiny: a card is 200px tall, so
 * the shape has to read at a glance, and 40 live charts on one page must stay
 * cheap. `GalleryCard` adds the chrome-light overrides (no legend, no tooltip,
 * no animation, no a11y table) so they are not repeated 40 times here.
 */
import type { ChartOptions, GeoFeatureCollection } from '@chartcraft/vue';

export interface GalleryEntry {
  /** Card caption. */
  name: string;
  /** Relative link to the example page (from /examples/). */
  link: string;
  /** One short line under the name. */
  blurb: string;
  options: Omit<ChartOptions, 'theme'>;
}

export interface GalleryFamily {
  id: string;
  title: string;
  entries: GalleryEntry[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Deterministic pseudo-random helper (no Math.random anywhere in the docs). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const histogramSamples = (() => {
  const rnd = seeded(9);
  return Array.from({ length: 260 }, () => {
    const bell = 34 + (rnd() + rnd() + rnd() + rnd() - 2) * 24;
    return Math.round(Math.max(4, bell + (rnd() < 0.06 ? rnd() * 60 : 0)));
  });
})();

const calendarDays = (() => {
  const rnd = seeded(23);
  const out: { x: Date; y: number }[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 120; i++) {
    const ms = start + i * 86_400_000;
    const weekday = new Date(ms).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const r = rnd();
    if (weekend && r < 0.7) continue;
    out.push({ x: new Date(ms), y: weekend ? 1 : 2 + Math.round(r * 9) });
  }
  return out;
})();

const territories: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Northmark' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 48], [6, 48], [6, 52], [2, 53], [0, 52], [0, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Easthaven' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 48], [12, 48], [13, 51], [10, 52.5], [6, 52], [6, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Westford' },
      geometry: { type: 'Polygon', coordinates: [[[0, 44], [6, 44], [6, 48], [0, 48], [0, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Midvale' },
      geometry: { type: 'Polygon', coordinates: [[[6, 44], [12, 44], [12, 48], [6, 48], [6, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Southgate' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 40], [6, 40], [6, 44], [0, 44], [-0.5, 42], [0, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Portsea' },
      geometry: { type: 'Polygon', coordinates: [[[6, 40], [12, 41], [12, 44], [6, 44], [6, 40]]] },
    },
  ],
};

const d = (day: number) => new Date(Date.UTC(2026, 5, day));

export const galleryFamilies: GalleryFamily[] = [
  {
    id: 'trends',
    title: 'Trends & comparison',
    entries: [
      {
        name: 'Line',
        link: 'line',
        blurb: 'Trends over time',
        options: {
          type: 'line',
          data: {
            categories: MONTHS,
            series: [
              {
                id: 'a',
                name: 'Enterprise',
                curve: 'monotone',
                showMarkers: false,
                data: [182, 194, 201, 216, 228, 245, 259, 271, 290, 308, 331, 356],
              },
              {
                id: 'b',
                name: 'Team',
                curve: 'monotone',
                showMarkers: false,
                data: [104, 109, 117, 121, 130, 136, 145, 149, 158, 167, 172, 181],
              },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Area',
        link: 'area',
        blurb: 'Stacked composition',
        options: {
          type: 'area',
          stacked: true,
          data: {
            categories: MONTHS,
            series: [
              { id: 'a', name: 'Web', showMarkers: false, data: [42, 46, 51, 55, 58, 61, 66, 71, 74, 79, 84, 90] },
              { id: 'b', name: 'Mobile', showMarkers: false, data: [18, 21, 24, 28, 33, 38, 42, 47, 51, 56, 62, 68] },
              { id: 'c', name: 'API', showMarkers: false, data: [9, 11, 12, 14, 16, 18, 21, 24, 26, 29, 32, 35] },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Bar',
        link: 'bar',
        blurb: 'Grouped categories',
        options: {
          type: 'bar',
          data: {
            categories: QUARTERS,
            series: [
              { id: 'a', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
              { id: 'b', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Scatter',
        link: 'scatter',
        blurb: 'Two numeric dimensions',
        options: {
          type: 'scatter',
          data: {
            series: [
              {
                id: 'a',
                name: 'Cohort A',
                data: [
                  [4, 18], [7, 24], [9, 21], [12, 33], [14, 29], [17, 41],
                  [19, 38], [22, 47], [24, 44], [27, 55],
                ],
              },
              {
                id: 'b',
                name: 'Cohort B',
                data: [
                  [5, 34], [8, 31], [11, 42], [13, 37], [16, 48],
                  [18, 45], [21, 57], [25, 52], [28, 63],
                ],
              },
            ],
          },
          xAxis: { min: 0, ticks: { count: 3 } },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Bubble',
        link: 'bubble',
        blurb: 'Scatter plus a size channel',
        options: {
          type: 'bubble',
          data: {
            series: [
              {
                id: 'paid',
                name: 'Paid',
                sizeRange: [8, 30],
                data: [
                  { x: 18, y: 240, r: 320 },
                  { x: 26, y: 310, r: 480 },
                  { x: 9, y: 90, r: 150 },
                  { x: 14, y: 150, r: 610 },
                ],
              },
              {
                id: 'owned',
                name: 'Owned',
                sizeRange: [8, 30],
                data: [
                  { x: 6, y: 180, r: 260 },
                  { x: 11, y: 260, r: 140 },
                  { x: 4, y: 120, r: 90 },
                  { x: 8, y: 95, r: 400 },
                ],
              },
            ],
          },
          xAxis: { min: 0, ticks: { count: 3 } },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Lollipop',
        link: 'lollipop',
        blurb: "A bar's encoding, less ink",
        options: {
          type: 'lollipop',
          data: {
            categories: ['Views', 'Bulk', 'Alerts', 'Tokens', 'Audit', 'SSO'],
            series: [{ id: 'a', name: 'Adoption', data: [68.4, 54.1, 47.9, 31.2, 22.5, 18.3] }],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Slope',
        link: 'slope',
        blurb: 'Two stages, rank changes',
        options: {
          type: 'slope',
          data: {
            categories: ['2023', '2025'],
            series: [
              { id: 'a', name: 'Organic', data: [31, 24] },
              { id: 'b', name: 'Partners', data: [12, 26] },
              { id: 'c', name: 'Paid', data: [24, 15] },
              { id: 'd', name: 'Referrals', data: [18, 22] },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Dumbbell',
        link: 'dumbbell',
        blurb: 'Before/after, gap is the point',
        options: {
          type: 'dumbbell',
          data: {
            categories: ['Starter', 'Growth', 'Business', 'Enterprise'],
            series: [
              {
                id: 'acv',
                name: 'ACV',
                lowKey: '2021',
                highKey: '2025',
                data: [
                  { low: 4.8, high: 7.1 },
                  { low: 12.6, high: 21.4 },
                  { low: 34.2, high: 58.9 },
                  { low: 96.5, high: 142.3 },
                ],
              },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Range area',
        link: 'rangearea',
        blurb: 'A low–high band',
        options: {
          type: 'rangearea',
          data: {
            categories: MONTHS.slice(0, 8),
            series: [
              {
                id: 'ci',
                name: 'Interval',
                data: [
                  { low: 3.3, high: 3.5 },
                  { low: 3.4, high: 3.72 },
                  { low: 3.5, high: 3.95 },
                  { low: 3.62, high: 4.24 },
                  { low: 3.7, high: 4.5 },
                  { low: 3.78, high: 4.82 },
                  { low: 3.84, high: 5.1 },
                  { low: 3.88, high: 5.42 },
                ],
              },
              {
                id: 'mrr',
                name: 'MRR',
                data: [3.41, 3.58, 3.72, 3.94, 4.13, 4.28, 4.45, 4.6],
              },
            ],
          },
          yAxis: { min: 3, ticks: { count: 3 } },
        },
      },
    ],
  },
  {
    id: 'part-to-whole',
    title: 'Part-to-whole & composition',
    entries: [
      {
        name: 'Pie',
        link: 'pie',
        blurb: 'Shares of a total',
        options: {
          type: 'pie',
          data: {
            series: [
              {
                id: 'a',
                name: 'Revenue',
                data: [
                  { x: 'Enterprise', y: 46 },
                  { x: 'Mid-market', y: 27 },
                  { x: 'SMB', y: 18 },
                  { x: 'Self-serve', y: 9 },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Donut',
        link: 'pie',
        blurb: 'A pie with a hole for a total',
        options: {
          type: 'donut',
          data: {
            series: [
              {
                id: 'a',
                name: 'Spend',
                data: [
                  { x: 'Compute', y: 41 },
                  { x: 'Storage', y: 24 },
                  { x: 'Network', y: 17 },
                  { x: 'Databases', y: 12 },
                  { x: 'Other', y: 6 },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Funnel',
        link: 'funnel',
        blurb: 'Ordered stage drop-off',
        options: {
          type: 'funnel',
          data: {
            series: [
              {
                id: 'a',
                name: 'Prospects',
                data: [
                  { x: 'Visited', y: 48200 },
                  { x: 'Trial', y: 9600 },
                  { x: 'Activated', y: 5200 },
                  { x: 'Subscribed', y: 1900 },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Pyramid',
        link: 'pyramid',
        blurb: 'Two groups mirrored',
        options: {
          type: 'pyramid',
          data: {
            categories: ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'],
            series: [
              { id: 'a', name: 'Permanent', data: [64, 412, 508, 331, 148, 27] },
              { id: 'b', name: 'Contract', data: [96, 218, 174, 96, 51, 22] },
            ],
          },
          // A mirrored axis draws BOTH halves' ticks; at 240px they collide
          // into a smear. Blanking the labels keeps the silhouette, which is
          // all a 190px preview can honestly carry.
          xAxis: { ticks: { format: () => '' } },
        },
      },
      {
        name: 'Marimekko',
        link: 'marimekko',
        blurb: 'Two proportions at once',
        options: {
          type: 'marimekko',
          data: {
            categories: ['SMB', 'Mid', 'Ent', 'Public'],
            series: [
              {
                id: 'a',
                name: 'Platform',
                data: [
                  { y: 8.2, r: 14.6 },
                  { y: 15.4, r: 31.2 },
                  { y: 26.1, r: 62.8 },
                  { y: 5.3, r: 11.4 },
                ],
              },
              { id: 'b', name: 'Analytics', data: [3.1, 8.9, 21.4, 2.6] },
              { id: 'c', name: 'Services', data: [1.4, 4.2, 12.7, 2.9] },
            ],
          },
        },
      },
      {
        name: 'Streamgraph',
        link: 'streamgraph',
        blurb: 'Composition on a wiggle baseline',
        options: {
          type: 'streamgraph',
          data: {
            categories: MONTHS,
            series: [
              { id: 'a', name: 'Email', data: [820, 790, 810, 760, 700, 640, 610, 590, 620, 660, 690, 710] },
              { id: 'b', name: 'Chat', data: [310, 360, 420, 500, 580, 640, 700, 760, 810, 880, 940, 1010] },
              { id: 'c', name: 'Phone', data: [240, 235, 250, 230, 220, 205, 190, 185, 195, 210, 225, 240] },
              { id: 'd', name: 'Community', data: [90, 120, 160, 190, 230, 280, 340, 380, 410, 430, 460, 500] },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'statistical',
    title: 'Statistical',
    entries: [
      {
        name: 'Histogram',
        link: 'histogram',
        blurb: 'A distribution, auto-binned',
        options: {
          type: 'histogram',
          histogram: { bins: 14 },
          data: { series: [{ id: 'a', name: 'Orders', data: histogramSamples }] },
          xAxis: { ticks: { count: 3 } },
          yAxis: { ticks: { count: 3 } },
        },
      },
      {
        name: 'Boxplot',
        link: 'boxplot',
        blurb: 'Five-number summaries',
        options: {
          type: 'boxplot',
          data: {
            categories: ['US', 'EU', 'AP', 'SA'],
            series: [
              {
                id: 'a',
                name: 'Latency',
                data: [
                  [118, 124, 131, 137, 141, 146, 152, 158, 166, 171, 183, 197, 340],
                  [141, 149, 155, 162, 168, 174, 179, 186, 194, 205, 219, 238],
                  [173, 181, 190, 198, 207, 214, 226, 238, 251, 267, 290, 452],
                  [201, 213, 224, 236, 247, 259, 270, 284, 301, 322, 348],
                ],
              },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Violin',
        link: 'violin',
        blurb: 'The whole distribution shape',
        options: {
          type: 'violin',
          violin: { bandwidth: 'auto', showBox: true },
          data: {
            categories: ['Desktop', 'Tablet', 'Phone'],
            series: [
              {
                id: 'a',
                name: 'LCP',
                data: [
                  [740, 780, 810, 830, 860, 880, 890, 910, 920, 940, 960, 980, 1010, 1040, 1080, 1120, 1180, 1260, 1390, 1620],
                  [980, 1040, 1080, 1120, 1160, 1200, 1240, 1280, 1320, 1360, 1420, 1480, 1560, 1660, 1780, 1940, 2160, 2480],
                  [1980, 2140, 2280, 2410, 2530, 2660, 2790, 2930, 3080, 3260, 3480, 3760, 4120, 4580, 5180],
                ],
              },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Parallel coordinates',
        link: 'parallel',
        blurb: 'Multivariate records',
        options: {
          type: 'parallel',
          parallel: { axes: ['ARR', 'Seats', 'WAU', 'NPS', 'Churn'] },
          data: {
            series: [
              { id: 'a', name: 'Starter', data: [4.8, 6, 41, 12, 14.2] },
              { id: 'b', name: 'Growth', data: [21.4, 24, 58, 34, 8.6] },
              { id: 'c', name: 'Business', data: [58.9, 85, 67, 41, 5.1] },
              { id: 'd', name: 'Enterprise', data: [142.3, 320, 74, 47, 2.4] },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'financial',
    title: 'Financial & targets',
    entries: [
      {
        name: 'Candlestick',
        link: 'candlestick',
        blurb: 'Open/high/low/close',
        options: {
          type: 'candlestick',
          data: {
            series: [
              {
                id: 'a',
                name: 'ACME',
                data: [
                  [d(1), 84.2, 86.1, 83.6, 85.4],
                  [d(2), 85.4, 87.3, 85.0, 86.9],
                  [d(3), 86.9, 87.4, 84.8, 85.1],
                  [d(4), 85.1, 85.9, 83.2, 83.7],
                  [d(5), 83.7, 84.6, 82.1, 84.3],
                  [d(8), 84.3, 86.8, 84.3, 86.5],
                  [d(9), 86.5, 88.9, 86.2, 88.4],
                  [d(10), 88.4, 89.2, 87.1, 87.6],
                  [d(11), 87.6, 88.1, 85.9, 86.2],
                  [d(12), 86.2, 87.7, 85.8, 87.5],
                ],
              },
            ],
          },
          xAxis: { ticks: { count: 3 } },
          yAxis: { ticks: { count: 3 } },
        },
      },
      {
        name: 'OHLC',
        link: 'candlestick',
        blurb: 'The same data, less ink',
        options: {
          type: 'ohlc',
          data: {
            series: [
              {
                id: 'a',
                name: 'ACME',
                data: [
                  [d(1), 84.2, 86.1, 83.6, 85.4],
                  [d(2), 85.4, 87.3, 85.0, 86.9],
                  [d(3), 86.9, 87.4, 84.8, 85.1],
                  [d(4), 85.1, 85.9, 83.2, 83.7],
                  [d(5), 83.7, 84.6, 82.1, 84.3],
                  [d(8), 84.3, 86.8, 84.3, 86.5],
                  [d(9), 86.5, 88.9, 86.2, 88.4],
                  [d(10), 88.4, 89.2, 87.1, 87.6],
                  [d(11), 87.6, 88.1, 85.9, 86.2],
                  [d(12), 86.2, 87.7, 85.8, 87.5],
                ],
              },
            ],
          },
          xAxis: { ticks: { count: 3 } },
          yAxis: { ticks: { count: 3 } },
        },
      },
      {
        name: 'Waterfall',
        link: 'waterfall',
        blurb: 'How deltas walk a total',
        options: {
          type: 'waterfall',
          data: {
            series: [
              {
                id: 'a',
                name: 'Bridge',
                data: [
                  { x: 'FY25', y: 8.4, isTotal: true },
                  { x: 'Product', y: 2.1 },
                  { x: 'Services', y: 0.6 },
                  { x: 'COGS', y: -1.3 },
                  { x: 'Opex', y: -0.9 },
                  { x: 'FY26', y: 8.9, isTotal: true },
                ],
              },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Bullet',
        link: 'bullet',
        blurb: 'Value vs target vs bands',
        options: {
          type: 'bullet',
          bullet: { ranges: [70, 90, 115], target: 100 },
          data: {
            series: [
              {
                id: 'a',
                name: 'Attainment',
                data: [
                  { x: 'New ARR', y: 108 },
                  { x: 'Expansion', y: 94 },
                  { x: 'Retention', y: 101, target: 105 },
                  { x: 'CSAT', y: 87 },
                ],
              },
            ],
          },
          xAxis: { ticks: { count: 3 } },
        },
      },
    ],
  },
  {
    id: 'hierarchy',
    title: 'Hierarchy & matrix',
    entries: [
      {
        name: 'Treemap',
        link: 'treemap',
        blurb: 'Nested part-to-whole by area',
        options: {
          type: 'treemap',
          data: {
            series: [
              {
                id: 'a',
                name: 'Revenue',
                data: [
                  {
                    label: 'Platform',
                    children: [
                      { label: 'Subscriptions', value: 46.2 },
                      { label: 'Overages', value: 11.8 },
                      { label: 'Support', value: 7.4 },
                    ],
                  },
                  {
                    label: 'Services',
                    children: [
                      { label: 'Consulting', value: 14.6 },
                      { label: 'Training', value: 5.2 },
                    ],
                  },
                  {
                    label: 'Marketplace',
                    children: [
                      { label: 'Rev share', value: 8.9 },
                      { label: 'Listings', value: 2.3 },
                    ],
                  },
                  { label: 'Other', value: 3.6 },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Sunburst',
        link: 'sunburst',
        blurb: 'Hierarchy as rings',
        options: {
          type: 'sunburst',
          data: {
            series: [
              {
                id: 'a',
                name: 'Sessions',
                data: [
                  {
                    label: 'Search',
                    children: [
                      { label: 'Organic', value: 412 },
                      { label: 'Paid', value: 186 },
                    ],
                  },
                  {
                    label: 'Social',
                    children: [
                      { label: 'Organic', value: 118 },
                      { label: 'Paid', value: 94 },
                    ],
                  },
                  { label: 'Direct', value: 231 },
                  {
                    label: 'Referral',
                    children: [
                      { label: 'Partners', value: 57 },
                      { label: 'Press', value: 34 },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Icicle',
        link: 'icicle',
        blurb: 'Hierarchy as rows',
        options: {
          type: 'icicle',
          data: {
            series: [
              {
                id: 'a',
                name: 'Spend',
                data: [
                  {
                    label: 'Compute',
                    children: [
                      { label: 'API', value: 148 },
                      { label: 'Batch', value: 92 },
                      { label: 'ML', value: 64 },
                    ],
                  },
                  {
                    label: 'Storage',
                    children: [
                      { label: 'Objects', value: 78 },
                      { label: 'Warehouse', value: 54 },
                    ],
                  },
                  {
                    label: 'Network',
                    children: [
                      { label: 'Egress', value: 46 },
                      { label: 'CDN', value: 31 },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Circle packing',
        link: 'circlepack',
        blurb: 'Nesting by enclosure',
        options: {
          type: 'circlepack',
          data: {
            series: [
              {
                id: 'a',
                name: 'Bundle',
                data: [
                  {
                    label: 'app',
                    children: [
                      { label: 'routes', value: 64 },
                      { label: 'views', value: 48 },
                      { label: 'state', value: 22 },
                    ],
                  },
                  {
                    label: 'design',
                    children: [
                      { label: 'components', value: 58 },
                      { label: 'icons', value: 36 },
                    ],
                  },
                  {
                    label: 'charts',
                    children: [
                      { label: 'core', value: 42 },
                      { label: 'types', value: 27 },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Heatmap',
        link: 'heatmap',
        blurb: 'A matrix on a sequential ramp',
        options: {
          type: 'heatmap',
          data: {
            categories: ['00', '04', '08', '12', '16', '20'],
            series: [
              { id: 'mon', name: 'Mon', data: [4, 9, 38, 46, 27, 11] },
              { id: 'tue', name: 'Tue', data: [3, 8, 41, 44, 25, 10] },
              { id: 'wed', name: 'Wed', data: [4, 10, 43, 47, 28, 12] },
              { id: 'thu', name: 'Thu', data: [3, 9, 39, 42, 26, 11] },
              { id: 'fri', name: 'Fri', data: [5, 8, 34, 31, 18, 9] },
              { id: 'sat', name: 'Sat', data: [6, 5, 12, 15, 13, 8] },
            ],
          },
        },
      },
      {
        name: 'Calendar',
        link: 'calendar',
        blurb: 'A day per cell',
        options: {
          type: 'calendar',
          calendar: {
            start: new Date(Date.UTC(2026, 0, 1)),
            end: new Date(Date.UTC(2026, 3, 30)),
            weekStart: 1,
          },
          data: { series: [{ id: 'a', name: 'Deploys', data: calendarDays }] },
        },
      },
    ],
  },
  {
    id: 'radial',
    title: 'Radial',
    entries: [
      {
        name: 'Radar',
        link: 'radar',
        blurb: 'Profiles across shared spokes',
        options: {
          type: 'radar',
          data: {
            categories: ['Perf', 'Security', 'Support', 'Docs', 'Price', 'Ecosystem'],
            series: [
              { id: 'a', name: 'Vendor A', data: [8.4, 7.2, 6.1, 8.8, 5.6, 7.9] },
              { id: 'b', name: 'Vendor B', data: [6.9, 8.6, 8.2, 6.4, 7.8, 5.7] },
            ],
          },
        },
      },
      {
        name: 'Gauge',
        link: 'gauge',
        blurb: 'One value, bounded range',
        options: {
          type: 'gauge',
          gauge: {
            min: 0,
            max: 100,
            bands: [
              { to: 60, color: '#0ca30c' },
              { to: 85, color: '#c98500' },
              { to: 100, color: '#d03b3b' },
            ],
          },
          data: { series: [{ id: 'a', name: 'Utilization', data: [72] }] },
        },
      },
      {
        name: 'Radial bar',
        link: 'radialbar',
        blurb: 'Concentric arcs, shared max',
        options: {
          type: 'radialbar',
          radialbar: { innerRadius: 0.3, maxValue: 120, track: true },
          data: {
            categories: ['EMEA N', 'EMEA S', 'AMER E', 'AMER W', 'APAC'],
            series: [{ id: 'a', name: 'Attainment', data: [112, 96, 104, 88, 71] }],
          },
        },
      },
      {
        name: 'Rose',
        link: 'rose',
        blurb: 'Cyclical categories, area ∝ value',
        options: {
          type: 'rose',
          rose: { startAngle: 0 },
          data: {
            categories: MONTHS,
            series: [
              {
                id: 'a',
                name: 'Orders',
                data: [18.2, 15.4, 19.1, 22.6, 26.3, 24.8, 21.5, 20.9, 25.4, 29.7, 41.2, 48.6],
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'flow',
    title: 'Flow & schedule',
    entries: [
      {
        name: 'Sankey',
        link: 'sankey',
        blurb: 'Where a conserved quantity goes',
        options: {
          type: 'sankey',
          sankey: { nodeWidth: 9, nodePadding: 6, align: 'justify' },
          data: {
            series: [
              {
                id: 'a',
                name: 'Users',
                data: {
                  // Short labels on purpose: a 240px card draws node labels
                  // outside the last layer, and long ones clip at the edge.
                  nodes: [
                    { id: 'organic', label: 'SEO' },
                    { id: 'paid', label: 'Ads' },
                    { id: 'signup', label: 'Signup' },
                    { id: 'trial', label: 'Trial' },
                    { id: 'bounced', label: 'Left' },
                    { id: 'paidplan', label: 'Paid' },
                    { id: 'lapsed', label: 'Churn' },
                  ],
                  links: [
                    { source: 'organic', target: 'signup', value: 4200 },
                    { source: 'paid', target: 'signup', value: 2600 },
                    { source: 'signup', target: 'trial', value: 4100 },
                    { source: 'signup', target: 'bounced', value: 2700 },
                    { source: 'trial', target: 'paidplan', value: 1850 },
                    { source: 'trial', target: 'lapsed', value: 2250 },
                  ],
                },
              },
            ],
          },
        },
      },
      {
        name: 'Gantt',
        link: 'gantt',
        blurb: 'Task spans on a time axis',
        options: {
          type: 'gantt',
          gantt: { today: new Date('2026-08-24') },
          data: {
            series: [
              {
                id: 'a',
                name: 'Tasks',
                data: [
                  { x: 'Migration', group: 'Platform', start: new Date('2026-07-06'), end: new Date('2026-07-31') },
                  { x: 'Cache', group: 'Platform', start: new Date('2026-07-27'), end: new Date('2026-08-28') },
                  { x: 'Dashboard', group: 'Product', start: new Date('2026-07-13'), end: new Date('2026-09-04') },
                  { x: 'Onboarding', group: 'Product', start: new Date('2026-08-17'), end: new Date('2026-09-25') },
                  { x: 'Pen test', group: 'Launch', start: new Date('2026-09-07'), end: new Date('2026-09-25') },
                ],
              },
            ],
          },
          xAxis: { ticks: { count: 3 } },
        },
      },
    ],
  },
  {
    id: 'geo',
    title: 'Geographic & graph',
    entries: [
      {
        name: 'Choropleth',
        link: 'choropleth',
        blurb: 'Regions shaded by value',
        options: {
          type: 'choropleth',
          choropleth: {
            geojson: territories,
            projection: 'equirectangular',
            featureKey: 'name',
            unmatched: 'omit',
          },
          data: {
            series: [
              {
                id: 'a',
                name: 'Revenue',
                data: [
                  { x: 'Northmark', y: 412 },
                  { x: 'Easthaven', y: 286 },
                  { x: 'Westford', y: 194 },
                  { x: 'Midvale', y: 341 },
                  { x: 'Southgate', y: 128 },
                  { x: 'Portsea', y: 233 },
                ],
              },
            ],
          },
        },
      },
      {
        name: 'Network',
        link: 'network',
        blurb: 'A deterministic force layout',
        options: {
          type: 'network',
          network: { linkDistance: 30, charge: -150, iterations: 220, fixedSeed: 1 },
          data: {
            series: [
              {
                id: 'a',
                name: 'Services',
                data: {
                  nodes: [
                    { id: 'gateway', label: 'Gateway', group: 'Edge', value: 9800 },
                    { id: 'web', label: 'Web', group: 'Edge', value: 6400 },
                    { id: 'auth', label: 'Auth', group: 'Core', value: 5200 },
                    { id: 'catalog', label: 'Catalog', group: 'Core', value: 4300 },
                    { id: 'orders', label: 'Orders', group: 'Core', value: 2600 },
                    { id: 'search', label: 'Search', group: 'Core', value: 3800 },
                    { id: 'pg', label: 'Postgres', group: 'Data', value: 7200 },
                    { id: 'redis', label: 'Redis', group: 'Data', value: 8100 },
                    { id: 'queue', label: 'Kafka', group: 'Data', value: 2200 },
                  ],
                  links: [
                    { source: 'web', target: 'gateway', value: 6 },
                    { source: 'gateway', target: 'auth', value: 5 },
                    { source: 'gateway', target: 'catalog', value: 4 },
                    { source: 'gateway', target: 'orders', value: 3 },
                    { source: 'gateway', target: 'search', value: 4 },
                    { source: 'auth', target: 'pg', value: 4 },
                    { source: 'auth', target: 'redis', value: 5 },
                    { source: 'catalog', target: 'redis', value: 4 },
                    { source: 'orders', target: 'pg', value: 3 },
                    { source: 'orders', target: 'queue', value: 2 },
                    { source: 'search', target: 'redis', value: 4 },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'micro',
    title: 'Micro, combo & text',
    entries: [
      {
        name: 'Sparkline',
        link: 'sparkline',
        blurb: 'Chrome-free inline trends',
        options: {
          type: 'sparkline',
          data: {
            series: [
              {
                id: 'a',
                name: 'Revenue',
                data: [96, 101, 99, 104, 108, 113, 111, 117, 119, 124, 122, 128],
              },
            ],
          },
        },
      },
      {
        name: 'Combo',
        link: 'combo',
        blurb: 'Mark mixing — not a separate type',
        options: {
          type: 'bar',
          data: {
            categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            series: [
              { id: 'a', name: 'Actual', data: [96, 101, 99, 108, 113, 111] },
              { id: 'b', name: 'Target', type: 'line', data: [100, 102, 105, 107, 110, 113] },
            ],
          },
          yAxis: { min: 0, ticks: { count: 3 } },
        },
      },
      {
        name: 'Word cloud',
        link: 'wordcloud',
        blurb: 'Decorative, and honest about it',
        options: {
          type: 'wordcloud',
          wordcloud: { minFontSize: 10, maxFontSize: 30, rotate: false },
          data: {
            series: [
              {
                id: 'a',
                name: 'Mentions',
                data: [
                  { x: 'invoice', y: 412 },
                  { x: 'SSO', y: 388 },
                  { x: 'export', y: 341 },
                  { x: 'timeout', y: 296 },
                  { x: 'permissions', y: 264 },
                  { x: 'webhook', y: 233 },
                  { x: 'seats', y: 208 },
                  { x: 'API key', y: 191 },
                  { x: 'sync', y: 174 },
                  { x: 'CSV', y: 148 },
                  { x: '2FA', y: 104 },
                  { x: 'audit', y: 81 },
                ],
              },
            ],
          },
        },
      },
    ],
  },
];

/** Count of real `ChartType` values represented (combo is a mark override). */
export const galleryTypeCount = galleryFamilies.reduce(
  (n, f) => n + f.entries.filter((e) => e.name !== 'Combo').length,
  0,
);
