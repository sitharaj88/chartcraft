/**
 * Graph subsystem unit tests: the seeded PRNG + phyllotaxis seeding, the
 * Barnes-Hut quadtree (exact at theta = 0), force-layout DETERMINISM (two runs
 * byte-identical, no `Math.random`), plot fitting, graph normalization
 * (degree ordering, first-seen group slots, link resolution) and area-true
 * node radii.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clearForceCache,
  fitPositions,
  forceCacheKey,
  linkDegrees,
  mulberry32,
  phyllotaxisPositions,
  simulateForce,
  simulateForceCached,
  FORCE_DEFAULTS,
  GOLDEN_ANGLE,
  type ForceLink,
} from '../src/charts/graph/force';
import {
  barnesHutRepulsion,
  buildQuadtree,
  deterministicOffset,
  pairwiseRepulsion,
} from '../src/charts/graph/quadtree';
import { nodeColor, nodeRadii, parseNetworkGraph } from '../src/charts/graph/graph';
import { lightTheme } from '../src/theme';
import type { ChartData } from '../src/index';

/** A 4-node graph: degrees b=3, a=2, c=2, d=1. */
const graphData = {
  series: [
    {
      name: 'Graph',
      data: {
        nodes: [
          { id: 'a', label: 'Alpha', group: 'One', value: 16 },
          { id: 'b', label: 'Beta', group: 'Two', value: 4 },
          { id: 'c', label: 'Gamma', group: 'One', value: 1 },
          { id: 'd', label: 'Delta', value: 9 },
        ],
        links: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'b', target: 'd' },
          { source: 'a', target: 'c' },
        ],
      },
    },
  ],
} as unknown as ChartData;

describe('seeded randomness (no Math.random anywhere)', () => {
  it('mulberry32 is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(2)()).not.toBe(mulberry32(1)());
  });

  it('phyllotaxis seeding: radius = spacing·√(i+0.5), golden-angle steps', () => {
    const { x, y } = phyllotaxisPositions(5, 1, 14);
    for (let i = 0; i < 5; i++) {
      expect(Math.hypot(x[i] as number, y[i] as number)).toBeCloseTo(14 * Math.sqrt(i + 0.5), 10);
    }
    const angle = (i: number): number => Math.atan2(y[i] as number, x[i] as number);
    const step = (angle(1) - angle(0) + 4 * Math.PI) % (2 * Math.PI);
    expect(step).toBeCloseTo(GOLDEN_ANGLE, 10);
    // No two initial positions coincide (nothing for the sim to divide by).
    expect(new Set(x.map((v, i) => `${v},${y[i]}`)).size).toBe(5);
  });

  it('the seed only rotates the spiral (fixedSeed changes the layout)', () => {
    const s1 = phyllotaxisPositions(6, 1, 14);
    const s2 = phyllotaxisPositions(6, 7, 14);
    expect(s1.x).not.toEqual(s2.x);
    for (let i = 0; i < 6; i++) {
      expect(Math.hypot(s1.x[i] as number, s1.y[i] as number)).toBeCloseTo(
        Math.hypot(s2.x[i] as number, s2.y[i] as number),
        10,
      );
    }
  });

  it('simulateForce never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    simulateForce({ nodeCount: 12, links: [{ source: 0, target: 1 }], iterations: 25 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Barnes-Hut quadtree', () => {
  it('accumulates mass and center of mass into a SQUARE root cell', () => {
    const tree = buildQuadtree([0, 10, 0, 10], [0, 0, 10, 10]);
    expect(tree).not.toBeNull();
    expect(tree!.weight).toBe(4);
    expect(tree!.cx).toBeCloseTo(5, 12);
    expect(tree!.cy).toBeCloseTo(5, 12);
    expect(tree!.x1 - tree!.x0).toBeCloseTo(tree!.y1 - tree!.y0, 12);
    expect(tree!.children).not.toBeNull();
    expect(buildQuadtree([], [])).toBeNull();
  });

  it('coincident bodies aggregate instead of recursing forever', () => {
    const tree = buildQuadtree([3, 3, 3], [4, 4, 4]);
    expect(tree!.weight).toBe(3);
    expect(tree!.cx).toBe(3);
    expect(tree!.cy).toBe(4);
    // And they still produce a finite, non-zero repulsion (deterministic offset).
    const [fx, fy] = barnesHutRepulsion(tree, 0, 3, 4, -30, 0.9);
    expect(Number.isFinite(fx)).toBe(true);
    expect(Number.isFinite(fy)).toBe(true);
    expect(fx === 0 && fy === 0).toBe(false);
    expect(deterministicOffset(0)).toEqual([1e-6, 1e-6]);
  });

  it('theta = 0 reproduces the exact O(n²) pairwise sum', () => {
    const xs = [0, 12, 30, 5, -8, 21];
    const ys = [0, 3, -14, 22, 9, 17];
    const tree = buildQuadtree(xs, ys);
    for (let i = 0; i < xs.length; i++) {
      const bh = barnesHutRepulsion(tree, i, xs[i] as number, ys[i] as number, -220, 0);
      const exact = pairwiseRepulsion(xs, ys, i, -220);
      expect(bh[0]).toBeCloseTo(exact[0], 10);
      expect(bh[1]).toBeCloseTo(exact[1], 10);
    }
  });

  it('theta = 0.9 approximates the exact sum closely and excludes self', () => {
    const n = 60;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      xs.push(Math.cos(i) * (10 + i));
      ys.push(Math.sin(i) * (10 + i));
    }
    const tree = buildQuadtree(xs, ys);
    const exact = pairwiseRepulsion(xs, ys, 0, -220);
    const errAt = (theta: number): number => {
      const bh = barnesHutRepulsion(tree, 0, xs[0] as number, ys[0] as number, -220, theta);
      return Math.hypot(bh[0] - exact[0], bh[1] - exact[1]) / Math.hypot(exact[0], exact[1]);
    };
    // Smaller theta = less approximation; theta 0 is exact.
    expect(errAt(0)).toBeCloseTo(0, 12);
    expect(errAt(0.4)).toBeLessThan(errAt(0.9));
    expect(errAt(0.9)).toBeLessThan(0.2);
    // A lone body feels nothing from itself.
    const single = buildQuadtree([4], [4]);
    expect(barnesHutRepulsion(single, 0, 4, 4, -220, 0.9)).toEqual([0, 0]);
  });
});

describe('force layout', () => {
  const links: ForceLink[] = [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
    { source: 3, target: 0 },
  ];

  it('is DETERMINISTIC: two runs are byte-identical', () => {
    const a = simulateForce({ nodeCount: 4, links });
    const b = simulateForce({ nodeCount: 4, links });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const v of [...a.x, ...a.y]) expect(Number.isFinite(v)).toBe(true);
  });

  it('a different fixedSeed gives a different (still deterministic) layout', () => {
    const s1 = simulateForce({ nodeCount: 4, links, seed: 1 });
    const s7 = simulateForce({ nodeCount: 4, links, seed: 7 });
    expect(s1.x).not.toEqual(s7.x);
    expect(simulateForce({ nodeCount: 4, links, seed: 7 })).toEqual(s7);
  });

  it('link springs relax to linkDistance (charge and gravity off)', () => {
    const { x, y } = simulateForce({
      nodeCount: 2,
      links: [{ source: 0, target: 1 }],
      linkDistance: 40,
      charge: 0,
      gravity: 0,
      iterations: 300,
    });
    const d = Math.hypot((x[1] as number) - (x[0] as number), (y[1] as number) - (y[0] as number));
    expect(d).toBeCloseTo(40, 1);
  });

  it('repulsion pushes unlinked nodes apart, gravity keeps them centered', () => {
    const spread = simulateForce({ nodeCount: 6, links: [], iterations: 300 });
    const d01 = Math.hypot((spread.x[1] as number) - (spread.x[0] as number), (spread.y[1] as number) - (spread.y[0] as number));
    expect(d01).toBeGreaterThan(10);
    // Recentred on the origin by construction.
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(spread.x)).toBeCloseTo(0, 9);
    expect(mean(spread.y)).toBeCloseTo(0, 9);
  });

  it('handles the degenerate sizes and an explicit iteration count of 0', () => {
    expect(simulateForce({ nodeCount: 0, links: [] })).toEqual({ x: [], y: [] });
    expect(simulateForce({ nodeCount: 1, links: [] })).toEqual({ x: [0], y: [0] });
    // iterations: 0 = the untouched phyllotaxis seeding.
    const raw = simulateForce({ nodeCount: 3, links: [], iterations: 0 });
    const seed = phyllotaxisPositions(3, FORCE_DEFAULTS.seed, FORCE_DEFAULTS.initialRadius);
    const mx = seed.x.reduce((s, v) => s + v, 0) / 3;
    expect(raw.x[0]).toBeCloseTo((seed.x[0] as number) - mx, 10);
  });

  it('ignores self-links and out-of-range endpoints', () => {
    const withJunk = simulateForce({
      nodeCount: 3,
      links: [{ source: 0, target: 0 }, { source: 0, target: 9 }, { source: 0, target: 1 }],
    });
    const clean = simulateForce({ nodeCount: 3, links: [{ source: 0, target: 1 }] });
    expect(withJunk).toEqual(clean);
  });

  it('linkDegrees counts incident links (self-links excluded)', () => {
    expect(linkDegrees(4, links)).toEqual([2, 2, 2, 2]);
    expect(linkDegrees(3, [{ source: 0, target: 1 }, { source: 0, target: 1 }, { source: 2, target: 2 }])).toEqual([
      2, 2, 0,
    ]);
  });

  it('scales to a few hundred nodes (Barnes-Hut, O(n log n))', () => {
    const many: ForceLink[] = [];
    for (let i = 1; i < 300; i++) many.push({ source: i, target: (i * 7) % 300 });
    const out = simulateForce({ nodeCount: 300, links: many, iterations: 60 });
    expect(out.x).toHaveLength(300);
    expect(out.x.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('memoization returns the same positions as a fresh run', () => {
    clearForceCache();
    const fresh = simulateForce({ nodeCount: 4, links });
    const cached = simulateForceCached({ nodeCount: 4, links });
    expect(cached).toEqual(fresh);
    expect(simulateForceCached({ nodeCount: 4, links })).toEqual(fresh);
    expect(forceCacheKey({ nodeCount: 4, links })).not.toBe(forceCacheKey({ nodeCount: 4, links, seed: 2 }));
  });

  it('fitPositions centers the layout in the rect, aspect ratio preserved', () => {
    const fitted = fitPositions({ x: [-1, 1], y: [0, 0] }, { x: 0, y: 0, w: 100, h: 100 }, 10);
    expect(fitted).toEqual({ x: [10, 90], y: [50, 50] });
    // Square input in a 2:1 rect: the short axis limits the scale.
    const square = fitPositions({ x: [-1, 1], y: [-1, 1] }, { x: 0, y: 0, w: 200, h: 100 }, 10);
    expect(square).toEqual({ x: [60, 140], y: [10, 90] });
    // A single node lands dead center.
    expect(fitPositions({ x: [5], y: [5] }, { x: 0, y: 0, w: 60, h: 40 }, 4)).toEqual({ x: [30], y: [20] });
  });
});

describe('network graph normalization', () => {
  it('orders nodes by DEGREE descending (ties keep input order) and reindexes links', () => {
    const g = parseNetworkGraph(graphData)!;
    expect(g.nodes.map((n) => n.label)).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
    expect(g.nodes.map((n) => n.degree)).toEqual([3, 2, 2, 1]);
    // a-b becomes 1-0 after reordering.
    expect(g.links).toEqual([
      { source: 1, target: 0, value: null },
      { source: 0, target: 2, value: null },
      { source: 0, target: 3, value: null },
      { source: 1, target: 2, value: null },
    ]);
  });

  it('maps groups in FIRST-SEEN order, never by count', () => {
    const data = {
      series: [
        {
          name: 'G',
          data: {
            nodes: [
              { id: 'z', group: 'Zebra' },
              { id: 'a1', group: 'Ant' },
              { id: 'a2', group: 'Ant' },
              { id: 'a3', group: 'Ant' },
            ],
            links: [],
          },
        },
      ],
    } as unknown as ChartData;
    const g = parseNetworkGraph(data)!;
    expect(g.groups).toEqual(['Zebra', 'Ant']);
    // Slot assignment follows that order, so Zebra keeps slot 1 despite being rarer.
    expect(nodeColor(g.nodes.find((n) => n.id === 'z')!, g.groups, lightTheme.series)).toBe(lightTheme.series[0]);
    expect(nodeColor(g.nodes.find((n) => n.id === 'a1')!, g.groups, lightTheme.series)).toBe(lightTheme.series[1]);
    // Ungrouped nodes take slot 1; an explicit color always wins.
    expect(nodeColor({ id: 'x', label: 'x', group: '', value: null, degree: 0, ord: 9 }, g.groups, lightTheme.series)).toBe(
      lightTheme.series[0],
    );
    expect(
      nodeColor({ id: 'x', label: 'x', group: 'Ant', value: null, color: '#abcdef', degree: 0, ord: 9 }, g.groups, lightTheme.series),
    ).toBe('#abcdef');
  });

  it('accepts nodes-as-series-data with links alongside, and node index links', () => {
    const data = {
      series: [
        {
          name: 'G',
          data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
          links: [{ source: 0, target: 1 }, { source: 'b', target: 'c' }],
        },
      ],
    } as unknown as ChartData;
    const g = parseNetworkGraph(data)!;
    expect(g.nodes.map((n) => n.id)).toEqual(['b', 'a', 'c']); // b has degree 2
    expect(g.nodes.map((n) => n.degree)).toEqual([2, 1, 1]);
  });

  it('accepts the graph on ChartData itself and defaults ids/labels/values', () => {
    const data = {
      series: [],
      nodes: [{ label: 'Solo' }, { id: 'n2', y: 5 }],
      links: [],
    } as unknown as ChartData;
    const g = parseNetworkGraph(data)!;
    expect(g.nodes.map((n) => [n.id, n.label, n.value])).toEqual([
      ['Solo', 'Solo', null],
      ['n2', 'n2', 5],
    ]);
    expect(parseNetworkGraph(undefined)).toBeNull();
    expect(parseNetworkGraph({ series: [{ name: 'x', data: [1, 2, 3] }] } as ChartData)).toBeNull();
  });

  it('throws a clear error for a link pointing at an unknown node', () => {
    const data = {
      series: [{ name: 'G', data: { nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'ghost' }] } }],
    } as unknown as ChartData;
    expect(() => parseNetworkGraph(data)).toThrow(/unknown node 'ghost'/);
  });

  it('ignores duplicate ids and counts self-links as no degree', () => {
    const data = {
      series: [
        {
          name: 'G',
          data: {
            nodes: [{ id: 'a' }, { id: 'a' }, { id: 'b' }],
            links: [{ source: 'a', target: 'a' }, { source: 'a', target: 'b' }],
          },
        },
      ],
    } as unknown as ChartData;
    const g = parseNetworkGraph(data)!;
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.map((n) => n.degree)).toEqual([1, 1]);
  });
});

describe('node radii are AREA-TRUE (radius ∝ √value)', () => {
  it('r = rMax·√(v/vMax): area ratios equal value ratios exactly', () => {
    const radii = nodeRadii([1, 4, 9, 16], 0, 28);
    expect(radii).toEqual([7, 14, 21, 28]);
    const area = (r: number): number => Math.PI * r * r;
    expect(area(radii[3] as number) / area(radii[0] as number)).toBeCloseTo(16 / 1, 9);
    expect(area(radii[1] as number) / area(radii[0] as number)).toBeCloseTo(4 / 1, 9);
    // Radius-linear would give 4x the radius for 4x the value — it must not.
    expect(radii[1]).not.toBe(4 * (radii[0] as number));
  });

  it('applies the legibility floor and a uniform size when no values exist', () => {
    expect(nodeRadii([0.0001, 100], 4, 20)).toEqual([4, 20]);
    expect(nodeRadii([null, null], 4, 20)).toEqual([12, 12]);
    expect(nodeRadii([0, 0], 4, 20)).toEqual([12, 12]);
    expect(nodeRadii([null, 4], 4, 20)).toEqual([4, 20]);
  });
});
