import { afterEach, describe, expect, it } from 'vitest';
import { registerRadialChartTypes } from '../src/charts/radial';
import {
  FUNNEL_GAP,
  computeFunnelSegments,
  funnelColorIndices,
  type FunnelStage,
} from '../src/charts/radial/funnel';
import { sequentialPalette } from '../src/theme';
import type { PointEvent } from '../src/index';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerRadialChartTypes();
afterEach(cleanupDom);

const data = {
  series: [
    {
      name: 'Conversions',
      data: [
        { x: 'Top', y: 1000 },
        { x: 'Mid', y: 500 },
        { x: 'Low', y: 250 },
      ],
    },
  ],
};

const stage = (pi: number, value: number): FunnelStage => ({ pi, label: `S${pi}`, value, color: '#000000' });

describe('funnel — ordinal ramp step selection', () => {
  it('light mode starts at #86b6ef (index 3) and darkens, evenly spaced', () => {
    expect(funnelColorIndices(4, 'light')).toEqual([3, 6, 9, 12]);
    expect(funnelColorIndices(3, 'light')).toEqual([3, 8, 12]);
    expect(funnelColorIndices(10, 'light')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(funnelColorIndices(1, 'light')).toEqual([3]);
    expect(sequentialPalette[3]).toBe('#86b6ef'); // legal light start per contract
  });

  it('dark mode starts at #184f95 (index 10) and lightens, evenly spaced', () => {
    expect(funnelColorIndices(4, 'dark')).toEqual([10, 7, 3, 0]);
    expect(funnelColorIndices(3, 'dark')).toEqual([10, 5, 0]);
    expect(funnelColorIndices(1, 'dark')).toEqual([10]);
    expect(sequentialPalette[10]).toBe('#184f95'); // legal dark start per contract
  });
});

describe('funnel — segment layout math', () => {
  it('widths are proportional to value, segments centered, 2px gaps', () => {
    const segs = computeFunnelSegments(
      [stage(0, 100), stage(1, 50), stage(2, 25)],
      { x: 0, y: 0, w: 440, h: 304 },
      40, // label gutter -> 400px available
    );
    expect(segs.map((s) => s.w)).toEqual([400, 200, 100]);
    expect(segs.map((s) => s.x)).toEqual([0, 100, 150]); // centered on 200
    expect(segs.map((s) => s.y)).toEqual([0, 102, 204]);
    expect(segs.map((s) => s.h)).toEqual([100, 100, 100]);
    // Exact 2px surface gap between adjacent segments.
    expect(segs[1]!.y - (segs[0]!.y + segs[0]!.h)).toBe(FUNNEL_GAP);
    // Labels sit beside each segment's right edge.
    expect(segs[0]!.labelX).toBe(408);
    expect(segs[1]!.labelX).toBe(308);
  });

  it('zero/negative values collapse to zero width without breaking layout', () => {
    const segs = computeFunnelSegments(
      [stage(0, 100), stage(1, 0)],
      { x: 0, y: 0, w: 100, h: 22 },
      0,
    );
    expect(segs[1]!.w).toBe(0);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.h).toBe(10);
  });
});

describe('funnel — rendering smoke (call log)', () => {
  it('draws proportional centered rects in ramp colors with ink-colored labels', () => {
    const { el } = mount({ type: 'funnel', data });
    const ctx = ctxOf(el);
    // Plot 576x376, labels reserve a 58px gutter -> 518px available width.
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect' && c.args[3] === 124);
    expect(rects).toHaveLength(3);
    expect(rects.map((r) => r.args[2] as number)).toEqual([518, 259, 129.5]);
    expect(rects.map((r) => r.args[0] as number)).toEqual([12, 141.5, 206.25]);
    // Ramp colors: light scheme, 3 stages -> palette steps 3, 8, 12.
    for (const idx of [3, 8, 12]) {
      expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === sequentialPalette[idx])).toBe(true);
    }
    // Stage label + value painted beside segments in ink colors.
    const texts = paintedText(el);
    for (const s of ['Top', 'Mid', 'Low', '1000', '500', '250']) expect(texts).toContain(s);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#0b0b0b')).toBe(true); // textPrimary
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#52514e')).toBe(true); // textSecondary
  });

  it('dark mode uses the dark legal span of the ramp', () => {
    const { el } = mount({ type: 'funnel', data, theme: 'dark' });
    const ctx = ctxOf(el);
    for (const idx of [10, 5, 0]) {
      expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === sequentialPalette[idx])).toBe(true);
    }
  });
});

describe('funnel — legend policy (hidden always)', () => {
  it('hides the legend even when explicitly requested', () => {
    const { el } = mount({ type: 'funnel', data, legend: true });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
  });
});

describe('funnel — a11y table (stage, value, % of first stage)', () => {
  it('computes the share of the first stage per row', () => {
    const { el } = mount({ type: 'funnel', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((n) => n.textContent);
    expect(head).toEqual(['Stage', 'Value', '% of first stage']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Top', '1000', '100%'],
      ['Mid', '500', '50%'],
      ['Low', '250', '25%'],
    ]);
  });
});

describe('funnel — interaction', () => {
  it('hovering a segment fires pointenter and shows stage + value tooltip', () => {
    const { el, chart } = mount({ type: 'funnel', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    pointerMove(el, 271, 74); // center of the first segment
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'Conversions', dataIndex: 0, x: 'Top', y: 1000 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Top');
    expect(tip.innerHTML).toContain('1000');
  });

  it('narrow segments keep a generous hit target', () => {
    const { el, chart } = mount({
      type: 'funnel',
      data: { series: [{ name: 'S', data: [{ x: 'A', y: 1000 }, { x: 'B', y: 1 }] }] },
    });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    // Second segment is ~0.5px wide; 10px off its center still hits.
    pointerMove(el, 281, 300);
    expect(enters).toHaveLength(1);
    expect(enters[0]!.dataIndex).toBe(1);
  });

  it('arrow keys walk the stages in order and announce them', () => {
    const { el, chart } = mount({ type: 'funnel', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    expect(enters.map((e) => e.dataIndex)).toEqual([0, 1]);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    // ADAPTED (quality audit): this asserted the PIPELINE DEFAULT announcement
    // ("<x>: <y>. <series>, point i of n."), which was the defect for a funnel
    // rather than the requirement. The default reads `x` — null for the
    // `{ label, y }` data shape the contract admits, so a label-only funnel
    // announced the point INDEX ("0: 500") — and it never carries the
    // "% of first stage" conversion that is the reason a funnel exists and that
    // the contract puts in this type's data table. Funnel now supplies its own
    // `announce`; the stage name, value and both conversion figures are asserted.
    expect(region.textContent).toBe('Mid: 500, 50% of the first stage, 50% of the previous stage. Stage 2 of 3.');
    key(el, 'End');
    expect(enters.at(-1)!.dataIndex).toBe(2);
  });
});
