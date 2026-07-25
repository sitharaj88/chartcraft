import { afterEach, describe, expect, it, vi } from 'vitest';
import { nearestPoint, nearestByX, sliceAt } from '../src/interaction/hittest';
import { canvasOf, cleanupDom, markerCenters, mount, pointerMove } from './helpers';
import type { PointEvent } from '../src/index';

afterEach(cleanupDom);

describe('hit testing (pure)', () => {
  const pos = [
    [{ x: 100, y: 100, y0: 200 }, { x: 200, y: 50, y0: 200 }],
    [null, { x: 200, y: 150, y0: 200 }],
  ];

  it('nearestPoint finds the closest datum within 24px', () => {
    expect(nearestPoint(pos, 102, 103)).toMatchObject({ si: 0, pi: 0 });
    expect(nearestPoint(pos, 199, 151)).toMatchObject({ si: 1, pi: 1 });
    expect(nearestPoint(pos, 400, 400)).toBeNull();
    // 25px away -> outside the hit target.
    expect(nearestPoint(pos, 100, 130)).toBeNull();
    expect(nearestPoint(pos, 100, 123)).toMatchObject({ si: 0, pi: 0 });
  });

  it('nearestByX ignores y distance (crosshair behavior) and skips null gaps', () => {
    expect(nearestByX(pos, 205, 24)).toMatchObject({ pi: 1 });
    expect(nearestByX(pos, 300, 24)).toBeNull();
  });

  it('sliceAt respects angles and the donut hole', () => {
    const slice = { pi: 0, a0: -Math.PI / 2, a1: Math.PI / 2, cx: 0, cy: 0, r0: 10, r1: 100, color: '#000', label: 'A', value: 1 };
    expect(sliceAt([slice], 50, 0)).toBe(slice); // right side, inside radius
    expect(sliceAt([slice], -50, 0)).toBeNull(); // left half is outside the sweep
    expect(sliceAt([slice], 5, 0)).toBeNull(); // inside the hole
    expect(sliceAt([slice], 150, 0)).toBeNull(); // beyond the rim
  });
});

describe('pointer interaction', () => {
  const data = {
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'North', data: [10, 20, 30] },
      { name: 'South', data: [5, 15, 25] },
    ],
  };

  it('pointermove over a mark emits pointenter with datum payload', () => {
    const { el, chart } = mount({ type: 'line', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesId: 'North', seriesName: 'North', x: 'Q1', y: 10 });
    expect(enters[0]!.clientX).toBe(m.x);
    expect(enters[0]!.native).toBeInstanceOf(Event);
  });

  it('moving off the marks emits pointleave', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const leaves: PointEvent[] = [];
    chart.on('pointleave', (e) => leaves.push(e));
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    pointerMove(el, m.x + 200, m.y + 200);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.seriesName).toBe('North');
  });

  it('click on a mark emits pointclick', () => {
    const { el, chart } = mount({ type: 'line', data });
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    const m = markerCenters(el)[1]!;
    canvasOf(el).dispatchEvent(new MouseEvent('click', { clientX: m.x, clientY: m.y, bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('bar charts hit the full column band', () => {
    const { el, chart } = mount({ type: 'bar', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // Anywhere inside the plot column should hit, even far from the bar top.
    pointerMove(el, 300, 350);
    expect(enters.length).toBeGreaterThanOrEqual(1);
    expect(['North', 'South']).toContain(enters[0]!.seriesName);
  });

  it('pie slices hit-test by angle and emit slice data', () => {
    const { el, chart } = mount({
      type: 'pie',
      data: { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] },
    });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // Right of center: inside the first (3/4 sweep) slice.
    pointerMove(el, 400, 200);
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ x: 'A', y: 3 });
  });
});
