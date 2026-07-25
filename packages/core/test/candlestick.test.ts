import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { candleColor, computeSlotWidth, ohlcExtent, ohlcValueDomain } from '../src/charts/statistical/financial';
import { cleanupDom, ctxOf, key, mount, paintedText } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

const tuples = {
  series: [
    {
      name: 'AAPL',
      data: [
        [1, 100, 110, 95, 105] as [number, number, number, number, number], // up
        [2, 105, 112, 101, 103] as [number, number, number, number, number], // down
        [3, 103, 108, 99, 107] as [number, number, number, number, number], // up
      ],
    },
  ],
};

const objects = {
  series: [
    {
      name: 'AAPL',
      data: [
        { x: 1, o: 100, h: 110, l: 95, c: 105 },
        { x: 2, o: 105, h: 112, l: 101, c: 103 },
        { x: 3, o: 103, h: 108, l: 99, c: 107 },
      ],
    },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function bodyRects(el: HTMLElement): unknown[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0))
    .map((c) => c.args);
}

describe('candlestick — layout math', () => {
  it('candleColor compares close vs open against theme.up/down', () => {
    expect(candleColor(100, 105, lightTheme)).toBe(lightTheme.up);
    expect(candleColor(105, 103, lightTheme)).toBe(lightTheme.down);
  });

  it('computeSlotWidth is 0.7× the smallest x gap, clamped to [3, 48]', () => {
    expect(computeSlotWidth([0, 10, 20], 500)).toBeCloseTo(7, 12);
    expect(computeSlotWidth([0, 100], 500)).toBe(48); // 70 capped
    expect(computeSlotWidth([0, 2], 500)).toBeCloseTo(3, 12); // 1.4 floored
    expect(computeSlotWidth([50], 500)).toBe(48); // lone candle
  });

  it('ohlcExtent spans the raw low..high of tuples and objects', () => {
    expect(ohlcExtent(tuples)).toEqual([95, 112]);
    expect(ohlcExtent(objects)).toEqual([95, 112]);
  });

  it('the extendValueDomain stage installs the niced l..h extent', () => {
    // v0.3: the domain is supplied by the pipeline's `extendValueDomain` stage
    // instead of being written into the caller's `yAxis`, so `getOptions()`
    // reports configuration and never a computed domain.
    const { chart } = mount({ type: 'candlestick', data: tuples });
    expect(chart.getOptions().yAxis!.min).toBeUndefined();
    expect(chart.getOptions().yAxis!.max).toBeUndefined();
    expect(ohlcValueDomain(tuples)).toEqual([95, 115]); // 95..112 niced at 5 ticks
    expect(ohlcValueDomain({ series: [] })).toBeNull();
  });
});

describe('candlestick — rendering & animation policy', () => {
  it('bodies are filled theme.up/theme.down and wicks are 1px', () => {
    const { el } = mount({ type: 'candlestick', data: tuples });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.up)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.down)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 1)).toBe(true);
    expect(bodyRects(el)).toHaveLength(3); // one body per candle
  });

  it('appears instantly: animation is force-disabled and all candles paint on the first frame', () => {
    const { el, chart } = mount({ type: 'candlestick', data: tuples, animation: true });
    expect((chart.getOptions().animation as { enabled: boolean }).enabled).toBe(false);
    expect(bodyRects(el)).toHaveLength(3); // no sweep — full geometry immediately
  });

  it('uses a time x-axis for Date x values', () => {
    const dates = {
      series: [
        {
          name: 'AAPL',
          data: [
            { x: new Date(2024, 0, 2), o: 100, h: 110, l: 95, c: 105 },
            { x: new Date(2024, 0, 3), o: 105, h: 112, l: 101, c: 103 },
            { x: new Date(2024, 0, 4), o: 103, h: 108, l: 99, c: 107 },
          ],
        },
      ],
    };
    const { el } = mount({ type: 'candlestick', data: dates });
    expect(paintedText(el).some((t) => /Jan/.test(t))).toBe(true);
  });

  it('object and tuple forms produce the same a11y table', () => {
    const a = mount({ type: 'candlestick', data: tuples });
    const b = mount({ type: 'candlestick', data: objects });
    const rowsOf = (el: HTMLElement) =>
      [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
        [...tr.children].map((c) => c.textContent),
      );
    expect(rowsOf(a.el)).toEqual(rowsOf(b.el));
  });
});

describe('candlestick — tooltip, a11y, legend, keyboard', () => {
  it('per-mark tooltip shows an OHLC block with Open/High/Low/Close labels', () => {
    const { el } = mount({ type: 'candlestick', data: tuples });
    key(el, 'ArrowRight'); // first candle
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Open 100');
    expect(tip.innerHTML).toContain('High 110');
    expect(tip.innerHTML).toContain('Low 95');
    expect(tip.innerHTML).toContain('Close 105');
  });

  it('a11y table has Open/High/Low/Close columns with exact values', () => {
    const { el } = mount({ type: 'candlestick', data: tuples });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Time', 'Open', 'High', 'Low', 'Close']);
    const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr');
    expect(rows).toHaveLength(3);
    expect([...rows[0]!.children].map((c) => c.textContent)).toEqual(['1', '100', '110', '95', '105']);
  });

  it('keyboard navigation announces the OHLC values per candle', () => {
    const { el, chart } = mount({ type: 'candlestick', data: tuples });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'AAPL', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('Open 100');
    expect(region.textContent).toContain('point 1 of 3');
    key(el, 'ArrowRight');
    expect(region.textContent).toContain('Close 103');
  });

  it('legend follows the auto policy (hidden for a single series)', () => {
    const { el } = mount({ type: 'candlestick', data: tuples });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});
