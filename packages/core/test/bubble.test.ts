import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { bubbleDiameter, DEFAULT_SIZE_RANGE } from '../src/charts/statistical/bubble';
import { canvasOf, cleanupDom, ctxOf, key, mount, pointerMove } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

const data = {
  series: [
    {
      name: 'S',
      data: [
        { x: 1, y: 10, r: 0 },
        { x: 2, y: 20, r: 100 },
        { x: 3, y: 30, r: 50 },
      ],
    },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

/** All circle radii drawn on the canvas (arc calls). */
function arcRadii(el: HTMLElement): number[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc')
    .map((c) => c.args[2] as number);
}

describe('bubble — size math (r maps to AREA, not radius)', () => {
  it('maps the domain ends to the sizeRange min/max diameters', () => {
    expect(bubbleDiameter(0, [0, 100])).toBe(8);
    expect(bubbleDiameter(100, [0, 100])).toBe(40);
  });

  it('maps the domain midpoint to the mid AREA (not mid diameter)', () => {
    // area(8)=π·16, area(40)=π·400 → mid area π·208 → d = 2·√208 ≈ 28.844
    expect(bubbleDiameter(50, [0, 100])).toBeCloseTo(2 * Math.sqrt(208), 6);
    // Mid diameter would be 24 — assert we are NOT doing that.
    expect(bubbleDiameter(50, [0, 100])).not.toBeCloseTo(24, 1);
  });

  it('degenerate domain maps to the midpoint area; missing r gets the min diameter', () => {
    expect(bubbleDiameter(7, [7, 7])).toBeCloseTo(2 * Math.sqrt(208), 6);
    expect(bubbleDiameter(undefined, [0, 100])).toBe(8);
    expect(bubbleDiameter(3, null)).toBe(8);
    expect(DEFAULT_SIZE_RANGE).toEqual([8, 40]);
  });

  it('honors a custom sizeRange', () => {
    expect(bubbleDiameter(0, [0, 10], [10, 10])).toBe(10);
    expect(bubbleDiameter(10, [0, 10], [4, 12])).toBe(12);
  });
});

describe('bubble — rendering', () => {
  it('draws one circle per datum with area-scaled radii (default sizeRange [8,40])', () => {
    const { el } = mount({ type: 'bubble', data });
    const radii = arcRadii(el);
    expect(radii).toHaveLength(3);
    expect(radii).toContain(4); // r=0 → 8px diameter
    expect(radii).toContain(20); // r=100 → 40px diameter
    const mid = radii.find((r) => r !== 4 && r !== 20);
    expect(mid).toBeCloseTo(Math.sqrt(208), 6); // r=50 → mid area
  });

  it('a per-series sizeRange overrides the default', () => {
    const { el } = mount({
      type: 'bubble',
      data: { series: [{ name: 'S', sizeRange: [10, 10] as [number, number], data: data.series[0]!.data }] },
    });
    const radii = arcRadii(el);
    expect(radii).toEqual([5, 5, 5]);
  });

  it('accepts [x, y, r] triples', () => {
    const { el } = mount({
      type: 'bubble',
      data: { series: [{ name: 'T', data: [[1, 10, 5] as [number, number, number], [2, 20, 10] as [number, number, number]] }] },
    });
    const radii = arcRadii(el);
    expect(radii).toHaveLength(2);
    expect(radii).toContain(4); // r=5 is the domain min
    expect(radii).toContain(20); // r=10 is the domain max
  });
});

describe('bubble — tooltip, a11y, legend, keyboard', () => {
  it('tooltip shows x, y and r', () => {
    const { el } = mount({ type: 'bubble', data });
    key(el, 'ArrowRight');
    key(el, 'ArrowRight'); // focus point 2 (r=100)
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('2'); // x
    expect(tip.innerHTML).toContain('20'); // y
    expect(tip.innerHTML).toContain('r 100'); // r
  });

  it('a11y table has y and r columns per series', () => {
    const { el } = mount({ type: 'bubble', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['X', 'S', 'S r']);
    const firstRow = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')[0]!.children].map(
      (c) => c.textContent,
    );
    expect(firstRow).toEqual(['1', '10', '0']);
  });

  it('legend: hidden for one series, shown and toggleable for two', () => {
    const one = mount({ type: 'bubble', data });
    expect((one.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const two = mount({
      type: 'bubble',
      data: {
        series: [
          { name: 'A', data: [{ x: 1, y: 1, r: 1 }] },
          { name: 'B', data: [{ x: 2, y: 2, r: 2 }] },
        ],
      },
    });
    const legend = two.el.querySelector('.chartcraft-legend') as HTMLElement;
    expect(legend.style.display).not.toBe('none');
    const items = legend.querySelectorAll('.chartcraft-legend-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('aria-pressed')).toBe('true'); // toggleable
  });

  it('keyboard navigation announces x, y and r', () => {
    const { el, chart } = mount({ type: 'bubble', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'S', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('r 0');
    expect(region.textContent).toContain('point 1 of 3');
  });

  it('pointer hover over a bubble center fires pointenter for that datum', () => {
    const { el, chart } = mount({ type: 'bubble', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // The biggest bubble (radius 20) is datum index 1.
    const big = ctxOf(el).__calls.find((c) => c.method === 'arc' && c.args[2] === 20)!;
    pointerMove(el, big.args[0] as number, big.args[1] as number);
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ dataIndex: 1 });
    expect(canvasOf(el)).toBeTruthy();
  });
});
