import { afterEach, describe, expect, it } from 'vitest';
import { linePath, areaPath, runsOf } from '../src/charts/curves';
import { cleanupDom, ctxOf, mount } from './helpers';
import { setMediaQuery, resetMediaQueries } from './setup';
import { beforeEach } from 'vitest';

afterEach(cleanupDom);
beforeEach(() => resetMediaQueries());

const p = (x: number, y: number, y0 = 100) => ({ x, y, y0 });

describe('curves', () => {
  it('runsOf splits on null gaps', () => {
    const runs = runsOf([p(0, 1), null, p(2, 3), p(3, 4)]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(1);
    expect(runs[1]).toHaveLength(2);
  });

  it('linear line path is M + L segments, restarting after gaps', () => {
    const cmds = linePath([p(0, 0), p(10, 10), null, p(20, 0), p(30, 5)], 'linear');
    const moves = cmds.filter((c) => c[0] === 'M');
    expect(moves).toHaveLength(2); // one per run
    expect(cmds.filter((c) => c[0] === 'L')).toHaveLength(2);
  });

  it('step curve inserts the horizontal-then-vertical corner', () => {
    const cmds = linePath([p(0, 0), p(10, 10)], 'step');
    expect(cmds).toEqual([
      ['M', 0, 0],
      ['L', 10, 0],
      ['L', 10, 10],
    ]);
  });

  it('monotone curve emits cubic beziers', () => {
    const cmds = linePath([p(0, 0), p(10, 10), p(20, 0)], 'monotone');
    expect(cmds.filter((c) => c[0] === 'C')).toHaveLength(2);
  });

  it('area path closes down to the baseline (y0) and back', () => {
    const cmds = areaPath([p(0, 10, 50), p(10, 20, 50)], 'linear');
    expect(cmds[0]).toEqual(['M', 0, 10]);
    expect(cmds.at(-1)).toEqual(['Z']);
    // The bottom edge points are present at y0.
    expect(cmds.some((c) => (c[0] === 'L' || c[0] === 'M') && c[2] === 50)).toBe(true);
  });
});

describe('mark spec on canvas', () => {
  const data = {
    categories: ['A', 'B', 'C'],
    series: [
      { name: 'One', data: [4, 8, 6] },
      { name: 'Two', data: [2, 5, 7] },
    ],
  };

  it('lines default to 2px width', () => {
    const { el } = mount({ type: 'line', data });
    expect(ctxOf(el).__props.some((p2) => p2.prop === 'lineWidth' && p2.value === 2)).toBe(true);
  });

  it('markers are 8px diameter with a 2px surface ring', () => {
    const { el } = mount({ type: 'line', data });
    const ctx = ctxOf(el);
    const markerArcs = ctx.__calls.filter((c) => c.method === 'arc' && c.args[2] === 4);
    expect(markerArcs).toHaveLength(6); // 3 points x 2 series, showMarkers auto (<= 60)
    // Ring: strokeStyle set to the surface color with width 2.
    expect(ctx.__props.some((p2) => p2.prop === 'strokeStyle' && p2.value === '#fcfcfb')).toBe(true);
  });

  it('showMarkers auto hides markers above 60 points', () => {
    const many = Array.from({ length: 100 }, (_, i) => [i, i % 7] as [number, number]);
    const { el } = mount({ type: 'line', data: { series: [{ name: 'Big', data: many }] } });
    const markerArcs = ctxOf(el).__calls.filter((c) => c.method === 'arc' && c.args[2] === 4);
    expect(markerArcs).toHaveLength(0);
  });

  it('grouped bars draw one rounded rect per datum', () => {
    const { el } = mount({ type: 'bar', data });
    const ctx = ctxOf(el);
    // 6 bars x 4 arcTo per rounded-rect path.
    expect(ctx.__calls.filter((c) => c.method === 'arcTo')).toHaveLength(24);
    // Both series colors used.
    expect(ctx.__props.some((p2) => p2.prop === 'fillStyle' && p2.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p2) => p2.prop === 'fillStyle' && p2.value === '#eb6834')).toBe(true);
  });

  it('stacked and horizontal bars render without error', () => {
    const s = mount({ type: 'bar', data, stacked: true });
    expect(ctxOf(s.el).__calls.some((c) => c.method === 'arcTo')).toBe(true);
    const h = mount({ type: 'bar', data, horizontal: true });
    expect(ctxOf(h.el).__calls.some((c) => c.method === 'arcTo')).toBe(true);
  });

  it('area charts paint a translucent fill under the line', () => {
    const { el } = mount({ type: 'area', data });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p2) => p2.prop === 'globalAlpha' && p2.value === 0.24)).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'fill')).toBe(true);
  });

  it('y gridlines are drawn in the hairline gridline color', () => {
    const { el } = mount({ type: 'line', data });
    expect(ctxOf(el).__props.some((p2) => p2.prop === 'strokeStyle' && p2.value === '#e1e0d9')).toBe(true);
  });
});

describe('auto theme follows prefers-color-scheme changes', () => {
  it('re-renders with the dark palette when the scheme flips', () => {
    setMediaQuery('(prefers-color-scheme: dark)', false);
    const { el } = mount({
      type: 'line',
      theme: 'auto',
      data: { series: [{ name: 'A', data: [1, 2, 3] }] },
    });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p2) => p2.prop === 'fillStyle' && p2.value === '#fcfcfb')).toBe(true);
    expect(ctx.__props.some((p2) => p2.prop === 'fillStyle' && p2.value === '#1a1a19')).toBe(false);
    setMediaQuery('(prefers-color-scheme: dark)', true);
    expect(ctx.__props.some((p2) => p2.prop === 'fillStyle' && p2.value === '#1a1a19')).toBe(true);
  });
});
