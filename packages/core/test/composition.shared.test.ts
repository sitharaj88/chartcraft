/**
 * Composition family (v0.3) cross-cutting behavior: registration, shared
 * layout helpers, theming, animation / reduced motion, resize, update and the
 * a11y switches — checked across all four types.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompositionChartTypes } from '../src/charts/composition';
import { isChartTypeRegistered, registeredChartTypes } from '../src/charts/registry';
import {
  COMPOSITION_GAP,
  formatShare,
  insetRect,
  linearMap,
  magnitude,
  sumFinite,
} from '../src/charts/composition/shared';
import type { ChartOptions, ChartType } from '../src/types';
import { darkTheme, lightTheme } from '../src/theme';
import { cleanupDom, ctxOf, mount } from './helpers';
import { resetMediaQueries, setMediaQuery } from './setup';

registerCompositionChartTypes();
afterEach(() => {
  cleanupDom();
  resetMediaQueries();
});

const IDS: ChartType[] = ['streamgraph', 'marimekko', 'pyramid', 'calendar'];

const utc = (d: number): Date => new Date(Date.UTC(2024, 0, d));

/** Minimal valid options per type (fresh objects — toggling mutates them). */
function optionsFor(id: ChartType): Pick<ChartOptions, 'type' | 'data'> {
  if (id === 'calendar') {
    return {
      type: id,
      data: { series: [{ name: 'Visits', data: [{ x: utc(1), y: 2 }, { x: utc(3), y: 8 }] }] },
    };
  }
  return {
    type: id,
    data: {
      categories: ['A', 'B'],
      series: [
        { name: 'Alpha', data: [1, 2] },
        { name: 'Beta', data: [3, 1] },
      ],
    },
  };
}

describe('composition registration', () => {
  it('registers exactly the four composition ids, idempotently', () => {
    registerCompositionChartTypes();
    registerCompositionChartTypes();
    for (const id of IDS) expect(isChartTypeRegistered(id)).toBe(true);
    const registered = registeredChartTypes();
    for (const id of IDS) expect(registered.filter((r) => r === id)).toHaveLength(1);
  });

  it('leaves the other v0.3 placeholders alone', () => {
    expect(isChartTypeRegistered('sankey')).toBe(false);
    expect(isChartTypeRegistered('violin')).toBe(false);
  });
});

describe('composition shared helpers (exact)', () => {
  it('insetRect shrinks per side and never collapses', () => {
    expect(insetRect({ x: 10, y: 20, w: 100, h: 50 }, { left: 5, bottom: 10 })).toEqual({
      x: 15,
      y: 20,
      w: 95,
      h: 40,
    });
    expect(insetRect({ x: 0, y: 0, w: 4, h: 4 }, { left: 10, top: 10 })).toEqual({ x: 10, y: 10, w: 1, h: 1 });
  });

  it('linearMap maps a value domain onto a (possibly inverted) pixel range', () => {
    const y = linearMap(0, 10, 100, 0);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(y(10)).toBe(0);
    // A degenerate domain lands on the range center rather than dividing by 0.
    expect(linearMap(3, 3, 0, 80)(3)).toBe(40);
  });

  it('formatShare prints at most one decimal', () => {
    expect(formatShare(0.3)).toBe('30%');
    expect(formatShare(0.125)).toBe('12.5%');
    expect(formatShare(1 / 3)).toBe('33.3%');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(Number.NaN)).toBe('—');
  });

  it('magnitude / sumFinite ignore nulls and non-finite values', () => {
    expect(magnitude(5)).toBe(5);
    expect(magnitude(-5)).toBe(0);
    expect(magnitude(null)).toBe(0);
    expect(magnitude(Number.NaN)).toBe(0);
    expect(sumFinite([1, null, 2, Number.NaN, -1])).toBe(2);
    expect(COMPOSITION_GAP).toBe(2);
  });
});

describe('composition cross-cutting behavior', () => {
  it.each(IDS)('%s themes from the resolved theme (dark)', (id) => {
    const { el } = mount({ ...optionsFor(id), theme: 'dark' });
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills[0]).toBe(darkTheme.surface);
    // Marks/labels come from the dark theme, never the light one.
    expect(fills).not.toContain(lightTheme.surface);
    expect(fills.some((f) => f === darkTheme.series[0] || f === darkTheme.textMuted)).toBe(true);
  });

  it.each(IDS)('%s re-renders on resize and on update', (id) => {
    const { chart } = mount(optionsFor(id));
    const reasons: string[] = [];
    chart.on('render', (e) => reasons.push(e.reason));
    chart.resize();
    expect(reasons).toContain('resize');
    chart.update({ title: 'Composed' });
    expect(reasons).toContain('update');
    chart.setData(optionsFor(id).data);
    expect(reasons.filter((r) => r === 'update')).toHaveLength(2);
  });

  it.each(IDS)('%s honors a11y.table: off and a11y.keyboard: false', (id) => {
    const { el } = mount({ ...optionsFor(id), a11y: { table: 'off', keyboard: false } });
    expect(el.querySelector('.chartcraft-a11y-table table')).toBeNull();
    expect(el.querySelector('canvas')!.hasAttribute('tabindex')).toBe(false);
    // The aria label is still generated.
    expect(el.querySelector('canvas')!.getAttribute('aria-label')).toMatch(new RegExp(id, 'i'));
  });

  it('streamgraph ribbons animate up from the baseline on first paint', () => {
    const { el } = mount({ ...optionsFor('streamgraph'), animation: true });
    // Frame 0: entering points sit at their own baseline (y === y0), so the
    // ribbon has zero thickness. A 2-column band traces M(top0) L(top1)
    // L(bottom1) L(bottom0), so top0 and bottom0 must coincide.
    const moves = ctxOf(el).__calls.filter((c) => c.method === 'moveTo');
    const lines = ctxOf(el).__calls.filter((c) => c.method === 'lineTo');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0]!.args[1]).toBe(lines[2]!.args[1]);
  });

  it('prefers-reduced-motion paints the target frame immediately', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const { el } = mount({ ...optionsFor('streamgraph'), animation: { duration: 300 } });
    const moves = ctxOf(el).__calls.filter((c) => c.method === 'moveTo');
    const lines = ctxOf(el).__calls.filter((c) => c.method === 'lineTo');
    // Target geometry: the ribbon has real thickness on the very first frame.
    expect(moves[0]!.args[1]).not.toBe(lines[2]!.args[1]);
  });

  // A pointer position known to land on a mark for each type.
  const CLICK: Record<string, [number, number]> = {
    streamgraph: [300, 200],
    marimekko: [200, 200],
    pyramid: [200, 100],
    // Only Jan 1..3 are in range, so one week column of 7 rows: row 1 = Jan 1.
    calendar: [300, 100],
  };

  it.each(IDS)('%s emits pointclick through the registry hit test', (id) => {
    const { el, chart } = mount(optionsFor(id));
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    const [x, y] = CLICK[id] as [number, number];
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({
      dataIndex: expect.any(Number),
      seriesName: expect.any(String),
      y: expect.any(Number),
    });
  });
});
