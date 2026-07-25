/**
 * Pyramid (v0.3): exactly two series mirrored around a centered category axis,
 * one shared magnitude scale, and ABSOLUTE labels on both arms.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompositionChartTypes } from '../src/charts/composition';
import {
  computePyramidLayout,
  pyramidMaxMagnitude,
  pyramidTicks,
  PYRAMID_MIN_GUTTER,
} from '../src/charts/composition/pyramid';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerCompositionChartTypes();
afterEach(cleanupDom);

const data = (): { categories: string[]; series: { name: string; data: number[] }[] } => ({
  categories: ['0-9', '10-19'],
  series: [
    { name: 'Male', data: [10, 5] },
    { name: 'Female', data: [5, 10] },
  ],
});

/**
 * Mounted geometry for 600x400 (derived): plot 12,12 576x376 minus a 20px
 * magnitude-label strip; gutter = widest label (30) + 12 = 42.
 */
const GRID = { x: 12, y: 12, w: 576, h: 356 };
const CENTER = 300;
const GUTTER_HALF = 21;
const ARM = 267;

function moveTos(el: HTMLElement): { x: number; y: number }[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'moveTo')
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
}

/** Bar rects start at (x + topLeftRadius, y); gridlines all start at grid.y. */
function barStarts(el: HTMLElement): { x: number; y: number }[] {
  return moveTos(el).filter((m) => m.y !== GRID.y);
}

describe('pyramid layout math (exact, mirrored)', () => {
  const layout = computePyramidLayout({
    rect: { x: 0, y: 0, w: 200, h: 100 },
    labels: ['a', 'b', 'c', 'd'],
    left: [10, 7, null, 10],
    right: [5, 7, 10, 0],
    gutter: 40,
  });

  it('splits the rect into a centered gutter and two equal arms', () => {
    expect(layout.center).toBe(100);
    expect(layout.gutterHalf).toBe(20);
    expect(layout.armWidth).toBe(80);
    expect(layout.maxMagnitude).toBe(10);
    expect(layout.rows).toHaveLength(4);
  });

  it('rows are evenly spaced with a 2px gap between bars', () => {
    expect(layout.rows.map((r) => r.cy)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(layout.rows.map((r) => r.h)).toEqual([23, 23, 23, 23]);
    // rowH 25 = bar 23 + the 2px gap.
    expect(layout.rows[1]!.cy - layout.rows[0]!.cy).toBe(layout.rows[0]!.h + 2);
  });

  it('both arms grow from the gutter on ONE shared magnitude scale', () => {
    const r0 = layout.rows[0]!;
    // left 10 of 10 -> the full arm; right 5 of 10 -> half of it.
    expect(r0.left).toEqual({ end: 0, base: 80, x: 0, w: 80 });
    expect(r0.right).toEqual({ end: 160, base: 120, x: 120, w: 40 });
    const r2 = layout.rows[2]!;
    expect(r2.right.w).toBe(80);
    expect(r2.right.end).toBe(200);
  });

  it('equal magnitudes are exactly mirrored about the center', () => {
    const r1 = layout.rows[1]!; // 7 and 7
    expect(r1.left.w).toBe(56);
    expect(r1.right.w).toBe(56);
    expect(layout.center - r1.left.end).toBe(r1.right.end - layout.center);
    expect(layout.center - r1.left.end).toBe(76);
  });

  it('null and zero magnitudes produce zero-width bars at the gutter', () => {
    expect(layout.rows[2]!.left).toEqual({ end: 80, base: 80, x: 80, w: 0 });
    expect(layout.rows[3]!.right).toEqual({ end: 120, base: 120, x: 120, w: 0 });
  });

  it('magnitudes are absolute: sign never reaches the geometry', () => {
    expect(pyramidMaxMagnitude([-10, 3], [4, null])).toBe(10);
    expect(pyramidMaxMagnitude([], [])).toBe(0);
    const signed = computePyramidLayout({
      rect: { x: 0, y: 0, w: 200, h: 50 },
      labels: ['a'],
      left: [-8],
      right: [8],
      gutter: 40,
    });
    expect(signed.rows[0]!.left.w).toBe(80);
    expect(signed.rows[0]!.right.w).toBe(80);
  });

  it('magnitude ticks are never negative and always start at 0', () => {
    expect(pyramidTicks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(pyramidTicks(0)).toEqual([0]);
    expect(pyramidTicks(1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(pyramidTicks(1234).every((t) => t >= 0)).toBe(true);
  });

  it('a degenerate rect still yields usable rows', () => {
    const flat = computePyramidLayout({ rect: { x: 0, y: 0, w: 10, h: 4 }, labels: ['a', 'b'], left: [1], right: [1], gutter: 40 });
    expect(flat.armWidth).toBe(0);
    expect(flat.rows.map((r) => r.h)).toEqual([1, 1]);
    expect(PYRAMID_MIN_GUTTER).toBe(24);
  });
});

describe('pyramid series-count contract', () => {
  it.each([
    [0, [] as { name: string; data: number[] }[]],
    [1, [{ name: 'Male', data: [1, 2] }]],
    [3, [
      { name: 'Male', data: [1] },
      { name: 'Female', data: [1] },
      { name: 'Other', data: [1] },
    ]],
  ])('rejects %i series with a clear error', (n, series) => {
    expect(() => mount({ type: 'pyramid', data: { categories: ['a'], series } })).toThrow(
      new RegExp(`requires exactly 2 series \\(got ${n}\\)`),
    );
  });

  it('names the type and suggests the alternative in the error', () => {
    expect(() => mount({ type: 'pyramid', data: { series: [{ name: 'Only', data: [1] }] } })).toThrow(
      /chart type 'pyramid'[\s\S]*horizontal: true/,
    );
  });

  it('accepts exactly two series', () => {
    const { el } = mount({ type: 'pyramid', data: data() });
    expect(el.querySelector('canvas')).toBeTruthy();
  });
});

describe('pyramid rendering', () => {
  it('mirrors the bars around the centered category axis', () => {
    const { el } = mount({ type: 'pyramid', data: data() });
    const bars = barStarts(el);
    expect(bars).toHaveLength(4);
    // Left arm: 4px data-end radius shifts the path start by the radius.
    // Row 0 (Male 10 of 10) spans the whole left arm: x 12..279.
    expect(bars[0]).toEqual({ x: GRID.x + 4, y: 13 });
    // Row 1 (Male 5 of 10): x 145.5..279.
    expect(bars[1]).toEqual({ x: CENTER - GUTTER_HALF - ARM / 2 + 4, y: 191 });
    // Right arm bars always start at the gutter edge (radius is on the far end).
    expect(bars[2]).toEqual({ x: CENTER + GUTTER_HALF, y: 13 });
    expect(bars[3]).toEqual({ x: CENTER + GUTTER_HALF, y: 191 });
    // Equal magnitudes (Male row 1 = Female row 0 = 5) are mirrored exactly.
    expect(CENTER - GUTTER_HALF - (bars[1]!.x - 4)).toBe(ARM / 2);
  });

  it('labels both arms with ABSOLUTE magnitudes (never a negative tick)', () => {
    const { el } = mount({ type: 'pyramid', data: data() });
    const texts = paintedText(el);
    expect(texts.some((t) => t.startsWith('-'))).toBe(false);
    // Each magnitude tick is drawn once per arm.
    for (const t of ['0', '2', '4', '6', '8', '10']) {
      expect(texts.filter((x) => x === t).length).toBe(2);
    }
    // The category axis sits in the gutter, in muted ink.
    expect(texts).toContain('0-9');
    expect(texts).toContain('10-19');
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });

  it('draws hairline magnitude gridlines under the bars', () => {
    const { el } = mount({ type: 'pyramid', data: data() });
    const grid = ctxOf(el)
      .__calls.filter((c) => c.method === 'moveTo')
      .filter((c) => c.args[1] === GRID.y);
    // 6 ticks x 2 arms.
    expect(grid).toHaveLength(12);
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#e1e0d9')).toBe(true);
  });
});

describe('pyramid legend, a11y & interaction', () => {
  it('legend is the two arms, toggleable', () => {
    const { el, chart } = mount({ type: 'pyramid', data: data() });
    const items = [...el.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Male', 'Female']);
    expect(items.every((i) => !i.disabled)).toBe(true);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'Female', visible: false });
    // Only the left arm remains (the call log is cumulative, so read the
    // frame painted after the toggle).
    expect(barStarts(el).slice(-2)).toEqual([
      { x: GRID.x + 4, y: 13 },
      { x: CENTER - GUTTER_HALF - ARM / 2 + 4, y: 191 },
    ]);
  });

  it('a11y table is category + series A + series B, in magnitudes', () => {
    const { el, chart } = mount({
      type: 'pyramid',
      data: {
        categories: ['0-9', '10-19'],
        series: [
          { name: 'Male', data: [-10, 5] },
          { name: 'Female', data: [5, null] },
        ],
      },
    });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Category',
      'Male',
      'Female',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['0-9', '10', '5'],
      ['10-19', '5', '—'],
    ]);
    expect(chart.exportData()).toBe('Category,Male,Female\n0-9,10,5\n10-19,5,—');
  });

  it('hit testing takes the full row band of the arm under the pointer', () => {
    const { el, chart } = mount({ type: 'pyramid', data: data() });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, 100, 100); // left of center, row 0
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Male', dataIndex: 0 }));
    pointerMove(el, 500, 300); // right of center, row 1
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Female', dataIndex: 1 }));
    // Below the rows there is nothing to hit.
    pointerMove(el, 500, 395);
    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it('keyboard walks categories, Up/Down swaps arms, tooltip shows magnitudes', () => {
    const { el, chart } = mount({
      type: 'pyramid',
      data: {
        categories: ['0-9', '10-19'],
        series: [
          { name: 'Male', data: [-10, 5] },
          { name: 'Female', data: [5, 10] },
        ],
      },
    });
    const enters: { seriesName: string; dataIndex: number }[] = [];
    chart.on('pointenter', (e) => enters.push({ seriesName: e.seriesName, dataIndex: e.dataIndex }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'Male', dataIndex: 0 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toEqual({ seriesName: 'Female', dataIndex: 0 });
    key(el, 'ArrowUp');
    expect(enters.at(-1)).toEqual({ seriesName: 'Male', dataIndex: 0 });
    expect((el.querySelector('.chartcraft-announcer') as HTMLElement).textContent).toBe(
      '0-9: 10. Male, left arm, 1 of 2.',
    );
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    // A magnitude, never "-10".
    expect(tip.innerHTML).toContain('>10<');
    expect(tip.innerHTML).not.toContain('-10');
    expect(tip.innerHTML).toContain('0-9');
  });
});
