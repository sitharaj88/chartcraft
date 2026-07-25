import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip, defaultTooltipHTML } from '../src/components/tooltip';
import { lightTheme } from '../src/theme';
import { canvasOf, cleanupDom, markerCenters, mount, pointerMove } from './helpers';
import type { TooltipPoint } from '../src/index';

afterEach(cleanupDom);

const data = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'North', data: [10, 20, 30] },
    { name: 'South', data: [5, 15, 25] },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

describe('tooltip', () => {
  it('shared tooltip (line default) lists every visible series at the hovered x', () => {
    const { el } = mount({ type: 'line', data });
    const markers = markerCenters(el);
    expect(markers.length).toBeGreaterThanOrEqual(6);
    const m = markers[0]!;
    pointerMove(el, m.x, m.y);
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('North');
    expect(tip.innerHTML).toContain('South');
    expect(tip.innerHTML).toContain('Q1');
    expect(tip.innerHTML).toContain('10');
    expect(tip.innerHTML).toContain('5');
  });

  it('non-shared tooltip shows a single point', () => {
    const { el } = mount({ type: 'line', data, tooltip: { shared: false } });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    const tip = tooltipEl();
    expect(tip.innerHTML).toContain('North');
    expect(tip.innerHTML).not.toContain('South');
  });

  it('hides when the pointer leaves the marks', () => {
    const { el } = mount({ type: 'line', data, tooltip: { shared: false } });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(tooltipEl().style.display).toBe('block');
    canvasOf(el).dispatchEvent(new MouseEvent('pointerleave'));
    expect(tooltipEl().style.display).toBe('none');
  });

  it('custom format function controls the HTML', () => {
    const format = vi.fn((points: TooltipPoint[]) => `<b>${points.length} pts</b>`);
    const { el } = mount({ type: 'line', data, tooltip: { format } });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(format).toHaveBeenCalled();
    expect(tooltipEl().innerHTML).toBe('<b>2 pts</b>');
  });

  it('tooltip: false never shows', () => {
    const { el } = mount({ type: 'line', data, tooltip: false });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(tooltipEl().style.display).toBe('none');
  });

  it('escapes HTML in series names (no injection)', () => {
    const points: TooltipPoint[] = [
      {
        seriesId: 's',
        seriesName: '<script>alert(1)</script>',
        color: '#fff',
        x: 1,
        y: 2,
        formattedX: '1',
        formattedY: '2',
      },
    ];
    const html = defaultTooltipHTML(points);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never clips the viewport: flips/clamps near the bottom-right corner', () => {
    const t = new Tooltip(document);
    document.body.appendChild(t.el);
    t.applyTheme(lightTheme);
    t.show('<div>content</div>', 1020, 760); // jsdom viewport is 1024x768
    const left = parseFloat(t.el.style.left);
    const top = parseFloat(t.el.style.top);
    expect(left + 120).toBeLessThanOrEqual(1024);
    expect(top + 40).toBeLessThanOrEqual(768);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(top).toBeGreaterThanOrEqual(4);
  });

  it('styled with surface bg + hairline border from the theme', () => {
    const t = new Tooltip(document);
    t.applyTheme(lightTheme);
    expect(t.el.style.border).toContain('1px solid');
    expect(t.el.style.position).toBe('fixed');
    expect(t.el.style.pointerEvents).toBe('none');
  });
});
