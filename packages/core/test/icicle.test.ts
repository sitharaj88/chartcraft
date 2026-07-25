/**
 * icicle (v0.3): rectangular partition — depth = row, width proportional to
 * value within the parent. Same palette rules as treemap (top-level slots in
 * order, children = lightness steps toward the surface), 2px surface gaps,
 * measured direct labels, keyboard depth-first, indented a11y table.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHierarchyChartTypes } from '../src/charts/hierarchy';
import { computeIcicleRects, ICICLE_CELL_GAP } from '../src/charts/hierarchy/icicle';
import { fitLabel, insetRect, seededRandom, seededShuffle } from '../src/charts/hierarchy/shared';
import { buildHierarchy } from '../src/charts/matrix/hierarchy';
import { mixHex } from '../src/charts/matrix/color-scale';
import { CHILD_MIX_MAX } from '../src/charts/matrix/hierarchy';
import { lightTheme } from '../src/theme';
import type { ChartData, TreeNode } from '../src/types';
import type { Rect } from '../src/layout';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerHierarchyChartTypes();
afterEach(cleanupDom);

const treeData = (nodes: TreeNode[]): ChartData => ({
  series: [{ name: 'Total', data: nodes }],
});

/** A(3) = a1(2) + a2(1), B(1). total 4, maxDepth 1, 4 nodes. */
const nested: TreeNode[] = [
  { label: 'A', children: [{ label: 'a1', value: 2 }, { label: 'a2', value: 1 }] },
  { label: 'B', value: 1 },
];

/** Three levels: X(6) = x1(4) [x1a(3) + x1b(1)] + x2(2). */
const deep: TreeNode[] = [
  {
    label: 'X',
    children: [
      { label: 'x1', children: [{ label: 'x1a', value: 3 }, { label: 'x1b', value: 1 }] },
      { label: 'x2', value: 2 },
    ],
  },
];

const PLOT: Rect = { x: 0, y: 0, w: 100, h: 100 };

describe('icicle partition (pure layout math)', () => {
  it('places every node at depth = row with width proportional to value', () => {
    const h = buildHierarchy(nested, lightTheme);
    const rects = computeIcicleRects(h, PLOT);
    // Depth-first flat order: A, a1, a2, B. Two rows -> rowH = 50.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 75, h: 50 }); // A = 3/4 of the width
    expect(rects[1]).toEqual({ x: 0, y: 50, w: 50, h: 50 }); // a1 = 2/3 of A
    expect(rects[2]).toEqual({ x: 50, y: 50, w: 25, h: 50 }); // a2 = 1/3 of A
    expect(rects[3]).toEqual({ x: 75, y: 0, w: 25, h: 50 }); // B = 1/4 of the width
  });

  it('row widths sum to the level total, and children exactly fill their parent', () => {
    const h = buildHierarchy(nested, lightTheme);
    const rects = computeIcicleRects(h, PLOT);
    const widthAtDepth = (d: number) =>
      h.nodes.reduce((acc, n) => (n.depth === d ? acc + (rects[n.flatIndex] as Rect).w : acc), 0);
    expect(widthAtDepth(0)).toBeCloseTo(100, 10); // roots tile the whole plot width
    expect(widthAtDepth(1)).toBeCloseTo(75, 10); // only A has children
    for (const n of h.nodes) {
      if (n.children.length === 0) continue;
      const kidsW = n.children.reduce((acc, c) => acc + (rects[c.flatIndex] as Rect).w, 0);
      expect(kidsW).toBeCloseTo((rects[n.flatIndex] as Rect).w, 10);
      // Children start flush with the parent's left edge.
      expect((rects[n.children[0]!.flatIndex] as Rect).x).toBeCloseTo((rects[n.flatIndex] as Rect).x, 10);
    }
  });

  it('row height is plot.h / (maxDepth + 1) and every row is offset by its depth', () => {
    const h = buildHierarchy(deep, lightTheme);
    expect(h.maxDepth).toBe(2);
    const rects = computeIcicleRects(h, { x: 10, y: 20, w: 60, h: 90 });
    const rowH = 90 / 3;
    for (const n of h.nodes) {
      const r = rects[n.flatIndex] as Rect;
      expect(r.h).toBeCloseTo(rowH, 10);
      expect(r.y).toBeCloseTo(20 + n.depth * rowH, 10);
    }
    // X spans the full width; x1 = 4/6 of it, x1a = 3/4 of x1.
    expect((rects[0] as Rect).w).toBeCloseTo(60, 10);
    expect((rects[1] as Rect).w).toBeCloseTo(40, 10);
    expect((rects[2] as Rect).w).toBeCloseTo(30, 10);
    expect((rects[4] as Rect).w).toBeCloseTo(20, 10); // x2
  });

  it('zero and negative values collapse to zero width without producing NaN', () => {
    const h = buildHierarchy(
      [{ label: 'Z', children: [{ label: 'z1', value: 0 }, { label: 'z2', value: -5 }] }],
      lightTheme,
    );
    const rects = computeIcicleRects(h, PLOT);
    for (const r of rects) {
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.w)).toBe(true);
      expect(r.w).toBe(0);
    }
  });

  it('2px gaps inset each cell by 1px per side; fitLabel measures and ellipsizes', () => {
    expect(ICICLE_CELL_GAP).toBe(2);
    expect(insetRect({ x: 10, y: 20, w: 30, h: 40 }, ICICLE_CELL_GAP / 2)).toEqual({
      x: 11,
      y: 21,
      w: 28,
      h: 38,
    });
    // Degenerate cells never go negative.
    expect(insetRect({ x: 0, y: 0, w: 1, h: 1 }, 1)).toEqual({ x: 1, y: 1, w: 0, h: 0 });
    const m = (t: string) => t.length * 6;
    expect(fitLabel('Hello', 30, m)).toBe('Hello');
    expect(fitLabel('Hello!', 30, m)).toBe('Hell…');
    expect(fitLabel('ab', 5, m)).toBeNull();
  });

  it('the seeded generator is reproducible and never touches Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const draw = (seed: number): number[] => {
      const rand = seededRandom(seed);
      return [rand(), rand(), rand(), rand(), rand()];
    };
    const a = draw(1234);
    expect(a).toEqual(draw(1234)); // same seed -> same stream
    expect(a).not.toEqual(draw(4321)); // different seed -> different stream
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededShuffle([1, 2, 3, 4, 5], seededRandom(7))).toEqual(
      seededShuffle([1, 2, 3, 4, 5], seededRandom(7)),
    );
    expect([...seededShuffle([1, 2, 3, 4, 5], seededRandom(7))].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('icicle coloring & rendering', () => {
  it('top-level nodes take palette slots in order; children step toward the surface', () => {
    const h = buildHierarchy(nested, lightTheme);
    expect(h.nodes[0]!.color).toBe(lightTheme.series[0]);
    expect(h.nodes[3]!.color).toBe(lightTheme.series[1]); // slot order, not value order
    expect(h.nodes[1]!.color).toBe(mixHex(lightTheme.series[0]!, lightTheme.surface, (1 / 3) * CHILD_MIX_MAX));
    expect(h.nodes[2]!.color).toBe(mixHex(lightTheme.series[0]!, lightTheme.surface, (2 / 3) * CHILD_MIX_MAX));
  });

  it('renders one gap-inset rect per node and paints fitting labels in contrast ink', () => {
    const { el } = mount({ type: 'icicle', data: treeData(nested) });
    const ctx = ctxOf(el);
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect');
    // clear() + one cell per node (4 nodes).
    expect(rects).toHaveLength(5);
    // plot = { x: 12, y: 12, w: 576, h: 376 }; A = 3/4 width, top row.
    expect(rects[1]!.args).toEqual([13, 13, 430, 186]);
    // B: x = 12 + 432 + 1, w = 144 - 2.
    expect(rects[4]!.args).toEqual([445, 13, 142, 186]);
    const texts = paintedText(el);
    for (const t of ['A', 'a1', 'a2', 'B']) expect(texts).toContain(t);
    // Contrast ink (white on these mid-dark cells), never the mark color.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#ffffff')).toBe(true);
  });

  it('skips direct labels on cells that are too small (selective, not exhaustive)', () => {
    const many: TreeNode[] = Array.from({ length: 40 }, (_, i) => ({
      label: `Node-${i + 1}-with-a-long-name`,
      value: i === 0 ? 1000 : 0.01,
    }));
    const { el } = mount({ type: 'icicle', data: treeData(many), width: 200, height: 120 });
    expect(paintedText(el).length).toBeLessThan(many.length);
  });
});

describe('icicle legend, a11y, interaction', () => {
  it('legend lists top-level nodes non-toggleably and auto-hides for a single root', () => {
    const { el, chart } = mount({ type: 'icicle', data: treeData(nested) });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['A', 'B']);
    expect(items.every((i) => i.disabled)).toBe(true);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[0]!.click();
    expect(onToggle).not.toHaveBeenCalled();
    const single = mount({ type: 'icicle', data: treeData([{ label: 'Only', value: 1 }]) });
    expect((single.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table = indented label + value + share, depth-first', () => {
    const { el, chart } = mount({ type: 'icicle', data: treeData(nested) });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Node',
      'Value',
      'Share',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['A', '3', '75%'],
      ['  a1', '2', '50%'],
      ['  a2', '1', '25%'],
      ['B', '1', '25%'],
    ]);
    // exportData mirrors the table exactly.
    expect(chart.exportData()).toBe('Node,Value,Share\nA,3,75%\n  a1,2,50%\n  a2,1,25%\nB,1,25%');
  });

  it('keyboard walks ALL nodes depth-first, announcing path, share and row', () => {
    const { el } = mount({ type: 'icicle', data: treeData(nested) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A: 3 (75%). Row 1, node 1 of 4.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A / a1: 2 (50%). Row 2, node 2 of 4.');
    key(el, 'End');
    expect(region.textContent).toBe('B: 1 (25%). Row 1, node 4 of 4.');
    key(el, 'ArrowRight'); // clamped at the last node
    expect(region.textContent).toBe('B: 1 (25%). Row 1, node 4 of 4.');
    key(el, 'Home');
    expect(region.textContent).toBe('A: 3 (75%). Row 1, node 1 of 4.');
  });

  it('hit-testing resolves the cell under the pointer and the tooltip names the path', () => {
    const { el, chart } = mount({ type: 'icicle', data: treeData(nested) });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // a1 occupies { x: 13, y: 201, w: 286, h: 186 } (second row, left).
    pointerMove(el, 150, 250);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Total', dataIndex: 1 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('A / a1');
    expect(tip.innerHTML).toContain('2 (50%)');
    // Top row, right quarter = B.
    pointerMove(el, 500, 50);
    expect(tip.innerHTML).toContain('B');
    expect(tip.innerHTML).toContain('1 (25%)');
    // Outside every cell (below the last row): no tooltip.
    pointerMove(el, 500, 395);
    expect(tip.style.display).toBe('none');
  });
});
