import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMatrixChartTypes } from '../src/charts/matrix';
import { buildHierarchy } from '../src/charts/matrix/hierarchy';
import {
  computeSunburstSlices,
  SUNBURST_HOLE_RATIO,
  SUNBURST_START_ANGLE as START_ANGLE,
} from '../src/charts/matrix/sunburst';
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

describe('sunburst angular layout (exact math)', () => {
  const plot = { x: 0, y: 0, w: 200, h: 200 };
  const h = buildHierarchy(nested, lightTheme);
  const slices = computeSunburstSlices(h, plot);

  it('top-level angular extents are proportional to value/total, starting at 12 o\'clock', () => {
    // A = 3/4 of the circle, B = 1/4.
    const a = slices[0]!;
    const b = slices[3]!;
    expect(a.a0).toBeCloseTo(START_ANGLE, 10);
    expect(a.a1).toBeCloseTo(START_ANGLE + 1.5 * Math.PI, 10);
    expect(b.a0).toBeCloseTo(a.a1, 10);
    expect(b.a1).toBeCloseTo(START_ANGLE + 2 * Math.PI, 10);
  });

  it('children subdivide the parent span proportionally to value within the parent', () => {
    const a = slices[0]!;
    const a1 = slices[1]!;
    const a2 = slices[2]!;
    expect(a1.a0).toBeCloseTo(a.a0, 10);
    expect(a1.a1 - a1.a0).toBeCloseTo((a.a1 - a.a0) * (2 / 3), 10);
    expect(a2.a0).toBeCloseTo(a1.a1, 10);
    expect(a2.a1).toBeCloseTo(a.a1, 10);
  });

  it('depth maps to rings: root innermost above the donut hole, children outward', () => {
    // R = 200/2 - 4 = 96; hole = 24; two rings of 36 each.
    const R = 96;
    const hole = R * SUNBURST_HOLE_RATIO;
    const ringW = (R - hole) / 2;
    expect(slices[0]!.r0).toBeCloseTo(hole, 10);
    expect(slices[0]!.r1).toBeCloseTo(hole + ringW, 10);
    expect(slices[1]!.r0).toBeCloseTo(hole + ringW, 10);
    expect(slices[1]!.r1).toBeCloseTo(R, 10);
    expect(slices[0]!.cx).toBe(100);
    expect(slices[0]!.cy).toBe(100);
  });

  it('slices come in depth-first order with pi = flatIndex and hierarchy colors', () => {
    expect(slices.map((s) => s.pi)).toEqual([0, 1, 2, 3]);
    expect(slices.map((s) => s.label)).toEqual(['A', 'a1', 'a2', 'B']);
    expect(slices[0]!.color).toBe(lightTheme.series[0]);
    expect(slices[3]!.color).toBe(lightTheme.series[1]);
    expect(slices[1]!.color).toBe(h.nodes[1]!.color); // lightness step, not a new slot
  });
});

describe('sunburst rendering', () => {
  it('draws one sector per node with 2px surface gaps and the root total in the hole', () => {
    const { el } = mount({ type: 'sunburst', data: treeData(nested) });
    const ctx = ctxOf(el);
    // Each ring sector traces two arcs (outer + inner return).
    expect(ctx.__calls.filter((c) => c.method === 'arc')).toHaveLength(8);
    // Sector gap: surface-colored stroke, width 2.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#fcfcfb')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 2)).toBe(true);
    // Donut hole shows the root total (4) in textPrimary ink.
    expect(paintedText(el)).toContain('4');
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#0b0b0b')).toBe(true);
  });

  it('renders nothing but the total when the tree is empty', () => {
    const { el } = mount({ type: 'sunburst', data: treeData([]) });
    expect(ctxOf(el).__calls.filter((c) => c.method === 'arc')).toHaveLength(0);
  });
});

describe('sunburst legend, a11y, interaction', () => {
  it('legend lists top-level nodes, non-toggleable', () => {
    const { el, chart } = mount({ type: 'sunburst', data: treeData(nested) });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['A', 'B']);
    expect(items.every((i) => i.disabled)).toBe(true);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('a11y table = indented label + value + share (same shape as treemap)', () => {
    const { el } = mount({ type: 'sunburst', data: treeData(nested) });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Node',
      'Value',
      'Share',
    ]);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['A', '3', '75%'],
      ['  a1', '2', '50%'],
      ['  a2', '1', '25%'],
      ['B', '1', '25%'],
    ]);
  });

  it('keyboard walks ALL nodes depth-first (parents included)', () => {
    const { el } = mount({ type: 'sunburst', data: treeData(nested) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A: 3 (75%). Node 1 of 4.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A / a1: 2 (50%). Node 2 of 4.');
    key(el, 'End');
    expect(region.textContent).toBe('B: 1 (25%). Node 4 of 4.');
  });

  it('keyboard focus shows the tooltip with path, value and share', () => {
    const { el } = mount({ type: 'sunburst', data: treeData(nested) });
    key(el, 'ArrowRight');
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('A');
    expect(tip.innerHTML).toContain('3 (75%)');
  });

  it('pointer hit resolves the ring sector under the cursor', () => {
    const { el, chart } = mount({ type: 'sunburst', data: treeData(nested) });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // Chart center (300, 200); R = 184, hole 46, ringW 69. Angle 0 (east)
    // falls inside A's span; radius 80 is within the root ring (46..115).
    pointerMove(el, 380, 200);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Total', dataIndex: 0 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.innerHTML).toContain('3 (75%)');
    // The hole itself is not a mark.
    pointerMove(el, 300, 200);
    const leaveTip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(leaveTip.style.display).toBe('none');
  });

  it('outer-ring hit resolves the child arc (depth-first index)', () => {
    const { el, chart } = mount({ type: 'sunburst', data: treeData(nested) });
    const enters: number[] = [];
    chart.on('pointenter', (e) => enters.push(e.dataIndex));
    // a1 spans -pi/2 .. pi/2 on the outer ring (115..184): east at r=150.
    pointerMove(el, 450, 200);
    expect(enters).toEqual([1]);
  });
});
