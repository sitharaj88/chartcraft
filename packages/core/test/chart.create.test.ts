import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChart, version } from '../src/index';
import { cleanupDom, canvasOf, ctxOf, mount, paintedText } from './helpers';
import { resizeObservers } from './setup';

afterEach(cleanupDom);

const data = {
  series: [
    { name: 'Alpha', data: [1, 2, 3] },
    { name: 'Beta', data: [3, 2, 1] },
  ],
};

describe('createChart', () => {
  it('exports the package version', () => {
    expect(version).toBe('0.4.0');
  });

  it('validates inputs', () => {
    const el = document.createElement('div');
    expect(() => createChart(el, { data } as never)).toThrow(/type/);
    expect(() => createChart(el, { type: 'line' } as never)).toThrow(/series/);
    expect(() => createChart(null as never, { type: 'line', data })).toThrow(/container/);
  });

  it('mounts root, canvas, legend and a11y layer into the container', () => {
    const { el, chart } = mount({ type: 'line', data });
    expect(el.querySelector('.chartcraft')).toBeTruthy();
    expect(el.querySelector('canvas')).toBeTruthy();
    expect(el.querySelector('.chartcraft-legend')).toBeTruthy();
    expect(el.querySelector('.chartcraft-a11y-table table')).toBeTruthy();
    expect(chart.el).toBe(el);
  });

  it('paints the surface, title and subtitle', () => {
    const { el } = mount({ type: 'line', data, title: 'Revenue', subtitle: 'Quarterly' });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#fcfcfb')).toBe(true);
    const texts = paintedText(el);
    expect(texts).toContain('Revenue');
    expect(texts).toContain('Quarterly');
  });

  it('sizes the canvas with devicePixelRatio', () => {
    const { el } = mount({ type: 'line', data });
    const canvas = canvasOf(el);
    expect(canvas.width).toBe(600); // dpr 1 in jsdom
    expect(canvas.height).toBe(400);
    expect(canvas.style.width).toBe('600px');
    const ctx = ctxOf(el);
    expect(ctx.__calls.some((c) => c.method === 'setTransform')).toBe(true);
  });

  it('getOptions returns a frozen resolved snapshot', () => {
    const { chart } = mount({ type: 'line', data });
    const o = chart.getOptions();
    expect(Object.isFrozen(o)).toBe(true);
    expect(o.type).toBe('line');
    expect(o.padding).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect((o.tooltip as { shared?: boolean }).shared).toBe(true); // line default
    expect((o.legend as { show?: boolean }).show).toBe(true); // 2 series -> auto shown
  });

  it('observes the container with ResizeObserver', () => {
    const before = resizeObservers.length;
    const { el } = mount({ type: 'line', data });
    expect(resizeObservers.length).toBe(before + 1);
    expect(resizeObservers.at(-1)!.targets).toContain(el);
  });

  it('destroy removes DOM, observers and listeners and emits destroy', () => {
    const { el, chart } = mount({ type: 'line', data });
    const onDestroy = vi.fn();
    chart.on('destroy', onDestroy);
    chart.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.chartcraft')).toBeNull();
    expect(document.querySelector('.chartcraft-tooltip')).toBeNull();
    expect(resizeObservers.at(-1)!.targets).toHaveLength(0);
    // Idempotent + safe after destroy.
    expect(() => chart.destroy()).not.toThrow();
    expect(() => chart.update({ title: 'x' })).not.toThrow();
  });

  it('renders pie slices with the categorical palette', () => {
    const { el } = mount({
      type: 'pie',
      data: { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] },
    });
    const ctx = ctxOf(el);
    const arcs = ctx.__calls.filter((c) => c.method === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(2);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2a78d6')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#eb6834')).toBe(true);
  });

  it('donut renders an annulus (two arcs per slice)', () => {
    const { el } = mount({
      type: 'donut',
      data: { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] },
    });
    const arcs = ctxOf(el).__calls.filter((c) => c.method === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(4);
  });
});
