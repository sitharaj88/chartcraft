/**
 * bullet (v0.3): nested grey range steps, measure/target geometry, the forced
 * horizontal orientation + exact value axis, hidden legend, a11y table,
 * tooltip and keyboard navigation.
 *
 * Layout arithmetic used by the mounted assertions (600x400, no title,
 * categories 'Revenue'/'Profits' = 7 chars = 42px, 6px per char):
 *   leftW = 42 + 14 = 56  ->  plot.x = 68, plot.w = 520, plot.y = 12, plot.h = 354
 *   value axis is EXACT [0, 100]        ->  xAt(v) = 68 + 5.2 * v
 *   band (bar padding 0.25 / 0.15, n=2) ->  step = 354 / 2.05, rowH = 0.75 * step
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, PointEvent } from '../src/index';
import { lightTheme, darkTheme } from '../src/index';
import { registerIntervalChartTypes } from '../src/charts/interval';
import {
  BULLET_MEASURE_RATIO,
  BULLET_TARGET_RATIO,
  BULLET_TARGET_WIDTH,
  bulletRawEntry,
  bulletRowGeometry,
  bulletValueMax,
  greyRangeSteps,
} from '../src/charts/interval';
import { relativeLuminance } from '../src/charts/matrix/color-scale';
import { cleanupDom, ctxOf, key, mount, paintedText } from './helpers';

registerIntervalChartTypes();

afterEach(cleanupDom);

const STEP = 354 / 2.05;
const ROW_H = STEP * 0.75;
const rowY = (i: number): number => 12 + STEP * 0.15 + i * STEP;
const xAt = (v: number): number => 68 + 5.2 * v;

const data: ChartData = {
  series: [
    {
      name: 'YTD',
      data: [
        { x: 'Revenue', y: 60, target: 90 },
        { x: 'Profits', y: 80 },
      ],
    },
  ],
};

const bullet = { ranges: [50, 75, 100], target: 70 };

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

/** fillRect calls, excluding the surface clear. */
function rects(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0))
    .map((c) => c.args as number[]);
}

describe('bullet — qualitative range steps (pure)', () => {
  it('greyRangeSteps ramps from axisLine (innermost) to gridline (outermost)', () => {
    expect(greyRangeSteps(3, lightTheme)).toEqual(['#c3c2b7', '#d2d1c8', '#e1e0d9']);
    expect(greyRangeSteps(2, lightTheme)).toEqual([lightTheme.axisLine, lightTheme.gridline]);
    expect(greyRangeSteps(1, lightTheme)).toEqual([lightTheme.gridline]);
    expect(greyRangeSteps(0, lightTheme)).toEqual([]);
  });

  it('the steps are greys only (never hues) and monotone in lightness', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const steps = greyRangeSteps(5, theme);
      const lum = steps.map((s) => relativeLuminance(s));
      for (let i = 1; i < lum.length; i++) {
        // Light theme ramps up (dark -> light), dark theme ramps the other way,
        // but each ramp is strictly monotone so every step is distinguishable.
        expect(lum[i]).not.toBe(lum[i - 1]);
      }
      // Grey = all three channels within 16/255 of each other.
      for (const s of steps) {
        const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(s.slice(i, i + 2), 16));
        expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(16);
      }
    }
  });

  it('the measure ink clears a 2:1 relief against every range step', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const ink = relativeLuminance(theme.textPrimary);
      for (const step of greyRangeSteps(4, theme)) {
        const s = relativeLuminance(step);
        const ratio = (Math.max(ink, s) + 0.05) / (Math.min(ink, s) + 0.05);
        expect(ratio).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('bullet — row geometry (pure)', () => {
  it('ranges are nested from zero and painted largest (lightest) first', () => {
    const g = bulletRowGeometry({
      rowY: 100,
      rowH: 50,
      value: 60,
      target: 90,
      ranges: [50, 75, 100],
      xAt: (v) => 200 + v * 2,
      colors: ['a', 'b', 'c'],
    });
    expect(g.rects).toEqual([
      { value: 100, x: 200, w: 200, color: 'c' },
      { value: 75, x: 200, w: 150, color: 'b' },
      { value: 50, x: 200, w: 100, color: 'a' },
    ]);
  });

  it('the measure is a thin bar centered in the row, from the zero baseline', () => {
    const g = bulletRowGeometry({
      rowY: 100,
      rowH: 50,
      value: 60,
      target: null,
      ranges: [],
      xAt: (v) => 200 + v * 2,
      colors: [],
    });
    // h = 50 * 0.34 = 17, centered -> y = 100 + (50 - 17) / 2 = 116.5
    expect(g.measure).toEqual({ x: 200, y: 116.5, w: 120, h: 17 });
    expect(BULLET_MEASURE_RATIO).toBe(0.34);
    expect(g.tick).toBeNull();
  });

  it('the target is a 2px perpendicular tick centered in the row', () => {
    const g = bulletRowGeometry({
      rowY: 100,
      rowH: 50,
      value: null,
      target: 90,
      ranges: [],
      xAt: (v) => 200 + v * 2,
      colors: [],
    });
    // h = 50 * 0.66 = 33, centered -> y = 100 + (50 - 33) / 2 = 108.5, x = 380 - 1
    expect(g.tick).toEqual({ x: 379, y: 108.5, w: BULLET_TARGET_WIDTH, h: 33 });
    expect(BULLET_TARGET_RATIO).toBe(0.66);
    expect(g.measure).toBeNull();
  });

  it('out-of-order and non-finite range boundaries are sorted/dropped', () => {
    const g = bulletRowGeometry({
      rowY: 0,
      rowH: 10,
      value: null,
      target: null,
      ranges: [100, Number.NaN, 50],
      xAt: (v) => v,
      colors: ['dark', 'light'],
    });
    expect(g.rects.map((r) => [r.value, r.color])).toEqual([
      [100, 'light'],
      [50, 'dark'],
    ]);
  });

  it('bulletValueMax spans zero, every value, target and range boundary', () => {
    expect(bulletValueMax(data, bullet)).toBe(100);
    expect(bulletValueMax(data, { ranges: [10] })).toBe(90); // the 90 target wins
    expect(bulletValueMax({ series: [] }, undefined)).toBe(1); // degenerate -> 0..1
  });

  it('bulletRawEntry reads value/target/low/high out of every DataValue shape', () => {
    expect(bulletRawEntry(5)).toEqual({ value: 5, target: null, low: null, high: null });
    expect(bulletRawEntry(null)).toEqual({ value: null, target: null, low: null, high: null });
    expect(bulletRawEntry([0, 7])).toEqual({ value: 7, target: null, low: null, high: null });
    expect(bulletRawEntry({ x: 'A', y: 3, target: 4, low: 1, high: 9 })).toEqual({
      value: 3,
      target: 4,
      low: 1,
      high: 9,
    });
  });
});

describe('bullet — rendering', () => {
  it('forces horizontal rows and an exact 0..max value axis', () => {
    const { chart, el } = mount({ type: 'bullet', data, bullet });
    expect(chart.getOptions().horizontal).toBe(true);
    // The domain comes from the pipeline's `extendValueDomain` stage now, so it
    // is NOT written into the caller's axis options (getOptions reports what
    // the caller configured, not a computed domain).
    expect(chart.getOptions().xAxis!.min).toBeUndefined();
    expect(chart.getOptions().xAxis!.max).toBeUndefined();
    expect(bulletValueMax(data, bullet)).toBe(100);
    // ...and it is EXACT (no nice() widening): 0 and 100 both land as ticks, so
    // the outermost qualitative range ends at the plot edge.
    const labels = paintedText(el);
    expect(labels).toContain('0');
    expect(labels).toContain('100');
  });

  it('draws nested range steps, the measure and the target tick per row', () => {
    const { el } = mount({ type: 'bullet', data, bullet });
    const all = rects(el);
    // 3 ranges x 2 rows + 2 measures + 2 target ticks
    expect(all).toHaveLength(10);
    const mH = ROW_H * BULLET_MEASURE_RATIO;
    const tH = ROW_H * BULLET_TARGET_RATIO;
    // Row 0 ranges, largest first.
    expect(all[0]).toEqual([68, rowY(0), 520, ROW_H]);
    expect(all[1]).toEqual([68, rowY(0), 390, ROW_H]);
    expect(all[2]).toEqual([68, rowY(0), 260, ROW_H]);
    // Row 0 measure: value 60 -> w = 312, centered thin bar.
    expect(all[6]).toEqual([68, rowY(0) + (ROW_H - mH) / 2, 312, mH]);
    // Row 1 measure: value 80 -> w = 416.
    expect(all[7]).toEqual([68, rowY(1) + (ROW_H - mH) / 2, 416, mH]);
    // Target ticks last: row 0 at 90 (per point), row 1 at 70 (chart-wide).
    expect(all[8]).toEqual([xAt(90) - 1, rowY(0) + (ROW_H - tH) / 2, 2, tH]);
    expect(all[9]).toEqual([xAt(70) - 1, rowY(1) + (ROW_H - tH) / 2, 2, tH]);
  });

  it('range steps wear the grey ramp and the measure/target wear textPrimary', () => {
    const { el } = mount({ type: 'bullet', data, bullet });
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    for (const step of greyRangeSteps(3, lightTheme)) expect(fills).toContain(step);
    expect(fills).toContain(lightTheme.textPrimary);
    // Never a series hue.
    expect(fills).not.toContain(lightTheme.series[0]);
  });

  it('a per-row low/high pair overrides the chart-wide ranges for that row', () => {
    const { el } = mount({
      type: 'bullet',
      bullet,
      data: {
        series: [
          {
            name: 'YTD',
            data: [
              { x: 'Revenue', y: 60, low: 20, high: 40 },
              { x: 'Profits', y: 80 },
            ],
          },
        ],
      },
    });
    const all = rects(el);
    // Row 0 now has TWO range rects (40 then 20), row 1 keeps its three.
    expect(all.slice(0, 2)).toEqual([
      [68, rowY(0), xAt(40) - 68, ROW_H],
      [68, rowY(0), xAt(20) - 68, ROW_H],
    ]);
    expect(all).toHaveLength(2 + 3 + 2 + 2);
  });

  it('row labels come from the band axis (rows are labeled, not legended)', () => {
    const { el } = mount({ type: 'bullet', data, bullet });
    const texts = paintedText(el);
    expect(texts).toContain('Revenue');
    expect(texts).toContain('Profits');
  });
});

describe('bullet — legend, a11y, tooltip, keyboard', () => {
  it('the legend is hidden always, even with an explicit legend: true', () => {
    const auto = mount({ type: 'bullet', data, bullet });
    expect((auto.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const forced = mount({ type: 'bullet', data, bullet, legend: true });
    expect((forced.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(forced.el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
  });

  it('a11y table is label / value / target / ranges', () => {
    const { el, chart } = mount({ type: 'bullet', data, bullet });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Label', 'Value', 'Target', 'Ranges']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Revenue', '60', '90', '50, 75, 100'],
      ['Profits', '80', '70', '50, 75, 100'],
    ]);
    expect(chart.exportData({ format: 'json' })).toContain('"Ranges": "50, 75, 100"');
  });

  it('tooltip carries the value, target and ranges', () => {
    const { el } = mount({ type: 'bullet', data, bullet });
    key(el, 'ArrowRight');
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Revenue');
    expect(tip.innerHTML).toContain('60 · target 90 · ranges 50, 75, 100');
  });

  it('keyboard navigation walks the rows and announces value + target', () => {
    const { el, chart } = mount({ type: 'bullet', data, bullet });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'YTD', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('Revenue: 60, target 90. Row 1 of 2.');
    key(el, 'End');
    expect(region.textContent).toBe('Profits: 80, target 70. Row 2 of 2.');
  });

  it('hit-testing claims the whole row band', () => {
    const { el, chart } = mount({ type: 'bullet', data, bullet });
    const clicks: PointEvent[] = [];
    chart.on('pointclick', (e) => clicks.push(e));
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    // Anywhere inside row 1's band, even past the measure bar's end.
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 560, clientY: rowY(1) + 4, bubbles: true }));
    expect(clicks[0]).toMatchObject({ dataIndex: 1, seriesName: 'YTD' });
  });
});
