import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupDom, mount } from './helpers';

afterEach(cleanupDom);

const twoSeries = {
  series: [
    { name: 'Alpha', data: [1, 2, 3] },
    { name: 'Beta', data: [3, 2, 1] },
  ],
};

function legendItems(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
}

describe('legend', () => {
  it('auto: shown for >= 2 series, hidden for 1', () => {
    const a = mount({ type: 'line', data: twoSeries });
    expect((a.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    const b = mount({ type: 'line', data: { series: [{ name: 'Solo', data: [1, 2] }] } });
    expect((b.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('legend: false hides, legend: true forces show for one series', () => {
    const a = mount({ type: 'line', data: twoSeries, legend: false });
    expect((a.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const b = mount({ type: 'line', data: { series: [{ name: 'Solo', data: [1] }] }, legend: true });
    expect(legendItems(b.el)).toHaveLength(1);
  });

  it('items show swatch + ink-colored label text', () => {
    const { el } = mount({ type: 'line', data: twoSeries });
    const items = legendItems(el);
    expect(items).toHaveLength(2);
    const label = items[0]!.querySelector('.chartcraft-legend-label') as HTMLElement;
    expect(label.textContent).toBe('Alpha');
    // Label is ink, not the series color; the swatch carries the color.
    const swatch = items[0]!.querySelector('.chartcraft-legend-swatch') as HTMLElement;
    expect(swatch.style.background).not.toBe('');
    expect(label.style.color).not.toBe(swatch.style.background);
  });

  it('click toggles series visibility, emits legendtoggle, updates aria-pressed', () => {
    const { el, chart } = mount({ type: 'line', data: twoSeries });
    const onToggle = vi.fn();
    const onRender = vi.fn();
    chart.on('legendtoggle', onToggle);
    chart.on('render', onRender);

    legendItems(el)[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'Beta', visible: false });
    expect(onRender).toHaveBeenCalledWith({ reason: 'toggle' });
    expect(legendItems(el)[1]!.getAttribute('aria-pressed')).toBe('false');
    const opts = chart.getOptions();
    expect(opts.data.series[1]!.visible).toBe(false);

    // Toggle back on.
    legendItems(el)[1]!.click();
    expect(onToggle).toHaveBeenLastCalledWith({ seriesId: 'Beta', visible: true });
    expect(legendItems(el)[1]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('hidden series keeps its palette slot when re-shown (identity not rank)', () => {
    const { el } = mount({ type: 'line', data: twoSeries });
    const swatchColor = () =>
      (legendItems(el)[1]!.querySelector('.chartcraft-legend-swatch') as HTMLElement).style.boxShadow +
      (legendItems(el)[1]!.querySelector('.chartcraft-legend-swatch') as HTMLElement).style.background;
    const before = (legendItems(el)[1]!.querySelector('.chartcraft-legend-swatch') as HTMLElement).style.background;
    legendItems(el)[1]!.click(); // hide
    legendItems(el)[1]!.click(); // show again
    const after = (legendItems(el)[1]!.querySelector('.chartcraft-legend-swatch') as HTMLElement).style.background;
    expect(after).toBe(before);
    void swatchColor;
  });

  it('non-interactive legend does not toggle', () => {
    const { el, chart } = mount({ type: 'line', data: twoSeries, legend: { interactive: false } });
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    legendItems(el)[0]!.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('legend position bottom mounts the legend after the canvas wrap', () => {
    const { el } = mount({ type: 'line', data: twoSeries, legend: { position: 'bottom' } });
    const root = el.querySelector('.chartcraft') as HTMLElement;
    const children = [...root.children];
    const wrapIdx = children.findIndex((c) => c.className.includes('canvas-wrap'));
    const legendIdx = children.findIndex((c) => c.className.includes('chartcraft-legend'));
    expect(legendIdx).toBeGreaterThan(wrapIdx);
  });
});
