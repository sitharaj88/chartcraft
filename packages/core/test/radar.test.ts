import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRadialChartTypes } from '../src/charts/radial';
import {
  RADAR_FILL_ALPHA,
  computeRadarFrame,
  radarVertex,
} from '../src/charts/radial/radar';
import { polarToCartesian, ringValues, spokeAngle } from '../src/charts/radial/polar';
import type { PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerRadialChartTypes();
afterEach(cleanupDom);

/** Wait past a hover-redraw frame (rAF or its 16ms setTimeout fallback). */
const frame = () => new Promise((r) => setTimeout(r, 40));

// Fresh data per mount: legend toggling mutates series.visible on the
// caller's series objects, so fixtures must not be shared between tests.
const data = () => ({
  categories: ['Speed', 'Power', 'Range', 'Agility'],
  series: [
    { name: 'A', data: [4, 3, 2, 1] },
    { name: 'B', data: [1, 2, 3, 4] },
  ],
});

// Geometry for the 600x400 mount: plot {12, 12, 576, 376} -> cx 300, cy 200,
// labelPad = fontSize 12 + 14 -> r = 376/2 - 26 = 162. Max value 4 -> spoke 0
// vertex of series A sits at (300, 200 - 162) = (300, 38).

describe('radar — polar layout math', () => {
  it('spoke angles start at 12 o\'clock and step clockwise', () => {
    expect(spokeAngle(0, 4)).toBeCloseTo(-Math.PI / 2, 12);
    expect(spokeAngle(1, 4)).toBeCloseTo(0, 12);
    expect(spokeAngle(2, 4)).toBeCloseTo(Math.PI / 2, 12);
    expect(spokeAngle(3, 4)).toBeCloseTo(Math.PI, 12);
    expect(spokeAngle(1, 3)).toBeCloseTo(-Math.PI / 2 + (2 * Math.PI) / 3, 12);
  });

  it('ring values are nice and evenly spaced up to a nice max', () => {
    expect(ringValues(4)).toEqual([1, 2, 3, 4]);
    expect(ringValues(10)).toEqual([2.5, 5, 7.5, 10]);
    expect(ringValues(0)).toEqual([0.25, 0.5, 0.75, 1]); // degenerate -> 0..1
  });

  it('computeRadarFrame produces exact ring radii and center', () => {
    const f = computeRadarFrame(4, 4, { x: 0, y: 0, w: 200, h: 200 }, 0);
    expect(f.cx).toBe(100);
    expect(f.cy).toBe(100);
    expect(f.r).toBe(100);
    expect(f.max).toBe(4);
    expect(f.rings.map((r) => r.r)).toEqual([25, 50, 75, 100]);
    expect(f.angles).toHaveLength(4);
  });

  it('radarVertex maps value to radius along the spoke', () => {
    const f = computeRadarFrame(4, 4, { x: 0, y: 0, w: 200, h: 200 }, 0);
    // value 2 of max 4 on spoke 1 (angle 0) -> halfway right of center.
    expect(radarVertex(f, 1, 2)).toEqual({ x: 150, y: 100 });
    const top = radarVertex(f, 0, 4);
    expect(top.x).toBeCloseTo(100, 9);
    expect(top.y).toBeCloseTo(0, 9);
    const p = polarToCartesian(0, 0, 1, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });
});

describe('radar — validation', () => {
  it('rejects fewer than 3 spokes with a helpful error', () => {
    expect(() =>
      mount({ type: 'radar', data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] } }),
    ).toThrow(/between 3 and 12/);
  });

  it('rejects more than 12 spokes', () => {
    const cats = Array.from({ length: 13 }, (_, i) => `C${i}`);
    const vals = cats.map((_, i) => i + 1);
    expect(() =>
      mount({ type: 'radar', data: { categories: cats, series: [{ name: 'S', data: vals }] } }),
    ).toThrow(/between 3 and 12/);
  });

  it('rejects negative values, naming the series and index', () => {
    expect(() =>
      mount({
        type: 'radar',
        data: { categories: ['A', 'B', 'C'], series: [{ name: 'Neg', data: [1, -2, 3] }] },
      }),
    ).toThrow(/>= 0.*"Neg".*index 1/);
  });
});

describe('radar — rendering smoke (call log)', () => {
  it('draws recessive grid, 0.15-alpha fills, 2px outlines and muted labels', () => {
    const { el } = mount({ type: 'radar', data: data() });
    const ctx = ctxOf(el);
    // Hairline grid in the gridline color.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#e1e0d9')).toBe(true);
    // 0.15-alpha series fill.
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === RADAR_FILL_ALPHA)).toBe(true);
    // 2px outlines in both series colors.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#eb6834')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 2)).toBe(true);
    // Spoke labels painted in textMuted.
    const texts = paintedText(el);
    for (const c of data().categories) expect(texts).toContain(c);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });

  it('vertex markers appear on hover only (>= 8px diameter)', async () => {
    const { el } = mount({ type: 'radar', data: data() });
    const markerArcs = () => ctxOf(el).__calls.filter((c) => c.method === 'arc' && c.args[2] === 4);
    expect(markerArcs()).toHaveLength(0); // none at rest
    pointerMove(el, 300, 38); // series A, spoke 0 vertex
    await frame();
    const arcs = markerArcs();
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs[0]!.args[0]).toBeCloseTo(300, 6);
    expect(arcs[0]!.args[1]).toBeCloseTo(38, 6);
  });
});

describe('radar — legend policy (series, toggleable)', () => {
  it('lists toggleable series items and toggles visibility on click', () => {
    const { el, chart } = mount({ type: 'radar', data: data() });
    const items = [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(items[0]!.disabled).toBe(false);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'B', visible: false });
  });

  it('auto legend: hidden for a single series', () => {
    const { el } = mount({
      type: 'radar',
      data: { categories: ['A', 'B', 'C'], series: [{ name: 'Solo', data: [1, 2, 3] }] },
    });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});

describe('radar — a11y table (category rows x series columns)', () => {
  it('builds one row per category with a cell per series', () => {
    const { el } = mount({ type: 'radar', data: data() });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Category', 'A', 'B']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')];
    expect(rows).toHaveLength(4);
    expect([...rows[0]!.children].map((c) => c.textContent)).toEqual(['Speed', '4', '1']);
    expect([...rows[3]!.children].map((c) => c.textContent)).toEqual(['Agility', '1', '4']);
  });
});

describe('radar — tooltip & keyboard', () => {
  it('tooltip shows category, series name and value for the hovered vertex', () => {
    const { el } = mount({ type: 'radar', data: data() });
    pointerMove(el, 300, 38);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Speed');
    expect(tip.innerHTML).toContain('A');
    expect(tip.innerHTML).toContain('4');
  });

  it('arrows walk vertices then series (natural reading order)', () => {
    const { el, chart } = mount({ type: 'radar', data: data() });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight'); // first vertex of first series
    key(el, 'ArrowRight'); // next vertex
    key(el, 'ArrowDown'); // next series, same vertex
    expect(enters.map((e) => [e.seriesName, e.dataIndex])).toEqual([
      ['A', 0],
      ['A', 1],
      ['B', 1],
    ]);
    expect(enters[0]!.clientX).toBe(-1); // keyboard-originated
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('B');
    expect(region.textContent).toContain('point 2 of 4');
    expect(canvasOf(el).tabIndex).toBe(0);
  });
});
