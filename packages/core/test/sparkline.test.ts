import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, key, markerCenters, mount, paintedText, pointerMove } from './helpers';

afterEach(cleanupDom);

const data = { series: [{ name: 'Trend', data: [1, 3, 2, 5, 4] }] };

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

describe('sparkline — chrome policy', () => {
  it('renders a line with no axis chrome: no tick labels, no grid/axis strokes', () => {
    const { el } = mount({ type: 'sparkline', data });
    const ctx = ctxOf(el);
    // The line itself is stroked...
    expect(ctx.__calls.some((c) => c.method === 'stroke')).toBe(true);
    // ...but no text is painted and no gridline/axis-line colors are used.
    expect(paintedText(el)).toEqual([]);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#e1e0d9')).toBe(false); // gridline
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === '#c3c2b7')).toBe(false); // axis line
  });

  it('suppresses title and subtitle (chrome-free preset)', () => {
    const { el } = mount({ type: 'sparkline', data, title: 'HiddenTitle', subtitle: 'HiddenSub' });
    const texts = paintedText(el);
    expect(texts).not.toContain('HiddenTitle');
    expect(texts).not.toContain('HiddenSub');
  });

  it('hides the legend by default but honors an explicit legend: true', () => {
    const a = mount({ type: 'sparkline', data });
    expect((a.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const b = mount({ type: 'sparkline', data, legend: true });
    expect((b.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
  });

  it('uses minimal padding and fills the container edge to edge', () => {
    const { el } = mount({ type: 'sparkline', data }); // 600x400 via helpers
    const centers = markerCenters(el);
    expect(centers.length).toBe(5);
    expect(centers[0]!.x).toBeLessThanOrEqual(4); // left edge ~2px padding, no axis margin
    expect(centers.at(-1)!.x).toBeGreaterThanOrEqual(590); // right edge
  });

  it('explicit padding is honored over the minimal preset', () => {
    const { el } = mount({ type: 'sparkline', data, padding: 20 });
    expect(markerCenters(el)[0]!.x).toBeCloseTo(20, 5);
  });
});

describe('sparkline — tooltip policy', () => {
  it('tooltip is OFF by default (but hover events still fire)', () => {
    const { el, chart } = mount({ type: 'sparkline', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[1]!;
    pointerMove(el, m.x, m.y);
    expect(enters.length).toBe(1); // interaction stays live
    expect(tooltipEl().style.display).toBe('none'); // chrome stays off
  });

  it('explicit tooltip: true is honored', () => {
    const { el } = mount({ type: 'sparkline', data, tooltip: true });
    const m = markerCenters(el)[1]!;
    pointerMove(el, m.x, m.y);
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Trend');
  });
});

describe('sparkline — a11y stays fully on', () => {
  it('canvas is focusable with role img and a generated label', () => {
    const { el } = mount({ type: 'sparkline', data });
    const canvas = canvasOf(el);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-label')).toMatch(/Sparkline chart/);
  });

  it('keyboard navigation works and announces points', () => {
    const { el, chart } = mount({ type: 'sparkline', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'Trend', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('Trend');
    expect(region.textContent).toContain('point 1 of 5');
  });

  it('the data table fallback is present (visually hidden) with every point', () => {
    const { el } = mount({ type: 'sparkline', data });
    const wrap = el.querySelector('.chartcraft-a11y-table') as HTMLElement;
    expect(wrap.style.width).toBe('1px'); // visually hidden, AT-readable
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(5);
    const firstRow = [...rows[0]!.children].map((c) => c.textContent);
    expect(firstRow).toEqual(['0', '1']);
  });
});
