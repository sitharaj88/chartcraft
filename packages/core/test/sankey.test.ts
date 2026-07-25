/**
 * sankey (v0.3): pure layout math (layering, deterministic crossing reduction,
 * throughput sizing, ribbon geometry), plus the cross-cutting requirements
 * (legend policy, a11y table, renderer smoke, tooltip, keyboard nav, events).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFlowChartTypes } from '../src/charts/flow';
registerFlowChartTypes();
import {
  assignLayers,
  buildSankeyGraph,
  computeSankeyLayout,
  countCrossings,
  orderLayers,
  parseSankeyGraph,
  ribbonEdgesAtX,
  sankeyReadingOrder,
  SANKEY_DEFAULT_NODE_PADDING,
  SANKEY_DEFAULT_NODE_WIDTH,
  SANKEY_LINK_ALPHA,
  SANKEY_MIN_NODE_GAP,
  type SankeyGraphInput,
} from '../src/charts/flow/graph';
import { sankeyNodeColors } from '../src/charts/flow/sankey';
import { lightTheme } from '../src/theme';
import type { ChartData, SeriesData } from '../src/types';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

afterEach(cleanupDom);

// `SeriesData` admits the contract's `{ nodes, links }` payload directly, so a
// well-formed graph needs no cast. Malformed inputs (the error tests) still do.
const graphData = (input: SankeyGraphInput | unknown): ChartData => ({
  series: [{ name: 'Energy', data: input as SeriesData }],
});

/** A → B (6) and A → C (4): two layers, balanced throughput. */
const simple: SankeyGraphInput = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
  links: [
    { source: 'A', target: 'B', value: 6 },
    { source: 'A', target: 'C', value: 4 },
  ],
};

/** A → B → C plus D → C: `right` alignment moves D, `left`/`justify` do not. */
const chain: SankeyGraphInput = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  links: [
    { source: 'A', target: 'B', value: 1 },
    { source: 'B', target: 'C', value: 1 },
    { source: 'D', target: 'C', value: 2 },
  ],
};

/** A → B, A → C, C → D: `justify` pushes the terminal B into the last layer. */
const forked: SankeyGraphInput = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  links: [
    { source: 'A', target: 'B', value: 1 },
    { source: 'A', target: 'C', value: 2 },
    { source: 'C', target: 'D', value: 3 },
  ],
};

/** A → D and B → C: one crossing that the barycenter sweep removes. */
const crossed: SankeyGraphInput = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  links: [
    { source: 'A', target: 'D', value: 1 },
    { source: 'B', target: 'C', value: 1 },
  ],
};

const PLOT = { x: 12, y: 12, w: 576, h: 376 };

describe('sankey graph parsing & validation', () => {
  it('resolves ids and index references, and accumulates in/out totals', () => {
    const g = parseSankeyGraph({
      nodes: [{ id: 'A', label: 'Alpha' }, { id: 'B' }, { id: 'C', color: '#123456' }],
      links: [
        { source: 'A', target: 'B', value: 6 },
        { source: 0, target: 2, value: 4 },
      ],
    });
    expect(g.nodes.map((n) => n.label)).toEqual(['Alpha', 'B', 'C']);
    expect(g.links.map((l) => [l.source, l.target, l.value])).toEqual([
      [0, 1, 6],
      [0, 2, 4],
    ]);
    expect(g.nodes[0]!.outValue).toBe(10);
    expect(g.nodes[0]!.inValue).toBe(0);
    expect(g.nodes[0]!.value).toBe(10); // throughput = max(in, out)
    expect(g.nodes[1]!.value).toBe(6);
    expect(g.nodes[2]!.color).toBe('#123456');
  });

  it('rejects a cycle with a message naming every offending node', () => {
    const cyclic = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      links: [
        { source: 'A', target: 'B', value: 1 },
        { source: 'B', target: 'C', value: 1 },
        { source: 'C', target: 'A', value: 1 },
      ],
    };
    expect(() => parseSankeyGraph(cyclic)).toThrow(/directed ACYCLIC graph/);
    expect(() => parseSankeyGraph(cyclic)).toThrow(/cycle: A → B → C → A/);
    expect(() => parseSankeyGraph(cyclic)).toThrow(/Remove or reverse one of them \(e\.g\. 'C' → 'A'\)/);
    // Self-loops are cycles too.
    expect(() =>
      parseSankeyGraph({ nodes: [{ id: 'A' }], links: [{ source: 'A', target: 'A', value: 1 }] }),
    ).toThrow(/self-loop on 'A'/);
  });

  it('rejects unusable payloads with actionable errors', () => {
    expect(() => parseSankeyGraph([1, 2, 3])).toThrow(/data: \{ nodes: .*links: /);
    expect(() => parseSankeyGraph({ nodes: [{ id: 'A' }, { id: 'A' }], links: [] })).toThrow(
      /node ids must be unique, but 'A' appears twice \(nodes 0 and 1\)/,
    );
    expect(() =>
      parseSankeyGraph({ nodes: [{ id: 'A' }], links: [{ source: 'A', target: 'Z', value: 1 }] }),
    ).toThrow(/link 0 target 'Z' is not a declared node\. Known node ids: 'A'/);
    expect(() =>
      parseSankeyGraph({ nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 5, target: 1, value: 1 }] }),
    ).toThrow(/source index 5 is out of range — there are 2 nodes \(valid indices 0\.\.1\)/);
    expect(() =>
      parseSankeyGraph({ nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 0, target: 1, value: -3 }] }),
    ).toThrow(/needs a finite value >= 0, got -3/);
    expect(() => parseSankeyGraph({ nodes: [{ label: '' }], links: [] })).toThrow(/node 0 needs a string 'id'/);
  });
});

describe('sankey layering (longest path + align)', () => {
  it('layers by longest path from the sources', () => {
    const g = parseSankeyGraph(chain);
    expect(assignLayers(g, 'left')).toEqual([[0, 3], [1], [2]]);
    expect(g.nodes.map((n) => n.layer)).toEqual([0, 1, 2, 0]);
    // C is reachable in 1 step from D but in 2 from A: the LONGEST path wins.
    expect(g.nodes[2]!.layer).toBe(2);
  });

  it("'justify' pushes terminal nodes into the last layer, 'right' measures back from the sinks", () => {
    const left = parseSankeyGraph(forked);
    expect(assignLayers(left, 'left')).toEqual([[0], [1, 2], [3]]);
    const just = parseSankeyGraph(forked);
    expect(assignLayers(just, 'justify')).toEqual([[0], [2], [1, 3]]);
    expect(just.nodes[1]!.layer).toBe(2); // terminal B justified right

    const right = parseSankeyGraph(chain);
    expect(assignLayers(right, 'right')).toEqual([[0], [1, 3], [2]]);
    const justChain = parseSankeyGraph(chain);
    expect(assignLayers(justChain, 'justify')).toEqual([[0, 3], [1], [2]]);
  });

  it('defaults to justify and sets each node its rank within the layer', () => {
    const g = buildSankeyGraph(forked);
    expect(g.layers).toEqual([[0], [2], [1, 3]]);
    expect(g.nodes.map((n) => [n.layer, n.order])).toEqual([
      [0, 0],
      [2, 0],
      [1, 0],
      [2, 1],
    ]);
  });
});

describe('sankey crossing reduction (deterministic)', () => {
  it('counts crossings exactly and removes the one in A→D / B→C', () => {
    const g = parseSankeyGraph(crossed);
    const initial = assignLayers(g, 'justify');
    expect(initial).toEqual([[0, 1], [2, 3]]);
    expect(countCrossings(g, initial)).toBe(1);

    const ordered = orderLayers(g, initial);
    expect(ordered).toEqual([[0, 1], [3, 2]]); // D above C
    expect(countCrossings(g, ordered)).toBe(0);
    expect(g.nodes[3]!.order).toBe(0);
    expect(g.nodes[2]!.order).toBe(1);
  });

  it('is deterministic: two runs produce identical layers (no Math.random)', () => {
    const a = buildSankeyGraph(crossed);
    const b = buildSankeyGraph(crossed);
    expect(a.layers).toEqual(b.layers);
    expect(a.nodes.map((n) => n.order)).toEqual(b.nodes.map((n) => n.order));
    // A crossing-free graph is left exactly as laid out.
    const clean = parseSankeyGraph(simple);
    const layers = assignLayers(clean, 'justify');
    expect(countCrossings(clean, layers)).toBe(0);
    expect(orderLayers(clean, layers)).toEqual([[0], [1, 2]]);
  });
});

describe('sankey geometry (node sizing & ribbons)', () => {
  it('sizes node bars ∝ throughput and fills the plot height with nodePadding gaps', () => {
    const g = buildSankeyGraph(simple);
    const L = computeSankeyLayout(g, PLOT);
    expect(L.nodeWidth).toBe(SANKEY_DEFAULT_NODE_WIDTH);
    expect(L.nodePadding).toBe(SANKEY_DEFAULT_NODE_PADDING);
    // The tightest layer (2 bars + one 8px gap) fixes the value scale.
    expect(L.ky).toBeCloseTo((376 - 8) / 10, 10);

    const [a, b, c] = [L.boxes[0]!, L.boxes[1]!, L.boxes[2]!];
    expect(a.h).toBeCloseTo(368, 10);
    expect(b.h / c.h).toBeCloseTo(6 / 4, 10); // heights ∝ throughput
    expect(b.h + c.h + L.nodePadding).toBeCloseTo(376, 10);
    // Layer columns: first at the left edge, last flush with the right edge.
    expect([a.x, a.y, a.w]).toEqual([12, 16, 16]);
    expect(b.x).toBeCloseTo(572, 10);
    expect(c.y).toBeCloseTo(240.8, 10);
    // The 2px gap floor always applies.
    expect(computeSankeyLayout(g, PLOT, { nodePadding: 0 }).nodePadding).toBe(SANKEY_MIN_NODE_GAP);
  });

  it('stacks ribbon offsets so both ends add up to the node heights', () => {
    const g = buildSankeyGraph(simple);
    const L = computeSankeyLayout(g, PLOT);
    const [ab, ac] = [L.ribbons[0]!, L.ribbons[1]!];
    const a = L.boxes[0]!;

    // Source end: contiguous stack starting at the node top, ending at its base.
    expect(ab.y0a).toBeCloseTo(a.y, 10);
    expect(ab.y0b).toBeCloseTo(ac.y0a, 10);
    expect(ac.y0b).toBeCloseTo(a.y + a.h, 10);
    expect(ab.y0b - ab.y0a + (ac.y0b - ac.y0a)).toBeCloseTo(a.h, 10);
    // Target ends meet their node edges exactly.
    expect(ab.y1a).toBeCloseTo(L.boxes[1]!.y, 10);
    expect(ab.y1b - ab.y1a).toBeCloseTo(L.boxes[1]!.h, 10);
    expect(ac.y1a).toBeCloseTo(L.boxes[2]!.y, 10);
    expect(ac.y1b).toBeCloseTo(L.boxes[2]!.y + L.boxes[2]!.h, 10);
    // Ribbons span node edge to node edge.
    expect(ab.x0).toBeCloseTo(a.x + a.w, 10);
    expect(ab.x1).toBeCloseTo(L.boxes[1]!.x, 10);
  });

  it('draws ribbons as cubic Béziers with control points on the mid-x', () => {
    const g = buildSankeyGraph(simple);
    const L = computeSankeyLayout(g, PLOT);
    const rb = L.ribbons[0]!;
    expect(rb.path.map((c) => c[0])).toEqual(['M', 'C', 'L', 'C', 'Z']);
    expect(rb.path[1]).toEqual(['C', 300, rb.y0a, 300, rb.y1a, rb.x1, rb.y1a]);
    expect(rb.path[3]).toEqual(['C', 300, rb.y1b, 300, rb.y0b, rb.x0, rb.y0b]);
    // Halfway across, a ribbon sits halfway between its two ends.
    const mid = ribbonEdgesAtX(rb, 300)!;
    expect(mid.top).toBeCloseTo((rb.y0a + rb.y1a) / 2, 6);
    expect(mid.bottom).toBeCloseTo((rb.y0b + rb.y1b) / 2, 6);
    expect(ribbonEdgesAtX(rb, rb.x0 - 1)).toBeNull();
  });

  it('walks nodes then that node’s outgoing links, once each', () => {
    const g = buildSankeyGraph(simple);
    const entries = sankeyReadingOrder(g);
    expect(entries).toHaveLength(g.nodes.length + g.links.length);
    expect(
      entries.map((e) => (e.kind === 'node' ? e.node.label : `${e.source.label}>${e.target.label}`)),
    ).toEqual(['A', 'A>B', 'A>C', 'B', 'C']);
    // Palette slots follow that same node sequence.
    expect(sankeyNodeColors(g, lightTheme)).toEqual([
      lightTheme.series[0],
      lightTheme.series[1],
      lightTheme.series[2],
    ]);
  });
});

describe('sankey rendering & interaction', () => {
  it('renderer call log: ribbons at 0.45 alpha under the node bars, labels in ink', () => {
    const { el } = mount({ type: 'sankey', data: graphData(simple) });
    const ctx = ctxOf(el);
    // 2 ribbons = 2 cubic paths (2 bezierCurveTo each).
    expect(ctx.__calls.filter((c) => c.method === 'bezierCurveTo')).toHaveLength(4);
    // Control points on the mid-x (300), landing on B's top edge (572, 12).
    const firstCurve = (ctx.__calls.find((c) => c.method === 'bezierCurveTo')!.args as number[]).map((v) =>
      Math.round(v * 1e6) / 1e6,
    );
    expect(firstCurve).toEqual([300, 16, 300, 12, 572, 12]);
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === SANKEY_LINK_ALPHA)).toBe(true);
    // 3 node bars (+ the surface clear).
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect');
    expect(rects).toHaveLength(4);
    expect(rects[1]!.args).toEqual([12, 16, 16, 368]);
    expect((rects[2]!.args[1] as number)).toBeCloseTo(12, 10);
    expect((rects[3]!.args[1] as number)).toBeCloseTo(240.8, 10);
    // Direct node labels, in ink (never the mark color).
    expect(paintedText(el)).toEqual(['A', 'B', 'C']);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.textPrimary)).toBe(true);
  });

  it('legend is hidden by default (nodes are labelled directly) and lists nodes when asked', () => {
    const { el } = mount({ type: 'sankey', data: graphData(simple) });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');

    const shown = mount({ type: 'sankey', data: graphData(simple), legend: true });
    const items = [...shown.el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['A', 'B', 'C']);
    expect(items.every((i) => i.disabled)).toBe(true);
    expect(items[0]!.querySelector<HTMLElement>('.chartcraft-legend-swatch')!.style.background).toBe(
      'rgb(42, 120, 214)',
    );
  });

  it('a11y table = node totals with their links indented beneath (source, target, value)', () => {
    const { el, chart } = mount({ type: 'sankey', data: graphData(simple) });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Node / link',
      'Source',
      'Target',
      'Value',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['A', '—', '—', '10'],
      ['  A → B', 'A', 'B', '6'],
      ['  A → C', 'A', 'C', '4'],
      ['B', '—', '—', '6'],
      ['C', '—', '—', '4'],
    ]);
    // exportData mirrors exactly that table.
    expect(chart.exportData().split('\n')[1]).toBe('A,—,—,10');
  });

  it('hit-tests node bars and ribbons, and fires point events with the reading-order index', () => {
    const { el, chart } = mount({ type: 'sankey', data: graphData(simple) });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);

    pointerMove(el, 20, 200); // inside node A's bar
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Energy', dataIndex: 0 });

    pointerMove(el, 300, 100); // inside the A → B ribbon (entry 1)
    expect(onEnter.mock.calls[1]![0]).toMatchObject({ dataIndex: 1 });

    pointerMove(el, 300, 390); // below every mark
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('none');
  });

  it('tooltip shows node in/out totals, and a link with its share of the source', () => {
    const { el } = mount({ type: 'sankey', data: graphData(simple) });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;

    pointerMove(el, 20, 200);
    expect(tip.innerHTML).toContain('>A<');
    expect(tip.innerHTML).toContain('0 in · 10 out');

    pointerMove(el, 300, 100);
    expect(tip.innerHTML).toContain('A → B');
    expect(tip.innerHTML).toContain('6 (60% of A)');
  });

  it('keyboard walks nodes then their links, announcing layer and share', () => {
    const { el } = mount({ type: 'sankey', data: graphData(simple) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A: 0 in, 10 out. Node 1 of 3, layer 1 of 2.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A to B: 6, 60% of A. Link 1 of 2.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A to C: 4, 40% of A. Link 2 of 2.');
    key(el, 'End');
    expect(region.textContent).toBe('C: 4 in, 0 out. Node 3 of 3, layer 2 of 2.');
    key(el, 'ArrowRight'); // clamped at the last entry
    expect(region.textContent).toBe('C: 4 in, 0 out. Node 3 of 3, layer 2 of 2.');
  });

  it('honors sankey.align, nodeWidth and nodePadding through the mounted pipeline', () => {
    const { el } = mount({
      type: 'sankey',
      data: graphData(forked),
      sankey: { align: 'left', nodeWidth: 24, nodePadding: 20 },
    });
    const rects = ctxOf(el).__calls.filter((c) => c.method === 'fillRect').slice(1);
    // 'left' keeps B in layer 1 -> three columns, two bars in the middle one.
    expect(rects).toHaveLength(4);
    expect(rects.map((r) => r.args[2])).toEqual([24, 24, 24, 24]);
    const xs = [...new Set(rects.map((r) => r.args[0] as number))].sort((a, b) => a - b);
    expect(xs).toEqual([12, 288, 564]);
    // Table order follows the 'left' reading order (A, its links, then B, C, D).
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual([
      'A',
      '  A → B',
      '  A → C',
      'B',
      'C',
      '  C → D',
      'D',
    ]);
  });

  it('rejects a cyclic graph and a non-graph payload at createChart time', () => {
    expect(() =>
      mount({
        type: 'sankey',
        data: graphData({
          nodes: [{ id: 'A' }, { id: 'B' }],
          links: [
            { source: 'A', target: 'B', value: 1 },
            { source: 'B', target: 'A', value: 1 },
          ],
        }),
      }),
    ).toThrow(/cycle: A → B → A/);
    expect(() => mount({ type: 'sankey', data: graphData([1, 2, 3]) })).toThrow(/nodes: \{ id/);
  });

  it('renders nothing (but stays mounted) for an empty graph', () => {
    const { el } = mount({ type: 'sankey', data: graphData({ nodes: [], links: [] }) });
    expect(ctxOf(el).__calls.filter((c) => c.method === 'fillRect')).toHaveLength(1); // clear only
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(0);
  });
});
