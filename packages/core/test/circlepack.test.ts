/**
 * circlepack (v0.3): enclosing-circle packing. Siblings are packed
 * overlap-free by a front-chain algorithm, parents take the smallest
 * enclosing circle of their children (Welzl with a SEEDED shuffle — no
 * Math.random anywhere), value maps to AREA, leaves are filled and parents
 * hairline-outlined, keyboard walks nodes depth-first.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHierarchyChartTypes } from '../src/charts/hierarchy';
import {
  circlesIntersect,
  computeCirclePack,
  packEnclose,
  packSiblings,
  PARENT_PADDING_RATIO,
  type Circle,
} from '../src/charts/hierarchy/pack';
import { circleLabelWidth } from '../src/charts/hierarchy/circlepack';
import { buildHierarchy } from '../src/charts/matrix/hierarchy';
import { lightTheme } from '../src/theme';
import type { ChartData, TreeNode } from '../src/types';
import type { Rect } from '../src/layout';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerHierarchyChartTypes();
afterEach(cleanupDom);

const treeData = (nodes: TreeNode[]): ChartData => ({
  series: [{ name: 'Total', data: nodes }],
});

/** A(3) = a1(2) + a2(1), B(1). */
const nested: TreeNode[] = [
  { label: 'A', children: [{ label: 'a1', value: 2 }, { label: 'a2', value: 1 }] },
  { label: 'B', value: 1 },
];

const PLOT: Rect = { x: 0, y: 0, w: 400, h: 400 };
/** Default mounted plot: 600x400 canvas, 12px padding. */
const MOUNTED_PLOT: Rect = { x: 12, y: 12, w: 576, h: 376 };

function noOverlaps(circles: readonly Circle[]): boolean {
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i] as Circle;
      const b = circles[j] as Circle;
      if (a.r <= 0 || b.r <= 0) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 1e-9) return false;
    }
  }
  return true;
}

describe('packSiblings (front-chain sibling packing)', () => {
  it('places two circles tangent on the x-axis, centered on their enclosure', () => {
    const { circles, radius } = packSiblings([2, 1]);
    expect(circles[0]).toEqual({ x: -1, y: 0, r: 2 });
    expect(circles[1]).toEqual({ x: 2, y: 0, r: 1 });
    // Exactly tangent, and the enclosure spans both.
    expect(Math.abs(circles[1]!.x - circles[0]!.x)).toBeCloseTo(3, 12);
    expect(radius).toBeCloseTo(3, 12);
  });

  it('packs three equal circles into an equilateral triangle (r = 1 + 2/sqrt(3))', () => {
    const { circles, radius } = packSiblings([1, 1, 1]);
    expect(radius).toBeCloseTo(1 + 2 / Math.sqrt(3), 10);
    // Every pair is exactly tangent (centers 2 apart).
    const pairs: [number, number][] = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    for (const [i, j] of pairs) {
      const a = circles[i] as Circle;
      const b = circles[j] as Circle;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2, 10);
    }
    // Centered on the enclosing circle: every circle fits inside it.
    for (const c of circles) expect(Math.hypot(c.x, c.y) + c.r).toBeLessThanOrEqual(radius + 1e-9);
  });

  it('packs many uneven circles with NO overlaps, all inside the enclosure', () => {
    const radii = [9, 7, 6.5, 5, 4, 3.25, 3, 2, 1.5, 1, 0.75];
    const { circles, radius } = packSiblings(radii);
    expect(circles.map((c) => c.r)).toEqual(radii);
    expect(noOverlaps(circles)).toBe(true);
    for (const c of circles) expect(Math.hypot(c.x, c.y) + c.r).toBeLessThanOrEqual(radius + 1e-6);
    // The enclosure cannot be smaller than the biggest circle nor absurdly big.
    expect(radius).toBeGreaterThanOrEqual(9);
    expect(radius).toBeLessThan(9 + 2 * 7);
  });

  it('stays overlap-free for 60 wildly uneven circles', () => {
    // Deterministic pseudo-random radii (no Math.random in tests either).
    const radii = Array.from({ length: 60 }, (_, i) => 1 + ((i * 37) % 23) + ((i * 11) % 7) / 3);
    const { circles, radius } = packSiblings(radii);
    expect(noOverlaps(circles)).toBe(true);
    for (const c of circles) expect(Math.hypot(c.x, c.y) + c.r).toBeLessThanOrEqual(radius + 1e-6);
  });

  it('is deterministic and never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const radii = [5, 4, 3, 3, 2, 2, 1];
    const first = packSiblings(radii);
    const second = packSiblings(radii);
    expect(second).toEqual(first);
    expect(packEnclose(first.circles)).toEqual(packEnclose(second.circles));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles degenerate input: single, empty, and zero radii', () => {
    expect(packSiblings([5])).toEqual({ circles: [{ x: 0, y: 0, r: 5 }], radius: 5 });
    expect(packSiblings([])).toEqual({ circles: [], radius: 0 });
    const zeros = packSiblings([0, -3, 0]);
    expect(zeros.radius).toBe(0);
    expect(zeros.circles).toEqual([
      { x: 0, y: 0, r: 0 },
      { x: 0, y: 0, r: 0 },
      { x: 0, y: 0, r: 0 },
    ]);
    // Zero-radius circles never perturb the real ones.
    const mixed = packSiblings([0, 2, 1]);
    expect(mixed.radius).toBeCloseTo(3, 12);
    expect(mixed.circles[0]).toEqual({ x: 0, y: 0, r: 0 });
  });
});

describe('packEnclose (seeded Welzl)', () => {
  it('encloses two separated circles exactly', () => {
    expect(packEnclose([{ x: 0, y: 0, r: 1 }, { x: 3, y: 0, r: 1 }])).toEqual({ x: 1.5, y: 0, r: 2.5 });
  });

  it('returns the circle itself for one input and a zero circle for none', () => {
    expect(packEnclose([{ x: 4, y: -2, r: 3 }])).toEqual({ x: 4, y: -2, r: 3 });
    expect(packEnclose([])).toEqual({ x: 0, y: 0, r: 0 });
  });

  it('ignores circles already contained and covers three-circle bases', () => {
    const outer = { x: 0, y: 0, r: 10 };
    expect(packEnclose([outer, { x: 1, y: 1, r: 2 }])).toEqual(outer);
    const tri = packEnclose([
      { x: -5, y: 0, r: 1 },
      { x: 5, y: 0, r: 1 },
      { x: 0, y: 6, r: 1 },
    ]);
    for (const c of [
      { x: -5, y: 0, r: 1 },
      { x: 5, y: 0, r: 1 },
      { x: 0, y: 6, r: 1 },
    ]) {
      expect(Math.hypot(c.x - tri.x, c.y - tri.y) + c.r).toBeLessThanOrEqual(tri.r + 1e-6);
    }
    expect(circlesIntersect({ x: 0, y: 0, r: 1 }, { x: 1.5, y: 0, r: 1 })).toBe(true);
    expect(circlesIntersect({ x: 0, y: 0, r: 1 }, { x: 2, y: 0, r: 1 })).toBe(false);
  });
});

describe('computeCirclePack (hierarchy layout)', () => {
  it('maps value to AREA: leaf radii are proportional to sqrt(value)', () => {
    const h = buildHierarchy([{ label: 'A', value: 4 }, { label: 'B', value: 1 }], lightTheme);
    const circles = computeCirclePack(h, MOUNTED_PLOT);
    // radius 2 : 1 for values 4 : 1 -> sqrt, never linear.
    expect(circles[0]!.r / circles[1]!.r).toBeCloseTo(2, 10);
    // Uniform scale k = target / enclosure = 186 / 3 = 62, plot center (300, 200).
    expect(circles[0]).toEqual({ x: 238, y: 200, r: 124 });
    expect(circles[1]).toEqual({ x: 424, y: 200, r: 62 });
  });

  it('never lets siblings overlap and always keeps children inside their parent', () => {
    const wide: TreeNode[] = [
      {
        label: 'A',
        children: [
          { label: 'a1', value: 8 },
          { label: 'a2', value: 5 },
          { label: 'a3', value: 3 },
          { label: 'a4', value: 1 },
        ],
      },
      { label: 'B', children: [{ label: 'b1', value: 4 }, { label: 'b2', value: 4 }] },
      { label: 'C', value: 6 },
    ];
    const h = buildHierarchy(wide, lightTheme);
    const circles = computeCirclePack(h, PLOT);

    // (1) siblings (including the roots) never overlap
    const groups: Circle[][] = [h.roots.map((n) => circles[n.flatIndex] as Circle)];
    for (const n of h.nodes) {
      if (n.children.length > 0) groups.push(n.children.map((c) => circles[c.flatIndex] as Circle));
    }
    for (const g of groups) expect(noOverlaps(g)).toBe(true);

    // (2) every child sits fully inside its parent
    for (const n of h.nodes) {
      if (!n.parent) continue;
      const c = circles[n.flatIndex] as Circle;
      const p = circles[n.parent.flatIndex] as Circle;
      expect(Math.hypot(c.x - p.x, c.y - p.y) + c.r).toBeLessThanOrEqual(p.r + 1e-6);
      // The parent padding leaves a visible gap for the hairline outline.
      expect(c.r).toBeLessThan(p.r);
    }

    // (3) everything is inside the plot's inscribed circle
    const cx = PLOT.x + PLOT.w / 2;
    const cy = PLOT.y + PLOT.h / 2;
    const target = Math.min(PLOT.w, PLOT.h) / 2 - 2;
    for (const c of circles) {
      expect(Math.hypot(c.x - cx, c.y - cy) + c.r).toBeLessThanOrEqual(target + 1e-6);
    }
    expect(PARENT_PADDING_RATIO).toBeCloseTo(0.05, 12);
  });

  it('repeats identically across runs (seeded, reproducible layout)', () => {
    const h1 = buildHierarchy(nested, lightTheme);
    const h2 = buildHierarchy(nested, lightTheme);
    expect(computeCirclePack(h2, PLOT)).toEqual(computeCirclePack(h1, PLOT));
  });

  it('survives zero-valued and empty trees without NaN', () => {
    const zero = buildHierarchy([{ label: 'Z', value: 0 }], lightTheme);
    for (const c of computeCirclePack(zero, PLOT)) {
      expect(c).toEqual({ x: 0, y: 0, r: 0 });
    }
    expect(computeCirclePack(buildHierarchy([], lightTheme), PLOT)).toEqual([]);
  });

  it('circleLabelWidth is the measured chord at the label height', () => {
    // r = 10, textH = 12 -> half-chord sqrt(100 - 36) = 8 -> 2*8 - 2 pad.
    expect(circleLabelWidth(10, 12)).toBeCloseTo(14, 12);
    expect(circleLabelWidth(6, 12)).toBe(0); // exactly as tall as the circle
    expect(circleLabelWidth(4, 12)).toBe(0); // taller than the circle
  });
});

describe('circlepack rendering, legend, a11y, interaction', () => {
  it('fills leaves, hairline-outlines parents, and labels only leaves that fit', () => {
    const { el } = mount({ type: 'circlepack', data: treeData(nested) });
    const ctx = ctxOf(el);
    const arcs = ctx.__calls.filter((c) => c.method === 'arc');
    // One circle per node: A (parent outline) + a1, a2, B (filled leaves).
    expect(arcs).toHaveLength(4);
    expect(ctx.__calls.filter((c) => c.method === 'stroke')).toHaveLength(1);
    expect(ctx.__calls.filter((c) => c.method === 'fill')).toHaveLength(3);
    // Hairline: 1px.
    expect(ctx.__props.filter((p) => p.prop === 'lineWidth').map((p) => p.value)).toContain(1);
    const texts = paintedText(el);
    expect(texts).toEqual(expect.arrayContaining(['a1', 'a2', 'B']));
    expect(texts).not.toContain('A'); // parents are outlines, not labeled cells
  });

  it('draws identical geometry on two independent mounts (determinism end to end)', () => {
    const first = mount({ type: 'circlepack', data: treeData(nested) });
    const second = mount({ type: 'circlepack', data: treeData(nested) });
    const arcsOf = (el: HTMLElement) =>
      ctxOf(el)
        .__calls.filter((c) => c.method === 'arc')
        .map((c) => c.args.slice(0, 3));
    expect(arcsOf(second.el)).toEqual(arcsOf(first.el));
  });

  it('legend lists top-level nodes non-toggleably and auto-hides for a single root', () => {
    const { el } = mount({ type: 'circlepack', data: treeData(nested) });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['A', 'B']);
    expect(items.every((i) => i.disabled)).toBe(true);
    const single = mount({ type: 'circlepack', data: treeData([{ label: 'Only', value: 1 }]) });
    expect((single.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table = indented label + value + share, depth-first', () => {
    const { el } = mount({ type: 'circlepack', data: treeData(nested) });
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
  });

  it('keyboard walks all nodes depth-first, distinguishing groups from circles', () => {
    const { el } = mount({ type: 'circlepack', data: treeData(nested) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A: 3 (75%). Group 1 of 4.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A / a1: 2 (50%). Circle 2 of 4.');
    key(el, 'End');
    expect(region.textContent).toBe('B: 1 (25%). Circle 4 of 4.');
  });

  it('hit-testing prefers the leaf over its enclosing parent, and the tooltip names the path', () => {
    const { el, chart } = mount({ type: 'circlepack', data: treeData(nested) });
    const arcs = ctxOf(el)
      .__calls.filter((c) => c.method === 'arc')
      .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number, r: c.args[2] as number }));
    const leaf = arcs[1] as { x: number; y: number; r: number }; // a1 (first leaf drawn)
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, leaf.x, leaf.y);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Total', dataIndex: 1 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('A / a1');
    expect(tip.innerHTML).toContain('2 (50%)');
    // A corner of the plot is outside every circle.
    pointerMove(el, 14, 14);
    expect(tip.style.display).toBe('none');
  });
});
