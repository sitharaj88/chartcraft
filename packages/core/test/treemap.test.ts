import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMatrixChartTypes } from '../src/charts/matrix';
import { squarify } from '../src/charts/matrix/squarify';
import {
  buildHierarchy,
  countTreeLeaves,
  countTreeNodes,
  formatShare,
  CHILD_MIX_MAX,
} from '../src/charts/matrix/hierarchy';
import { computeTreemapLeafRects, fitLabel, TREEMAP_CELL_GAP } from '../src/charts/matrix/treemap';
import { contrastInk, mixHex } from '../src/charts/matrix/color-scale';
import { lightTheme } from '../src/theme';
import type { ChartData, TreeNode } from '../src/types';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerMatrixChartTypes();
afterEach(cleanupDom);

const treeData = (nodes: TreeNode[]): ChartData => ({
  series: [{ name: 'Total', data: nodes }],
});

const nested: TreeNode[] = [
  { label: 'A', children: [{ label: 'a1', value: 2 }, { label: 'a2', value: 1 }] },
  { label: 'B', value: 1 },
];

describe('squarify (pure layout math)', () => {
  const rect = { x: 0, y: 0, w: 6, h: 4 };
  const values = [6, 6, 4, 3, 2, 2, 1];

  it('reproduces the Bruls et al. worked example: first row = two 3x2 rects', () => {
    const rects = squarify(values, rect);
    expect(rects[0]).toMatchObject({ x: 0, y: 0 });
    expect(rects[0]!.w).toBeCloseTo(3, 10);
    expect(rects[0]!.h).toBeCloseTo(2, 10);
    expect(rects[1]).toMatchObject({ x: 0, y: 2 });
    expect(rects[1]!.w).toBeCloseTo(3, 10);
    expect(rects[1]!.h).toBeCloseTo(2, 10);
  });

  it('rect areas are exactly proportional to values and tile the input rect', () => {
    const rects = squarify(values, rect);
    const total = values.reduce((a, b) => a + b, 0);
    const scale = (rect.w * rect.h) / total;
    let areaSum = 0;
    rects.forEach((r, i) => {
      expect(r.w * r.h).toBeCloseTo(values[i]! * scale, 8);
      areaSum += r.w * r.h;
      // Every rect stays within the bounds.
      expect(r.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(r.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(rect.x + rect.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(rect.y + rect.h + 1e-9);
    });
    expect(areaSum).toBeCloseTo(rect.w * rect.h, 8);
  });

  it('keeps aspect ratios square-ish (all <= 4 for the paper example)', () => {
    for (const r of squarify(values, rect)) {
      expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThanOrEqual(4);
    }
  });

  it('zero / negative values yield zero-size rects; all-zero input never divides by zero', () => {
    const rects = squarify([3, 0, -2, 1], { x: 10, y: 20, w: 100, h: 50 });
    expect(rects[1]).toEqual({ x: 10, y: 20, w: 0, h: 0 });
    expect(rects[2]).toEqual({ x: 10, y: 20, w: 0, h: 0 });
    expect(rects[0]!.w * rects[0]!.h).toBeCloseTo(3750, 8);
    const empty = squarify([0, 0], { x: 0, y: 0, w: 10, h: 10 });
    expect(empty.every((r) => r.w === 0 && r.h === 0)).toBe(true);
  });
});

describe('hierarchy (values, paths, colors)', () => {
  it('parent value = sum of children; depth-first flat & leaf orders; paths use " / "', () => {
    const h = buildHierarchy(nested, lightTheme);
    expect(h.total).toBe(4);
    expect(h.nodes.map((n) => n.label)).toEqual(['A', 'a1', 'a2', 'B']);
    expect(h.leaves.map((n) => n.label)).toEqual(['a1', 'a2', 'B']);
    expect(h.nodes[0]!.value).toBe(3);
    expect(h.nodes[1]!.path).toBe('A / a1');
    expect(h.leaves[2]!.leafIndex).toBe(2);
    expect(h.maxDepth).toBe(1);
  });

  it('top-level nodes take palette slots in order; children step toward the surface color', () => {
    const h = buildHierarchy(nested, lightTheme);
    expect(h.nodes[0]!.color).toBe(lightTheme.series[0]); // #2a78d6
    expect(h.nodes[3]!.color).toBe(lightTheme.series[1]); // #eb6834 — slot order, not size order
    // Children: mix(parent, surface, (j+1)/(k+1) * CHILD_MIX_MAX) — never new slots.
    expect(h.nodes[1]!.color).toBe(mixHex('#2a78d6', lightTheme.surface, (1 / 3) * CHILD_MIX_MAX));
    expect(h.nodes[2]!.color).toBe(mixHex('#2a78d6', lightTheme.surface, (2 / 3) * CHILD_MIX_MAX));
    expect(h.nodes[1]!.color).not.toBe(h.nodes[2]!.color);
  });

  it('explicit node colors win; counting helpers agree with the structure', () => {
    const h = buildHierarchy([{ label: 'X', value: 1, color: '#123456' }], lightTheme);
    expect(h.nodes[0]!.color).toBe('#123456');
    expect(countTreeLeaves(nested)).toBe(3);
    expect(countTreeNodes(nested)).toBe(4);
    expect(formatShare(1, 3)).toBe('33.3%');
    expect(formatShare(3, 4)).toBe('75%');
  });

  it('contrastInk picks dark ink on light cells and white ink on dark cells', () => {
    expect(contrastInk('#cde2fb')).toBe('#0b0b0b');
    expect(contrastInk('#0d366b')).toBe('#ffffff');
  });
});

describe('treemap layout & labels', () => {
  it('nests squarified children inside their parent rect (exact rects)', () => {
    const h = buildHierarchy(nested, lightTheme);
    const rects = computeTreemapLeafRects(h, { x: 0, y: 0, w: 100, h: 100 });
    // Roots [A=3, B=1]: A takes the left 75x100 strip, B the right 25x100.
    expect(rects[2]).toMatchObject({ x: 75, y: 0, w: 25, h: 100 }); // leaf B
    // A's children subdivide A's strip: a1 = 75 x 66.67 on top, a2 below.
    expect(rects[0]!.x).toBeCloseTo(0, 8);
    expect(rects[0]!.y).toBeCloseTo(0, 8);
    expect(rects[0]!.w).toBeCloseTo(75, 8);
    expect(rects[0]!.h).toBeCloseTo(200 / 3, 8);
    expect(rects[1]!.y).toBeCloseTo(200 / 3, 8);
    expect(rects[1]!.h).toBeCloseTo(100 / 3, 8);
  });

  it('fitLabel measures, ellipsizes, and gives up when nothing fits', () => {
    const m = (t: string) => t.length * 6;
    expect(fitLabel('Hello', 30, m)).toBe('Hello');
    expect(fitLabel('Hello!', 30, m)).toBe('Hell…');
    expect(fitLabel('ab', 5, m)).toBeNull();
  });

  it('renders one gap-inset cell per leaf and paints fitting labels in contrasting ink', () => {
    const { el } = mount({ type: 'treemap', data: treeData(nested) });
    const ctx = ctxOf(el);
    // clear + 3 leaf cells.
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect');
    expect(rects).toHaveLength(4);
    // 2px gaps: each cell is inset by half the gap on every side.
    const [x, y] = rects[1]!.args as number[];
    expect(x).toBeCloseTo(12 + TREEMAP_CELL_GAP / 2, 5);
    expect(y).toBeCloseTo(12 + TREEMAP_CELL_GAP / 2, 5);
    const texts = paintedText(el);
    for (const t of ['a1', 'a2', 'B']) expect(texts).toContain(t);
    // Contrasting ink (white on these mid-dark cells), never the mark color.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#ffffff')).toBe(true);
  });

  it('skips labels on cells that are too small', () => {
    const many: TreeNode[] = Array.from({ length: 40 }, (_, i) => ({
      label: `Node-${i + 1}-with-a-long-name`,
      value: i === 0 ? 1000 : 0.01,
    }));
    const { el } = mount({ type: 'treemap', data: treeData(many), width: 200, height: 120 });
    const texts = paintedText(el);
    expect(texts.length).toBeLessThan(many.length);
  });
});

describe('treemap legend, a11y, interaction', () => {
  it('legend lists top-level nodes, non-toggleable', () => {
    const { el, chart } = mount({ type: 'treemap', data: treeData(nested) });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['A', 'B']);
    expect(items.every((i) => i.disabled)).toBe(true);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[0]!.click();
    expect(onToggle).not.toHaveBeenCalled();
    // Single top-level node: nothing to distinguish, legend auto-hides.
    const single = mount({ type: 'treemap', data: treeData([{ label: 'Only', value: 1 }]) });
    expect((single.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table = indented label + value + share, depth-first', () => {
    const { el } = mount({ type: 'treemap', data: treeData(nested) });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Node', 'Value', 'Share']);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['A', '3', '75%'],
      ['  a1', '2', '50%'],
      ['  a2', '1', '25%'],
      ['B', '1', '25%'],
    ]);
  });

  it('keyboard walks leaves depth-first with path announcements', () => {
    const { el } = mount({ type: 'treemap', data: treeData(nested) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A / a1: 2 (50%). Cell 1 of 3.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A / a2: 1 (25%). Cell 2 of 3.');
    key(el, 'End');
    expect(region.textContent).toBe('B: 1 (25%). Cell 3 of 3.');
    key(el, 'ArrowRight'); // clamped at the last leaf
    expect(region.textContent).toBe('B: 1 (25%). Cell 3 of 3.');
  });

  it('tooltip shows the node path and value', () => {
    const { el } = mount({ type: 'treemap', data: treeData(nested) });
    // a1 occupies the top-left cell of A's strip (~432px wide, split 2:1).
    pointerMove(el, 150, 200);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('A / a1');
    expect(tip.innerHTML).toContain('>2<');
  });

  it('pointer hit-testing resolves the leaf cell and fires point events', () => {
    const { el, chart } = mount({ type: 'treemap', data: treeData(nested) });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, 150, 200); // inside a1 (leaf index 0 -> backing point exists)
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Total', dataIndex: 0 });
  });
});
