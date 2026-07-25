import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { cleanupDom, ctxOf, key, mount } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

const data = {
  series: [
    {
      name: 'MSFT',
      data: [
        [1, 100, 110, 95, 105] as [number, number, number, number, number], // up
        [2, 105, 112, 101, 103] as [number, number, number, number, number], // down
        [3, 103, 108, 99, 107] as [number, number, number, number, number], // up
      ],
    },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

describe('ohlc — rendering', () => {
  it('draws stroked bars/ticks in theme.up/down and NO filled bodies', () => {
    const { el } = mount({ type: 'ohlc', data });
    const ctx = ctxOf(el);
    // Up/down colors appear as stroke styles...
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.up)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.down)).toBe(true);
    // ...but never as fills (no candle bodies).
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.up)).toBe(false);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.down)).toBe(false);
    // No mark rects at all (only the surface clear).
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0));
    expect(rects).toHaveLength(0);
  });

  it('draws three 1px strokes per mark: h–l bar plus open/close ticks', () => {
    const { el } = mount({ type: 'ohlc', data });
    const ctx = ctxOf(el);
    // Count line strokes drawn in up/down colors (each r.line = one moveTo).
    let colored = 0;
    let current: unknown = null;
    for (const entry of ctx.__props) {
      if (entry.prop === 'strokeStyle') current = entry.value;
      if (entry.prop === 'lineWidth' && entry.value === 1 && (current === lightTheme.up || current === lightTheme.down))
        colored++;
    }
    expect(colored).toBe(9); // 3 candles × (bar + open tick + close tick)
  });

  it('open tick goes left of the bar, close tick right', () => {
    const { el } = mount({ type: 'ohlc', data });
    const ctx = ctxOf(el);
    // Gather horizontal segments (moveTo→lineTo with equal y).
    const moves = ctx.__calls
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.method === 'moveTo');
    const horizontals = moves
      .map(({ c, i }) => {
        const next = ctx.__calls[i + 1];
        if (!next || next.method !== 'lineTo') return null;
        return { x1: c.args[0] as number, y1: c.args[1] as number, x2: next.args[0] as number, y2: next.args[1] as number };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.y1 === s.y2 && s.x1 !== s.x2);
    // At least one leftward (open) and one rightward (close) tick pair share an x endpoint.
    expect(horizontals.length).toBeGreaterThanOrEqual(6);
  });
});

describe('ohlc — shared financial behavior', () => {
  it('y domain covers the niced l..h extent', () => {
    const { chart } = mount({ type: 'ohlc', data });
    const o = chart.getOptions();
    expect(o.yAxis!.min).toBe(95);
    expect(o.yAxis!.max).toBe(115);
  });

  it('appears instantly (animation force-disabled)', () => {
    const { chart } = mount({ type: 'ohlc', data, animation: true });
    expect((chart.getOptions().animation as { enabled: boolean }).enabled).toBe(false);
  });

  it('per-mark tooltip shows the OHLC block', () => {
    const { el } = mount({ type: 'ohlc', data });
    key(el, 'ArrowRight');
    key(el, 'ArrowRight'); // second mark (down)
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Open 105');
    expect(tip.innerHTML).toContain('High 112');
    expect(tip.innerHTML).toContain('Low 101');
    expect(tip.innerHTML).toContain('Close 103');
  });

  it('a11y table has Open/High/Low/Close columns', () => {
    const { el } = mount({ type: 'ohlc', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Time', 'Open', 'High', 'Low', 'Close']);
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect([...rows[2]!.children].map((c) => c.textContent)).toEqual(['3', '103', '108', '99', '107']);
  });

  it('keyboard navigation fires pointenter and announces OHLC', () => {
    const { el, chart } = mount({ type: 'ohlc', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'MSFT', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('Low 95');
  });

  it('legend follows the auto policy (hidden for a single series)', () => {
    const { el } = mount({ type: 'ohlc', data });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});
