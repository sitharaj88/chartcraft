/**
 * Northwind Cloud — dashboard data.
 *
 * FRAMEWORK-AGNOSTIC. This module is copied VERBATIM into the React, Vue,
 * Svelte and Angular ports of this sample, so it must never import anything
 * framework-specific and never touch the DOM.
 *
 * Everything here is DETERMINISTIC: the synthetic series are produced by a
 * seeded PRNG (mulberry32), so every port renders pixel-identical charts.
 * There is no `Math.random()` anywhere.
 */

import type {
  DataValue,
  GeoFeatureCollection,
  GraphData,
  SeriesOptions,
  TreeNode,
} from '@chartcraft/core';

/* ------------------------------------------------------------------ *
 * Range
 * ------------------------------------------------------------------ */

export type RangeKey = '30d' | '90d' | '12m';

export const RANGES: readonly { key: RangeKey; label: string; long: string }[] = [
  { key: '30d', label: '30d', long: 'Last 30 days' },
  { key: '90d', label: '90d', long: 'Last 90 days' },
  { key: '12m', label: '12m', long: 'Last 12 months' },
] as const;

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

/** mulberry32 — small, fast, seeded. Same seed ⇒ same stream, everywhere. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A growth curve from `start` to `end` over `n` points, with deterministic
 * jitter. `kink` bends the curve: `at` is the fraction of the way through the
 * window where growth accelerates, `before` is the fraction of total growth
 * delivered by then — so `{ at: 0.6, before: 0.35 }` reads as "flat, then a
 * step change", which is what a product launch actually looks like.
 */
function ramp(
  seed: number,
  n: number,
  start: number,
  end: number,
  jitter: number,
  kink?: { at: number; before: number },
): number[] {
  const rand = prng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    let shaped = t;
    if (kink) {
      shaped =
        t <= kink.at
          ? (t / kink.at) * kink.before
          : kink.before + ((t - kink.at) / (1 - kink.at)) * (1 - kink.before);
    }
    const base = start + (end - start) * shaped;
    out.push(base * (1 + (rand() - 0.5) * 2 * jitter));
  }
  return out;
}

const round = (v: number, to: number): number => Math.round(v / to) * to;

/* ------------------------------------------------------------------ *
 * Formatters (shared by every port, so the tiles read identically)
 * ------------------------------------------------------------------ */

/** 1_482_000 → "$1.48M"; 8_412 → "$8.41K". */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** 8412 → "8,412". */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** -4.6 → "▼ 4.6%"; 12.4 → "▲ 12.4%". Direction glyph, never colour alone. */
export function formatDelta(delta: number, unit: '%' | 'pp'): string {
  const glyph = delta >= 0 ? '▲' : '▼';
  return `${glyph} ${Math.abs(delta).toFixed(1)}${unit}`;
}

/* ------------------------------------------------------------------ *
 * KPI tiles
 * ------------------------------------------------------------------ */

export interface KpiTile {
  id: string;
  label: string;
  /** Pre-formatted headline figure. */
  value: string;
  /** Signed change over the selected window. */
  delta: number;
  deltaUnit: '%' | 'pp';
  /**
   * Whether a RISE in this metric is good. Churn going up is bad — the delta
   * chip colours by `higherIsBetter === (delta >= 0)`, mapped onto
   * `theme.up` / `theme.down`, never a hand-picked green or red.
   */
  higherIsBetter: boolean;
  /** e.g. "vs previous 30 days" */
  comparison: string;
  /** 12-point sparkline series. */
  spark: number[];
  /** Screen-reader description for the tile's sparkline. */
  a11y: string;
}

/* ------------------------------------------------------------------ *
 * Dashboard shape
 * ------------------------------------------------------------------ */

export interface DashboardData {
  range: RangeKey;
  rangeLabel: string;

  kpis: KpiTile[];

  /** Hero chart: MRR by segment on a real time axis. */
  mrr: {
    series: SeriesOptions[];
    /** x position of the reference-line annotation. */
    launchAt: Date;
    launchLabel: string;
    subtitle: string;
    a11y: string;
  };

  /** Acquisition flow (sankey). */
  flow: { data: GraphData; subtitle: string; a11y: string };

  /** Revenue by product line (treemap), nested category → product. */
  products: { nodes: TreeNode[]; subtitle: string; a11y: string };

  /** Support load (heatmap): weekday rows × time-block columns. */
  tickets: {
    blocks: string[];
    rows: { id: string; name: string; data: number[] }[];
    subtitle: string;
    a11y: string;
  };

  /** Revenue by segment per period (stacked bar). */
  segments: {
    periods: string[];
    series: SeriesOptions[];
    subtitle: string;
    a11y: string;
  };

  /** Platform capacity (gauge). */
  capacity: { value: number; subtitle: string; a11y: string };

  /** Revenue by sales territory (choropleth). */
  territories: { data: DataValue[]; subtitle: string; a11y: string };

  /** Contract value distribution by segment (boxplot). */
  contracts: {
    categories: string[];
    samples: DataValue[];
    subtitle: string;
    a11y: string;
  };
}

/* ------------------------------------------------------------------ *
 * Static topology — a tiny synthetic FeatureCollection.
 *
 * ChartCraft never bundles or fetches an atlas: the topology is always the
 * caller's. Seven simple polygons keep this sample self-contained and its
 * bundle honest — no 500 kB of world geometry for one card.
 * ------------------------------------------------------------------ */

export const salesTerritories: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Norvik' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 48], [6, 48], [6, 52], [2.5, 53.4], [0, 52], [0, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Easthaven' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 48], [12, 48], [13.2, 51], [10, 52.6], [6, 52], [6, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Westford' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 44], [6, 44], [6, 48], [0, 48], [0, 44]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Midvale' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 44], [12, 44], [12, 48], [6, 48], [6, 44]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Southgate' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 40], [6, 40], [6, 44], [0, 44], [-0.6, 42], [0, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Portmere' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 40], [12, 40], [12.6, 42], [12, 44], [6, 44], [6, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Kerr Isles' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[13.4, 45], [15.4, 45], [15.4, 47], [13.4, 47], [13.4, 45]]],
      },
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Range-specific shape
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;
/** A fixed "today", so the sample is byte-identical on every machine and day. */
const TODAY = Date.UTC(2026, 6, 24);

interface RangeShape {
  /** Number of points on the hero time series. */
  points: number;
  /** Point spacing. */
  step: 'day' | 'month';
  /** Fraction of the window at which the product launch lands. */
  launchAt: number;
  /** Multiplier applied to period-summed volumes (tickets, flow, revenue). */
  volume: number;
  subtitleWindow: string;
  comparison: string;
  periods: string[];
  periodLabel: string;
}

const SHAPES: Record<RangeKey, RangeShape> = {
  '30d': {
    points: 30,
    step: 'day',
    launchAt: 0.6,
    volume: 1,
    subtitleWindow: 'last 30 days',
    comparison: 'vs previous 30 days',
    periods: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    periodLabel: 'week',
  },
  '90d': {
    points: 90,
    step: 'day',
    launchAt: 0.49,
    volume: 3,
    subtitleWindow: 'last 90 days',
    comparison: 'vs previous 90 days',
    periods: ['May', 'Jun', 'Jul'],
    periodLabel: 'month',
  },
  '12m': {
    points: 12,
    step: 'month',
    launchAt: 0.55,
    volume: 12,
    subtitleWindow: 'last 12 months',
    comparison: 'vs previous 12 months',
    periods: ['Q3 25', 'Q4 25', 'Q1 26', 'Q2 26'],
    periodLabel: 'quarter',
  },
};

/** Evenly spaced x values ending at TODAY. */
function timeline(shape: RangeShape): Date[] {
  const out: Date[] = [];
  if (shape.step === 'day') {
    for (let i = shape.points - 1; i >= 0; i--) out.push(new Date(TODAY - i * DAY));
  } else {
    const d = new Date(TODAY);
    for (let i = shape.points - 1; i >= 0; i--) {
      out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Per-range KPI figures
 *
 * MRR / NRR / workspaces are SNAPSHOT metrics: the headline is the same
 * whatever window you look through — only the change and the trend move.
 * Churned ARR is a period SUM, so its headline moves with the window.
 * ------------------------------------------------------------------ */

const KPI_DELTAS: Record<RangeKey, { mrr: number; nrr: number; seats: number; churn: number }> = {
  '30d': { mrr: 2.1, nrr: 0.6, seats: 1.9, churn: 0.8 },
  '90d': { mrr: 7.3, nrr: 1.9, seats: 5.2, churn: -4.6 },
  '12m': { mrr: 24.8, nrr: 4.1, seats: 31.4, churn: 9.1 },
};

const CHURNED_ARR: Record<RangeKey, number> = { '30d': 18_400, '90d': 61_200, '12m': 214_000 };

function buildKpis(range: RangeKey, shape: RangeShape): KpiTile[] {
  const d = KPI_DELTAS[range];
  const seed = range === '30d' ? 11 : range === '90d' ? 23 : 37;

  const mrrSpark = ramp(seed + 1, 12, 1_482_000 / (1 + d.mrr / 100), 1_482_000, 0.012);
  const nrrSpark = ramp(seed + 2, 12, 118 - d.nrr, 118, 0.008);
  const seatSpark = ramp(seed + 3, 12, 8412 / (1 + d.seats / 100), 8412, 0.01);
  const churnSpark = ramp(seed + 4, 12, CHURNED_ARR[range] / (1 + d.churn / 100), CHURNED_ARR[range], 0.06);

  return [
    {
      id: 'mrr',
      label: 'Monthly recurring revenue',
      value: formatCompactCurrency(1_482_000),
      delta: d.mrr,
      deltaUnit: '%',
      higherIsBetter: true,
      comparison: shape.comparison,
      spark: mrrSpark.map((v) => round(v, 1000)),
      a11y: `Monthly recurring revenue trend, ${shape.subtitleWindow}: up ${d.mrr} percent to 1.48 million dollars.`,
    },
    {
      id: 'nrr',
      label: 'Net revenue retention',
      value: '118%',
      delta: d.nrr,
      deltaUnit: 'pp',
      higherIsBetter: true,
      comparison: shape.comparison,
      spark: nrrSpark.map((v) => Number(v.toFixed(1))),
      a11y: `Net revenue retention trend, ${shape.subtitleWindow}: up ${d.nrr} percentage points to 118 percent.`,
    },
    {
      id: 'workspaces',
      label: 'Active workspaces',
      value: formatNumber(8412),
      delta: d.seats,
      deltaUnit: '%',
      higherIsBetter: true,
      comparison: shape.comparison,
      spark: seatSpark.map((v) => round(v, 1)),
      a11y: `Active workspace trend, ${shape.subtitleWindow}: up ${d.seats} percent to 8,412 workspaces.`,
    },
    {
      id: 'churn',
      label: 'Churned ARR',
      value: formatCompactCurrency(CHURNED_ARR[range]),
      delta: d.churn,
      deltaUnit: '%',
      // A rise in churn is BAD — this is why the tile takes a semantic flag
      // rather than colouring by the sign of the delta.
      higherIsBetter: false,
      comparison: shape.comparison,
      spark: churnSpark.map((v) => round(v, 100)),
      a11y: `Churned annual recurring revenue trend, ${shape.subtitleWindow}: ${
        d.churn >= 0 ? 'up' : 'down'
      } ${Math.abs(d.churn)} percent.`,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * getData
 * ------------------------------------------------------------------ */

const CAPACITY: Record<RangeKey, number> = { '30d': 68, '90d': 74, '12m': 61 };

export function getData(range: RangeKey): DashboardData {
  const shape = SHAPES[range];
  const xs = timeline(shape);
  const launchIndex = Math.round((shape.points - 1) * shape.launchAt);
  const launchAt = xs[launchIndex];
  const v = shape.volume;

  /* --- Hero: MRR by segment ------------------------------------- */
  // Enterprise accelerates after the Atlas 2.0 launch; self-serve does not.
  const ent = ramp(101, shape.points, 902_000, 986_000, 0.006, {
    at: shape.launchAt,
    before: 0.3,
  });
  const self = ramp(202, shape.points, 452_000, 496_000, 0.009);

  const mrrSeries: SeriesOptions[] = [
    {
      id: 'enterprise',
      name: 'Enterprise',
      curve: 'monotone',
      data: xs.map((x, i) => [x, round(ent[i], 1000)] as [Date, number]),
    },
    {
      id: 'self-serve',
      name: 'Self-serve',
      curve: 'monotone',
      data: xs.map((x, i) => [x, round(self[i], 1000)] as [Date, number]),
    },
  ];

  /* --- Acquisition flow ------------------------------------------ */
  const f = (n: number) => Math.round(n * v);
  const flow: GraphData = {
    nodes: [
      { id: 'organic', label: 'Organic' },
      { id: 'paid', label: 'Paid social' },
      { id: 'partner', label: 'Partners' },
      { id: 'signup', label: 'Signed up' },
      { id: 'bounced', label: 'Never returned' },
      { id: 'trial', label: 'Started trial' },
      { id: 'stalled', label: 'Stalled' },
      { id: 'activated', label: 'Activated' },
      { id: 'paidplan', label: 'Paid plan' },
      { id: 'lapsed', label: 'Lapsed' },
    ],
    links: [
      { source: 'organic', target: 'signup', value: f(1420) },
      { source: 'paid', target: 'signup', value: f(860) },
      { source: 'partner', target: 'signup', value: f(590) },
      { source: 'signup', target: 'trial', value: f(1710) },
      { source: 'signup', target: 'bounced', value: f(1160) },
      { source: 'trial', target: 'activated', value: f(1040) },
      { source: 'trial', target: 'stalled', value: f(670) },
      { source: 'activated', target: 'paidplan', value: f(624) },
      { source: 'activated', target: 'lapsed', value: f(416) },
    ],
  };

  /* --- Revenue by product line ----------------------------------- */
  const p = (n: number) => Number((n * (v / 12)).toFixed(1));
  const products: TreeNode[] = [
    {
      label: 'Platform',
      children: [
        { label: 'Workspaces', value: p(486) },
        { label: 'Compute credits', value: p(212) },
        { label: 'Storage', value: p(118) },
      ],
    },
    {
      label: 'Data cloud',
      children: [
        { label: 'Warehouse', value: p(264) },
        { label: 'Pipelines', value: p(146) },
        { label: 'Reverse ETL', value: p(72) },
      ],
    },
    {
      label: 'Services',
      children: [
        { label: 'Onboarding', value: p(94) },
        { label: 'Training', value: p(48) },
      ],
    },
    { label: 'Marketplace', value: p(62) },
  ];

  /* --- Support load ---------------------------------------------- */
  const blocks = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayShape = [0.09, 0.21, 0.94, 1, 0.6, 0.24];
  const dayWeight = [1, 0.97, 1.04, 0.95, 0.82, 0.31, 0.24];
  const ticketRand = prng(909);
  const peak = 46 * (v / 12) * 4;
  const rows = dayNames.map((name, di) => ({
    id: name.toLowerCase(),
    name,
    data: blocks.map((_, bi) =>
      Math.max(1, Math.round(peak * weekdayShape[bi] * dayWeight[di] * (0.92 + ticketRand() * 0.16))),
    ),
  }));

  /* --- Revenue by segment per period ------------------------------ */
  const segNames = ['Enterprise', 'Business', 'Team', 'Self-serve'] as const;
  const segBase = [1180, 640, 395, 260];
  const segGrowth = [1.19, 1.12, 1.07, 1.04];
  const n = shape.periods.length;
  const segments: SeriesOptions[] = segNames.map((name, si) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    data: ramp(
      300 + si,
      n,
      segBase[si] * (v / 12) * (1 / segGrowth[si]),
      segBase[si] * (v / 12) * segGrowth[si],
      0.02,
    ).map((val) => round(val, 1)),
  }));

  /* --- Revenue by territory --------------------------------------- */
  const territoryValues: [string, number][] = [
    ['Norvik', 412],
    ['Easthaven', 286],
    ['Westford', 194],
    ['Midvale', 341],
    ['Southgate', 128],
    ['Portmere', 233],
    // 'Kerr Isles' deliberately has no datum — an unmatched FEATURE renders in
    // the gridline colour, which is how a real map shows "no coverage here".
  ];
  const territories: DataValue[] = territoryValues.map(([name, val]) => ({
    x: name,
    y: round(val * (v / 12), 1),
  }));

  /* --- Contract value distribution -------------------------------- */
  // Raw samples per segment — the chart computes quartiles, 1.5×IQR whiskers
  // and outliers itself, so no pre-aggregation lives in the app.
  const contractSpecs: [string, number, number, number][] = [
    ['Self-serve', 14, 1.2, 3.6],
    ['Team', 16, 6.4, 14],
    ['Business', 15, 22, 48],
    ['Enterprise', 13, 78, 260],
  ];
  const contractRand = prng(4242);
  const contracts: DataValue[] = contractSpecs.map(([, count, lo, hi]) => {
    const s: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Right-skewed: contract values cluster low with a long upper tail.
      s.push(Number((lo + (hi - lo) * Math.pow(t, 1.9) * (0.9 + contractRand() * 0.24)).toFixed(1)));
    }
    return s.sort((a, b) => a - b);
  });

  const totalSignups = f(1420) + f(860) + f(590);
  const paid = f(624);

  return {
    range,
    rangeLabel: RANGES.find((r) => r.key === range)!.long,

    kpis: buildKpis(range, shape),

    mrr: {
      series: mrrSeries,
      launchAt,
      launchLabel: 'Atlas 2.0',
      subtitle: `Recurring revenue by segment · ${shape.subtitleWindow} · drag to zoom`,
      a11y:
        'Enterprise recurring revenue grew from about 900,000 to 986,000 dollars and accelerated after the Atlas 2.0 launch. Self-serve revenue grew steadily from about 452,000 to 496,000 dollars over the same window.',
    },

    flow: {
      data: flow,
      subtitle: `Signup → trial → paid · ${shape.subtitleWindow} · ribbon width ∝ accounts`,
      a11y: `Of ${formatNumber(totalSignups)} signups, ${formatNumber(
        f(1710),
      )} started a trial and ${formatNumber(f(1160))} never returned. ${formatNumber(
        f(1040),
      )} trials activated and ${formatNumber(paid)} converted to a paid plan.`,
    },

    products: {
      nodes: products,
      subtitle: `Revenue by product line · ${shape.subtitleWindow} ($K) · area ∝ revenue`,
      a11y:
        'Platform is the largest product line, led by Workspaces, followed by Data cloud (Warehouse and Pipelines), then Services and Marketplace.',
    },

    tickets: {
      blocks,
      rows,
      subtitle: `Tickets opened per weekday and 4-hour block · ${shape.subtitleWindow}`,
      a11y:
        'Ticket volume concentrates in weekday business hours, peaking between 08:00 and 16:00 Monday to Thursday, and falls to single digits overnight and at weekends.',
    },

    segments: {
      periods: shape.periods,
      series: segments,
      subtitle: `Revenue by customer segment per ${shape.periodLabel} ($K)`,
      a11y:
        'Enterprise contributes the largest share of revenue in every period and is growing fastest; self-serve is close to flat.',
    },

    capacity: {
      value: CAPACITY[range],
      subtitle: `Mean provisioned-capacity use · ${shape.subtitleWindow}`,
      a11y: `Platform capacity use averaged ${CAPACITY[range]} percent over the ${shape.subtitleWindow}.`,
    },

    territories: {
      data: territories,
      subtitle: `Revenue by sales territory · ${shape.subtitleWindow} ($K)`,
      a11y:
        'Norvik leads revenue, followed by Midvale and Easthaven. Southgate is the weakest territory, and Kerr Isles has no coverage yet.',
    },

    contracts: {
      categories: contractSpecs.map(([name]) => name),
      samples: contracts,
      subtitle: 'Annual contract value by segment ($K) · box = q1–q3, line = median',
      a11y:
        'Annual contract value rises sharply by segment: self-serve contracts cluster near 2,000 dollars while enterprise contracts span 80,000 to 260,000 dollars with a long upper tail.',
    },
  };
}
