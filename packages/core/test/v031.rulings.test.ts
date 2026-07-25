/**
 * v0.3.1 — the architect's rulings on the quality audit's open escalations.
 *
 * E-3  sequential ramps are scheme-aware (the HIGH end never recedes)
 * E-6  candlestick/ohlc carry direction in a channel that is not colour
 * E-1  palette slots 9+ get composite encoding + a one-time recommendation
 * E-10 the DOM table cap is a default, not a policy (`a11y.tableMaxRows`)
 * ---  forced-colors is implemented, so ARCHITECTURE.md's claim is true
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartOptions } from '../src/index';
import { darkTheme, lightTheme, sequentialPalette } from '../src/index';
import {
  FORCED_COLORS_QUERY,
  forcedColorsPalette,
  forcedColorsTheme,
  resolveSequentialRamp,
  sequentialRampFor,
} from '../src/theme';
import { registerBuiltinChartTypes } from '../src/charts';
import { contrastRatio } from '../src/charts/matrix/color-scale';
import { heatmapColor, heatmapRamp } from '../src/charts/matrix/heatmap';
import { calendarRamp } from '../src/charts/composition/calendar';
import { choroplethColor, choroplethRamp } from '../src/charts/geo/choropleth';
import { A11Y_TABLE_MAX_ROWS, resolveTableMaxRows } from '../src/a11y';
import { buildModel, resolveOptions, seriesColor, seriesDash, seriesMarker } from '../src/model';
import { swatchBackground } from '../src/components/legend';
import { markerPath } from '../src/charts/markers';
import { FIXTURES } from './fixtures.all-types';
import { canvasOf, cleanupDom, ctxOf, key, mount } from './helpers';
import { resetMediaQueries, setMediaQuery } from './setup';

registerBuiltinChartTypes();

afterEach(() => {
  cleanupDom();
  resetMediaQueries();
});

/** The step a ramp assigns to the MAXIMUM value of its scale. */
function colorAtMax(ramp: readonly string[]): string {
  return heatmapColor(1, 0, 1, ramp);
}
/** The step a ramp assigns to the MINIMUM (near-zero) value of its scale. */
function colorAtMin(ramp: readonly string[]): string {
  return heatmapColor(0, 0, 1, ramp);
}

// ---------------------------------------------------------------------------
// E-3 — sequential ramps are scheme-aware
// ---------------------------------------------------------------------------

describe('E-3: the sequential ramp flips direction with the colour scheme', () => {
  it('light keeps low->lightest / high->darkest; dark reverses it', () => {
    expect(sequentialRampFor('light')).toEqual(sequentialPalette);
    expect(sequentialRampFor('dark')).toEqual([...sequentialPalette].reverse());
    // The two orientations are exact mirrors — same steps, no re-picked hex.
    expect(sequentialRampFor('dark')).toEqual([...sequentialRampFor('light')].reverse());
  });

  it("never reorients a CALLER's ramp — they chose the direction", () => {
    const mine = ['#111111', '#eeeeee'];
    expect(resolveSequentialRamp(mine, 'light')).toEqual(mine);
    expect(resolveSequentialRamp(mine, 'dark')).toEqual(mine);
    expect(resolveSequentialRamp(undefined, 'dark')).toEqual([...sequentialPalette].reverse());
    expect(resolveSequentialRamp([], 'light')).toEqual(sequentialPalette); // empty = "none supplied"
  });

  // The whole point of the ruling: the cell carrying the LARGEST magnitude is
  // never the one that disappears. Before the fix, `#0d366b` sat at 1.46:1 on
  // the dark surface and it was the high end of the scale in BOTH modes.
  it.each([
    ['heatmap', (scheme: 'light' | 'dark') => heatmapRamp({}, scheme)],
    ['calendar', (scheme: 'light' | 'dark') => calendarRamp({}, scheme)],
    ['choropleth', (scheme: 'light' | 'dark') => choroplethRamp({}, scheme)],
  ] as const)('%s: the MAXIMUM-magnitude step clears 3:1 in both modes', (_id, ramp) => {
    const light = contrastRatio(colorAtMax(ramp('light')), lightTheme.surface);
    const dark = contrastRatio(colorAtMax(ramp('dark')), darkTheme.surface);
    expect(light).toBeGreaterThanOrEqual(3);
    expect(dark).toBeGreaterThanOrEqual(3);
    // Measured: 11.64:1 light (#0d366b), 13.16:1 dark (#cde2fb).
    expect(light).toBeGreaterThan(11);
    expect(dark).toBeGreaterThan(13);
  });

  it.each([
    ['heatmap', (scheme: 'light' | 'dark') => heatmapRamp({}, scheme)],
    ['calendar', (scheme: 'light' | 'dark') => calendarRamp({}, scheme)],
    ['choropleth', (scheme: 'light' | 'dark') => choroplethRamp({}, scheme)],
  ] as const)('%s: the mapping INVERTS with the scheme', (_id, ramp) => {
    // What the light surface paints for "the most" is what the dark surface
    // paints for "almost nothing", and vice versa.
    expect(colorAtMax(ramp('light'))).toBe(colorAtMin(ramp('dark')));
    expect(colorAtMin(ramp('light'))).toBe(colorAtMax(ramp('dark')));
    // And only the near-zero end is ever allowed to recede into the surface.
    expect(contrastRatio(colorAtMin(ramp('dark')), darkTheme.surface)).toBeLessThan(2);
    expect(contrastRatio(colorAtMin(ramp('light')), lightTheme.surface)).toBeLessThan(2);
  });

  it('a mounted dark-mode heatmap paints its largest cells in a LIGHT step', () => {
    // Every cell at the TOP of the scale, so only the high end is exercised.
    const topped = (theme: 'light' | 'dark') =>
      ({
        type: 'heatmap',
        theme,
        heatmap: { min: 0, max: 4 },
        data: { categories: ['A', 'B'], series: [{ name: 'N', data: [4, 4] }] },
      }) as ChartOptions;
    const fills = (el: HTMLElement): string[] =>
      ctxOf(el)
        .__props.filter((p) => p.prop === 'fillStyle')
        .map((p) => String(p.value));

    const light = mount(topped('light'));
    expect(fills(light.el)).toContain('#0d366b'); // 11.64:1 on #fcfcfb
    expect(fills(light.el)).not.toContain('#cde2fb');
    light.chart.destroy();

    // The darkest ramp step used to be painted here too, at 1.46:1 — the
    // highest-magnitude cells were the invisible ones. Now they are the
    // brightest thing on the surface.
    const dark = mount(topped('dark'));
    expect(fills(dark.el)).toContain('#cde2fb'); // 13.16:1 on #1a1a19
    expect(fills(dark.el)).not.toContain('#0d366b');
    dark.chart.destroy();
  });

  it('a mounted dark-mode choropleth shades its largest feature legibly', () => {
    const ramp = choroplethRamp({}, 'dark');
    const top = choroplethColor(8, 3, 8, ramp);
    expect(contrastRatio(top, darkTheme.surface)).toBeGreaterThanOrEqual(3);
    const { el, chart } = mount({ type: 'choropleth', theme: 'dark', ...FIXTURES.choropleth } as ChartOptions);
    const fills = ctxOf(el)
      .__props.filter((p) => p.prop === 'fillStyle')
      .map((p) => String(p.value));
    expect(fills).toContain(top);
    chart.destroy();
  });

  it('the gradient legend follows the oriented ramp, so min stays at the min label', () => {
    const { el, chart } = mount({ type: 'heatmap', theme: 'dark', ...FIXTURES.heatmap } as ChartOptions);
    const bar = el.querySelector('.chartcraft-heatmap-legend-bar') as HTMLElement;
    const bg = bar.style.background;
    // Dark mode: the bar starts at the darkest step (the low end) and ends light.
    expect(bg.indexOf('#0d366b')).toBeLessThan(bg.indexOf('#cde2fb'));
    chart.destroy();
  });
});

// ---------------------------------------------------------------------------
// E-6 — direction is not carried by colour alone
// ---------------------------------------------------------------------------

const OHLC_DATA = {
  series: [
    {
      name: 'AAPL',
      data: [
        [1, 100, 110, 95, 105] as [number, number, number, number, number], // rising
        [2, 105, 112, 101, 103] as [number, number, number, number, number], // falling
      ],
    },
  ],
};

describe('E-6: candlestick/ohlc encode rise and fall without relying on colour', () => {
  it('candlestick: rising bodies are stroked outlines, falling bodies are fills', () => {
    const { el, chart } = mount({ type: 'candlestick', data: OHLC_DATA });
    const ctx = ctxOf(el);
    // One rising candle -> exactly one outlined body.
    expect(ctx.__calls.filter((c) => c.method === 'strokeRect')).toHaveLength(1);
    // One falling candle -> exactly one body fill in theme.down.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.down)).toBe(true);
    // theme.up NEVER appears as a fill: that is the colour-only channel removed.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.up)).toBe(false);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.up)).toBe(true);
    chart.destroy();
  });

  it('candlestick: a chart of only falling candles outlines nothing', () => {
    const falling = { series: [{ name: 'X', data: [[1, 110, 112, 100, 101] as [number, number, number, number, number]] }] };
    const { el, chart } = mount({ type: 'candlestick', data: falling });
    expect(ctxOf(el).__calls.filter((c) => c.method === 'strokeRect')).toHaveLength(0);
    chart.destroy();
  });

  it('ohlc: the close tick sits above the open tick when rising, below when falling', () => {
    // OHLC has no body to fill, and needs none — its geometry already carries
    // direction, the way a waterfall bar's rise or fall does.
    const { el, chart } = mount({ type: 'ohlc', data: OHLC_DATA });
    const calls = ctxOf(el).__calls;
    const segs: { x1: number; x2: number; y: number }[] = [];
    calls.forEach((c, i) => {
      const next = calls[i + 1];
      if (c.method !== 'moveTo' || !next || next.method !== 'lineTo') return;
      if (c.args[1] !== next.args[1]) return; // horizontal only
      const x1 = c.args[0] as number;
      const x2 = next.args[0] as number;
      // Tick, not a gridline: gridlines span the plot, ticks span half a slot.
      if (Math.abs(x2 - x1) > 60) return;
      segs.push({ x1, x2, y: c.args[1] as number });
    });
    // Each mark contributes an open tick ENDING at its center x and a close
    // tick STARTING there, so the pair is found by that shared coordinate.
    const centers = [...new Set(segs.map((s) => s.x2).filter((x) => segs.some((s) => s.x1 === x)))].sort(
      (a, b) => a - b,
    );
    expect(centers).toHaveLength(2);
    const pairAt = (cx: number) => ({
      open: segs.find((s) => s.x2 === cx) as (typeof segs)[0],
      close: segs.find((s) => s.x1 === cx) as (typeof segs)[0],
    });
    const rising = pairAt(centers[0] as number);
    const falling = pairAt(centers[1] as number);
    expect(rising.open.x1).toBeLessThan(rising.open.x2); // open tick to the LEFT
    expect(rising.close.x1).toBeLessThan(rising.close.x2); // close tick to the RIGHT
    expect(rising.close.y).toBeLessThan(rising.open.y); // rising: close is higher on screen
    expect(falling.close.y).toBeGreaterThan(falling.open.y); // falling: close is lower
    chart.destroy();
  });

  it.each(['candlestick', 'ohlc'] as const)(
    '%s: the convention is announced in the accessible description, not just drawn',
    (type) => {
      const { el, chart } = mount({ type, data: OHLC_DATA } as ChartOptions);
      const id = canvasOf(el).getAttribute('aria-describedby');
      expect(id).not.toBeNull();
      const text = el.querySelector(`#${id}`)?.textContent ?? '';
      expect(text).toContain('never carried by color alone');
      if (type === 'candlestick') expect(text).toContain('hollow');
      else expect(text).toContain('close tick');
      chart.destroy();
    },
  );

  it.each(['candlestick', 'ohlc'] as const)('%s: each mark announces rising or falling', (type) => {
    const { el, chart } = mount({ type, data: OHLC_DATA } as ChartOptions);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toContain('rising');
    key(el, 'ArrowRight');
    expect(region.textContent).toContain('falling');
    chart.destroy();
  });

  it('a doji (close === open) announces "unchanged" rather than guessing', () => {
    const doji = { series: [{ name: 'X', data: [[1, 100, 105, 95, 100] as [number, number, number, number, number]] }] };
    const { el, chart } = mount({ type: 'candlestick', data: doji });
    key(el, 'ArrowRight');
    expect((el.querySelector('.chartcraft-announcer') as HTMLElement).textContent).toContain('unchanged');
    chart.destroy();
  });
});

// ---------------------------------------------------------------------------
// E-1 — composite encoding past palette slot 8
// ---------------------------------------------------------------------------

/** N series of the same shape, so palette slots are assigned 0..N-1. */
function manySeries(n: number): ChartOptions {
  return {
    type: 'line',
    data: {
      categories: ['a', 'b', 'c'],
      series: Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, data: [1, 2, 3] })),
    },
  } as ChartOptions;
}

describe('E-1: series past palette slot 8 reuse the hue with a second channel', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('the hue ORDER is reused, never generated', () => {
    const model = buildModel(resolveOptions(manySeries(10)), new Map());
    const s1 = model.series[0]!;
    const s9 = model.series[8]!;
    const s10 = model.series[9]!;
    expect(seriesColor(s9, lightTheme)).toBe(seriesColor(s1, lightTheme));
    expect(seriesColor(s10, lightTheme)).toBe(seriesColor(model.series[1]!, lightTheme));
    // ...and every one of the 8 validated slots is used before any repeats.
    const first8 = model.series.slice(0, 8).map((s) => seriesColor(s, lightTheme));
    expect(new Set(first8).size).toBe(8);
  });

  it('but series 9 is NOT visually identical to series 1: dash + marker shape differ', () => {
    const model = buildModel(resolveOptions(manySeries(10)), new Map());
    expect(seriesDash(model.series[0]!, lightTheme)).toBeUndefined();
    expect(seriesMarker(model.series[0]!, lightTheme)).toBe('circle');
    expect(seriesDash(model.series[8]!, lightTheme)).toEqual([7, 4]);
    expect(seriesMarker(model.series[8]!, lightTheme)).toBe('square');
    // Series 17+ would take the next pair, not repeat the first.
    const many = buildModel(resolveOptions(manySeries(17)), new Map());
    expect(seriesDash(many.series[16]!, lightTheme)).toEqual([1.5, 3]);
    expect(seriesMarker(many.series[16]!, lightTheme)).toBe('triangle');
  });

  it('an explicit per-series color opts out of the composite encoding entirely', () => {
    const opts = manySeries(9);
    opts.data.series[8] = { ...opts.data.series[8]!, color: '#123456' };
    const model = buildModel(resolveOptions(opts), new Map());
    expect(seriesColor(model.series[8]!, lightTheme)).toBe('#123456');
    expect(seriesDash(model.series[8]!, lightTheme)).toBeUndefined();
  });

  it('the dash reaches the canvas, and the legend swatch matches the line', () => {
    const { el, chart } = mount({ ...manySeries(9), legend: true } as ChartOptions);
    const dashes = ctxOf(el)
      .__calls.filter((c) => c.method === 'setLineDash')
      .map((c) => c.args[0]);
    expect(dashes).toContainEqual([7, 4]);
    const swatches = [...el.querySelectorAll('.chartcraft-legend-swatch')] as HTMLElement[];
    expect(swatches).toHaveLength(9);
    expect(swatches[0]!.style.background).not.toContain('repeating-linear-gradient');
    expect(swatches[8]!.style.background).toContain('repeating-linear-gradient');
    chart.destroy();
  });

  it('scatter has no line to dash, so shape carries the whole second channel', () => {
    const opts = { ...manySeries(9), type: 'scatter' } as ChartOptions;
    const { el, chart } = mount(opts);
    // Squares are rects; the first eight series draw arcs.
    const ctx = ctxOf(el);
    expect(ctx.__calls.some((c) => c.method === 'arc' && c.args[2] === 4)).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'fillRect' && c.args[2] === c.args[3])).toBe(true);
    chart.destroy();
  });

  it('warns ONCE per chart — naming the chart and recommending the fold', () => {
    const { chart } = mount({ ...manySeries(9), title: 'Regions' } as ChartOptions);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('"Regions"');
    expect(msg).toContain('9 series');
    expect(msg).toContain('8 colorblind-safe slots');
    expect(msg).toContain('"Other"');
    expect(msg).toContain('small multiples');
    // Not once per frame, and not once per update.
    chart.resize();
    chart.update({ title: 'Regions' });
    expect(warn).toHaveBeenCalledTimes(1);
    chart.destroy();
  });

  it('says nothing at all for eight series or fewer', () => {
    const { chart } = mount(manySeries(8));
    expect(warn).not.toHaveBeenCalled();
    chart.destroy();
  });

  it('marker shapes are area-matched, so no shape reads as the larger mark', () => {
    // A triangle inscribed in the marker radius would look ~40% smaller than
    // the circle beside it, which would read as data.
    const tri = markerPath('triangle', 0, 0, 4);
    const dia = markerPath('diamond', 0, 0, 4);
    const areaOf = (cmds: ReturnType<typeof markerPath>): number => {
      const pts = cmds.filter((c) => c[0] === 'M' || c[0] === 'L').map((c) => [c[1] as number, c[2] as number]);
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i] as [number, number];
        const [x2, y2] = pts[(i + 1) % pts.length] as [number, number];
        a += x1 * y2 - x2 * y1;
      }
      return Math.abs(a) / 2;
    };
    const circle = Math.PI * 16;
    expect(areaOf(tri)).toBeCloseTo(circle, 0);
    expect(areaOf(dia)).toBeCloseTo(circle, 0);
  });

  it('swatchBackground is a flat colour without a dash and a stripe with one', () => {
    expect(swatchBackground('#2a78d6')).toBe('#2a78d6');
    expect(swatchBackground('#2a78d6', [7, 4])).toContain('repeating-linear-gradient');
    expect(swatchBackground('#2a78d6', [7, 4])).toContain('#2a78d6 0 5px'); // clamped into 10px
  });
});

// ---------------------------------------------------------------------------
// E-10 — the DOM table cap is the caller's to raise
// ---------------------------------------------------------------------------

const ROWS = 2500;
const wide = (a11y: ChartOptions['a11y']): ChartOptions =>
  ({
    type: 'line',
    downsample: { enabled: false },
    a11y,
    data: { series: [{ name: 'S', data: Array.from({ length: ROWS }, (_, i) => [i, i] as [number, number]) }] },
  }) as ChartOptions;

describe('E-10: a11y.tableMaxRows', () => {
  const rowCount = (el: HTMLElement): number => el.querySelectorAll('.chartcraft-a11y-table tbody tr').length;
  const captionOf = (el: HTMLElement): string =>
    el.querySelector('.chartcraft-a11y-table caption')?.textContent ?? '';
  const descOf = (el: HTMLElement): string => {
    const id = canvasOf(el).getAttribute('aria-describedby');
    return id ? (el.querySelector(`#${id}`)?.textContent ?? '') : '';
  };

  it('resolves sanely: default, clamp, Infinity', () => {
    expect(resolveTableMaxRows(undefined)).toBe(A11Y_TABLE_MAX_ROWS);
    expect(resolveTableMaxRows(Number.NaN)).toBe(A11Y_TABLE_MAX_ROWS);
    expect(resolveTableMaxRows(-5)).toBe(0);
    expect(resolveTableMaxRows(50)).toBe(50);
    expect(resolveTableMaxRows(Infinity)).toBe(Infinity);
  });

  it('defaults to 2,000 rows, unchanged', () => {
    const { el, chart } = mount(wide(undefined));
    expect(rowCount(el)).toBe(A11Y_TABLE_MAX_ROWS);
    expect(captionOf(el)).toContain('first 2,000');
    chart.destroy();
  });

  it('honours a lower cap, and states it in BOTH places a reader could look', () => {
    const { el, chart } = mount(wide({ tableMaxRows: 50 }));
    expect(rowCount(el)).toBe(50);
    expect(captionOf(el)).toContain('first 50 of 2,500 rows');
    expect(captionOf(el)).toContain('exportData()');
    expect(descOf(el)).toContain('first 50 of 2,500 rows');
    chart.destroy();
  });

  it('Infinity materializes every row and says nothing about truncation', () => {
    const { el, chart } = mount(wide({ tableMaxRows: Infinity }));
    expect(rowCount(el)).toBe(ROWS);
    expect(captionOf(el)).not.toContain('showing the first');
    expect(descOf(el)).not.toContain('exportData()');
    chart.destroy();
  });

  it('exportData is uncapped whatever the DOM cap is', () => {
    for (const max of [undefined, 10, Infinity]) {
      const { chart } = mount(wide(max === undefined ? undefined : { tableMaxRows: max }));
      expect(chart.exportData({ format: 'csv' }).split('\n').length - 1).toBe(ROWS);
      chart.destroy();
    }
  });

  it('is live: update({ a11y }) re-materializes the table at the new bound', () => {
    const { el, chart } = mount(wide({ tableMaxRows: 10 }));
    expect(rowCount(el)).toBe(10);
    chart.update({ a11y: { tableMaxRows: 100 } });
    expect(rowCount(el)).toBe(100);
    chart.destroy();
  });
});

// ---------------------------------------------------------------------------
// forced-colors
// ---------------------------------------------------------------------------

describe('forced-colors: active', () => {
  const forced = (on: boolean): void => setMediaQuery(FORCED_COLORS_QUERY, on);

  it('re-expresses the theme in CSS system colours', () => {
    const t = forcedColorsTheme(lightTheme);
    expect(t.surface).toBe('Canvas');
    expect(t.textPrimary).toBe('CanvasText');
    expect(t.gridline).toBe('GrayText');
    expect(t.series).toEqual(forcedColorsPalette);
    expect(t.forcedColors).toBe(true);
    // Typography and scheme survive: forced colours replaces the palette only.
    expect(t.fontFamily).toBe(lightTheme.fontFamily);
    expect(t.colorScheme).toBe('light');
  });

  it('paints the canvas in system colours when the query matches at mount', () => {
    forced(true);
    const { el, chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === 'Canvas')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === 'CanvasText')).toBe(true);
    // The authored palette must not reach the canvas at all.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.series[0])).toBe(false);
    // jsdom lowercases CSS keywords on the way through the style property.
    expect((el.querySelector('.chartcraft') as HTMLElement).style.background.toLowerCase()).toBe('canvas');
    chart.destroy();
  });

  it('overrides an EXPLICIT theme — it is a user preference, not a default', () => {
    forced(true);
    const { el, chart } = mount({ type: 'line', theme: 'dark', ...FIXTURES.line } as ChartOptions);
    const fills = ctxOf(el)
      .__props.filter((p) => p.prop === 'fillStyle')
      .map((p) => String(p.value));
    expect(fills).toContain('Canvas');
    expect(fills).not.toContain(darkTheme.surface);
    chart.destroy();
  });

  it('updates LIVE when the user turns high contrast on and off', () => {
    const { el, chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    const renders: string[] = [];
    chart.on('render', (e) => renders.push(e.reason));
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === 'Canvas')).toBe(false);

    forced(true);
    expect(renders).toContain('update');
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === 'Canvas')).toBe(true);

    forced(false);
    const after = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').slice(-40);
    expect(after.some((p) => p.value === lightTheme.surface)).toBe(true);
    chart.destroy();
  });

  it('stops listening on destroy', () => {
    const { chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    const renders: string[] = [];
    chart.on('render', (e) => renders.push(e.reason));
    chart.destroy();
    expect(() => forced(true)).not.toThrow();
    expect(renders).toHaveLength(0);
  });

  it('the financial fill convention is what survives it', () => {
    // Under forced colours `up` and `down` are the SAME colour, so a
    // filled-vs-filled candlestick would be unreadable. Hollow vs solid is not.
    forced(true);
    const { el, chart } = mount({ type: 'candlestick', data: OHLC_DATA });
    const ctx = ctxOf(el);
    expect(forcedColorsTheme(lightTheme).up).toBe(forcedColorsTheme(lightTheme).down);
    expect(ctx.__calls.filter((c) => c.method === 'strokeRect')).toHaveLength(1); // the rising one
    chart.destroy();
  });
});
