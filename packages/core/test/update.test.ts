import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupDom, ctxOf, mount, paintedText } from './helpers';
import { resizeObservers } from './setup';

afterEach(cleanupDom);

const data = {
  categories: ['Q1', 'Q2'],
  series: [
    { name: 'North', data: [10, 20] },
    { name: 'South', data: [5, 15] },
  ],
};

describe('update() — diffed re-render', () => {
  it('emits render with reason "update" and repaints', () => {
    const { chart } = mount({ type: 'line', data });
    const onRender = vi.fn();
    chart.on('render', onRender);
    chart.update({ title: 'Hello' });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith({ reason: 'update' });
  });

  it('presentation-only updates keep the data table content', () => {
    const { el, chart } = mount({ type: 'line', data });
    const rowsBefore = el.querySelectorAll('.chartcraft-a11y-table tbody tr').length;
    chart.update({ title: 'New title' });
    expect(paintedText(el)).toContain('New title');
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr').length).toBe(rowsBefore);
  });

  it('setData rebuilds the model: table rows and legend follow the new data', () => {
    const { el, chart } = mount({ type: 'line', data });
    chart.setData({
      categories: ['Jan', 'Feb', 'Mar'],
      series: [{ name: 'Only', data: [1, 2, 3] }],
    });
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(3);
    const headers = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Category', 'Only']);
    // Legend auto-hides for a single series.
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('deep-merges partial options (tooltip.show=false keeps shared=true)', () => {
    const { chart } = mount({ type: 'line', data, tooltip: { shared: true } });
    chart.update({ tooltip: { show: false } });
    const o = chart.getOptions() as { tooltip: { show: boolean; shared: boolean } };
    expect(o.tooltip.show).toBe(false);
    expect(o.tooltip.shared).toBe(true);
  });

  it('theme switch repaints with the dark surface', () => {
    const { el, chart } = mount({ type: 'line', data });
    const ctx = ctxOf(el);
    const before = ctx.__props.filter((p) => p.prop === 'fillStyle' && p.value === '#1a1a19').length;
    chart.update({ theme: 'dark' });
    const after = ctx.__props.filter((p) => p.prop === 'fillStyle' && p.value === '#1a1a19').length;
    expect(after).toBeGreaterThan(before);
  });

  it('type switch re-renders with the new mark shape', () => {
    const { el, chart } = mount({ type: 'line', data });
    const ctx = ctxOf(el);
    ctx.__calls.length = 0;
    chart.update({ type: 'bar' });
    // Bars use arcTo for the rounded data-end corners.
    expect(ctx.__calls.some((c) => c.method === 'arcTo')).toBe(true);
  });

  it('changing width re-sizes the backing store', () => {
    const { el, chart } = mount({ type: 'line', data });
    chart.update({ width: 800 });
    expect((el.querySelector('canvas') as HTMLCanvasElement).width).toBe(800);
  });
});

describe('resize()', () => {
  it('manual resize emits render with reason "resize"', () => {
    const { chart } = mount({ type: 'line', data });
    const onRender = vi.fn();
    chart.on('render', onRender);
    chart.resize();
    expect(onRender).toHaveBeenCalledWith({ reason: 'resize' });
  });

  it('ResizeObserver triggers a coalesced (rAF) resize', async () => {
    const { chart } = mount({ type: 'line', data });
    const onRender = vi.fn();
    chart.on('render', onRender);
    const ro = resizeObservers.at(-1)!;
    ro.trigger();
    ro.trigger(); // coalesced: two triggers -> one render
    await new Promise((r) => setTimeout(r, 60));
    const resizeCalls = onRender.mock.calls.filter((c) => (c[0] as { reason: string }).reason === 'resize');
    expect(resizeCalls).toHaveLength(1);
  });
});
