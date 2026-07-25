import { afterEach, describe, expect, it } from 'vitest';
import { registerRadialChartTypes } from '../src/charts/radial';
import {
  GAUGE_END_ANGLE,
  GAUGE_START_ANGLE,
  GAUGE_SWEEP,
  computeGaugeFrame,
  gaugeBandColor,
  gaugeBandSegments,
  gaugeValueAngle,
} from '../src/charts/radial/gauge';
import type { PointEvent } from '../src/index';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerRadialChartTypes();
afterEach(cleanupDom);

const data = { series: [{ name: 'CPU', data: [72] }] };

const BANDS = [
  { to: 40, color: '#0ca30c' },
  { to: 80, color: '#eda100' },
  { to: 100, color: '#d03b3b' },
];

describe('gauge — arc math', () => {
  it('spans 270 degrees with the gap at the bottom', () => {
    expect(GAUGE_START_ANGLE).toBeCloseTo((3 * Math.PI) / 4, 12); // 135°, bottom-left
    expect(GAUGE_SWEEP).toBeCloseTo((3 * Math.PI) / 2, 12); // 270°
    expect(GAUGE_END_ANGLE).toBeCloseTo((9 * Math.PI) / 4, 12); // 405° = bottom-right
  });

  it('maps values linearly onto the arc (50% of 0..100 points straight up)', () => {
    expect(gaugeValueAngle(0, 0, 100)).toBeCloseTo(GAUGE_START_ANGLE, 12);
    expect(gaugeValueAngle(50, 0, 100)).toBeCloseTo((3 * Math.PI) / 2, 12); // top
    expect(gaugeValueAngle(100, 0, 100)).toBeCloseTo(GAUGE_END_ANGLE, 12);
    expect(gaugeValueAngle(0.5, 0, 1)).toBeCloseTo((3 * Math.PI) / 2, 12); // custom range
  });

  it('clamps values outside the range to the arc ends', () => {
    expect(gaugeValueAngle(-10, 0, 100)).toBeCloseTo(GAUGE_START_ANGLE, 12);
    expect(gaugeValueAngle(250, 0, 100)).toBeCloseTo(GAUGE_END_ANGLE, 12);
  });

  it('band segments cover contiguous clamped ranges with exact angles', () => {
    const segs = gaugeBandSegments(BANDS, 0, 100);
    expect(segs.map((s) => [s.from, s.to])).toEqual([
      [0, 40],
      [40, 80],
      [80, 100],
    ]);
    expect(segs[0]!.a0).toBeCloseTo(GAUGE_START_ANGLE, 12);
    expect(segs[0]!.a1).toBeCloseTo(GAUGE_START_ANGLE + 0.4 * GAUGE_SWEEP, 12);
    expect(segs[2]!.a1).toBeCloseTo(GAUGE_END_ANGLE, 12);
  });

  it('value arc takes the color of the band it falls in', () => {
    expect(gaugeBandColor(BANDS, 30, '#000000')).toBe('#0ca30c');
    expect(gaugeBandColor(BANDS, 40, '#000000')).toBe('#0ca30c'); // inclusive upper bound
    expect(gaugeBandColor(BANDS, 72, '#000000')).toBe('#eda100');
    expect(gaugeBandColor(BANDS, 250, '#000000')).toBe('#d03b3b'); // beyond last -> last
    expect(gaugeBandColor([], 50, '#123456')).toBe('#123456');
  });

  it('computeGaugeFrame: ring radii and center are exact', () => {
    const f = computeGaugeFrame({ value: 50, min: 0, max: 100, plot: { x: 0, y: 0, w: 400, h: 400 }, si: 0 });
    expect(f.cx).toBe(200);
    expect(f.cy).toBe(200);
    expect(f.r1).toBe(198);
    expect(f.r0).toBeCloseTo(198 - 198 * 0.15, 9); // 15% ring thickness
    expect(f.valueAngle).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it('rejects an invalid range with a helpful error', () => {
    expect(() => mount({ type: 'gauge', data, gauge: { min: 10, max: 5 } })).toThrow(/max > min/);
  });
});

describe('gauge — rendering smoke (call log)', () => {
  it('draws a gridline track, a series-1 value arc, big center value and muted min/max', () => {
    const { el } = mount({ type: 'gauge', data });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#e1e0d9')).toBe(true); // track
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2a78d6')).toBe(true); // value arc
    const texts = paintedText(el);
    expect(texts).toContain('72'); // big center value
    expect(texts).toContain('0'); // min at arc end
    expect(texts).toContain('100'); // max at arc end
    // Center value: textPrimary at 3x base size.
    expect(ctx.__props.some((p) => p.prop === 'font' && String(p.value).includes('36px'))).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#0b0b0b')).toBe(true);
    // Min/max labels in textMuted.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });

  it('with bands: track shows band colors and the value arc uses its band color', () => {
    const { el } = mount({ type: 'gauge', data, gauge: { bands: BANDS } });
    const ctx = ctxOf(el);
    for (const b of BANDS) {
      expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === b.color)).toBe(true);
    }
    // Value 72 falls in the amber band; alpha 1 draw exists for the value arc.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#eda100')).toBe(true);
    // Series-1 blue is NOT used when bands are configured.
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#2a78d6')).toBe(false);
  });

  it('honors a custom gauge.min/max range', () => {
    const { el } = mount({ type: 'gauge', data, gauge: { min: 0, max: 200 } });
    expect(paintedText(el)).toContain('200');
    const cells = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr td')].map((n) => n.textContent);
    expect(cells).toEqual(['72', '0', '200']);
  });
});

describe('gauge — legend policy (none, ever)', () => {
  it('never shows a legend, even when explicitly requested', () => {
    const { el } = mount({
      type: 'gauge',
      data: { series: [{ name: 'CPU', data: [72] }, { name: 'Ignored', data: [10] }] },
      legend: true,
    });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
  });
});

describe('gauge — a11y table (one row: name, value, min, max)', () => {
  it('renders exactly one row', () => {
    const { el } = mount({ type: 'gauge', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Name', 'Value', 'Min', 'Max']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')];
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.children].map((c) => c.textContent)).toEqual(['CPU', '72', '0', '100']);
  });
});

describe('gauge — keyboard & tooltip (single focusable datum)', () => {
  it('focuses the single datum, announces value and range, and stays put', () => {
    const { el, chart } = mount({ type: 'gauge', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'CPU', dataIndex: 0, y: 72, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('CPU: 72. Range 0 to 100.');
    key(el, 'ArrowRight'); // only one datum — no further move
    key(el, 'ArrowDown');
    expect(enters).toHaveLength(1);
    // Enter activates the datum.
    const clicks: PointEvent[] = [];
    chart.on('pointclick', (e) => clicks.push(e));
    key(el, 'Enter');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.dataIndex).toBe(0);
  });

  it('hovering the arc hits the datum and shows a name + value tooltip', () => {
    const { el, chart } = mount({ type: 'gauge', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // Top of the ring: center (300, 200), mid radius ~172 -> (300, 28).
    pointerMove(el, 300, 28);
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'CPU', dataIndex: 0 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('CPU');
    expect(tip.innerHTML).toContain('72');
    // The bottom gap misses.
    pointerMove(el, 300, 380);
    expect(enters).toHaveLength(1);
  });
});
