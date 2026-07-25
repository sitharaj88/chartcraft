/**
 * wordcloud (v0.3): deterministic spiral placement with collision avoidance,
 * font size interpolated minFontSize..maxFontSize by weight, optional 90°
 * rotation, categorical slots cycled IN ORDER BY RANK (the one sanctioned
 * place text wears a series color), keyboard walks terms by rank, table =
 * term / weight / rank.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHierarchyChartTypes } from '../src/charts/hierarchy';
import {
  DEFAULT_MAX_FONT_SIZE,
  DEFAULT_MIN_FONT_SIZE,
  FALLBACK_WIDTH_RATIO,
  LINE_HEIGHT_RATIO,
  WORD_GAP,
  layoutWordCloud,
  rankTerms,
  wordFontSize,
  type WordPlacement,
  type WordTerm,
} from '../src/charts/hierarchy/wordcloud';
import { lightTheme } from '../src/theme';
import type { ChartData, DataValue } from '../src/types';
import type { Rect } from '../src/layout';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerHierarchyChartTypes();
afterEach(cleanupDom);

const PLOT: Rect = { x: 0, y: 0, w: 400, h: 300 };
/** Default mounted plot for a 600x400 canvas with 12px padding. */
const MOUNTED_PLOT: Rect = { x: 12, y: 12, w: 576, h: 376 };

const WEIGHTS: [string, number][] = [
  ['alpha', 10],
  ['beta', 8],
  ['gamma', 6],
  ['delta', 4],
  ['epsilon', 2],
  ['zeta', 1],
];

const cloudData = (pairs: [string, number][] = WEIGHTS): ChartData => ({
  series: [{ name: 'Terms', data: pairs.map(([x, y]) => ({ x, y })) as unknown as DataValue[] }],
});

const terms = (pairs: [string, number][] = WEIGHTS): WordTerm[] =>
  pairs.map(([term, weight], pi) => ({ term, weight, pi }));

/** The test canvas stub measures 6px per character at any font size. */
const stubMeasure = (t: string): number => t.length * 6;

const runLayout = (over: Partial<Parameters<typeof layoutWordCloud>[0]> = {}): WordPlacement[] =>
  layoutWordCloud({
    terms: terms(),
    plot: PLOT,
    minFontSize: DEFAULT_MIN_FONT_SIZE,
    maxFontSize: DEFAULT_MAX_FONT_SIZE,
    rotate: false,
    palette: lightTheme.series,
    measure: stubMeasure,
    ...over,
  });

function boxOf(w: WordPlacement) {
  return { x: w.x - w.w / 2, y: w.y - w.h / 2, w: w.w, h: w.h };
}

describe('wordcloud scales & ranking (pure math)', () => {
  it('interpolates font size linearly between minFontSize and maxFontSize', () => {
    expect(wordFontSize(1, 1, 9, 10, 50)).toBe(10);
    expect(wordFontSize(5, 1, 9, 10, 50)).toBe(30); // midpoint
    expect(wordFontSize(9, 1, 9, 10, 50)).toBe(50);
    expect(wordFontSize(7, 1, 9, 10, 50)).toBe(40);
    // Out-of-range weights clamp rather than extrapolate.
    expect(wordFontSize(-4, 1, 9, 10, 50)).toBe(10);
    expect(wordFontSize(99, 1, 9, 10, 50)).toBe(50);
  });

  it('puts every word at maxFontSize when the weight range is degenerate', () => {
    expect(wordFontSize(5, 5, 5, 12, 48)).toBe(48);
    expect(wordFontSize(5, 9, 1, 12, 48)).toBe(48);
    const flat = runLayout({ terms: terms([['a', 3], ['b', 3], ['c', 3]]) });
    expect(flat.map((w) => w.fontSize)).toEqual([48, 48, 48]);
  });

  it('ranks terms by weight descending, ties in data order', () => {
    const ranked = rankTerms(terms([['a', 1], ['b', 5], ['c', 5], ['d', 9]]));
    expect(ranked.map((t) => t.term)).toEqual(['d', 'b', 'c', 'a']);
    expect(ranked.map((t) => t.pi)).toEqual([3, 1, 2, 0]);
  });

  it('assigns font sizes by rank across the whole cloud', () => {
    const words = runLayout();
    expect(words.map((w) => w.term)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
    expect(words[0]!.fontSize).toBe(DEFAULT_MAX_FONT_SIZE); // heaviest
    expect(words[5]!.fontSize).toBe(DEFAULT_MIN_FONT_SIZE); // lightest
    // weight 6 of 1..10 -> 12 + (5/9) * 36 = 32
    expect(words[2]!.fontSize).toBeCloseTo(32, 10);
    // Monotonically non-increasing with rank.
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.fontSize).toBeLessThanOrEqual(words[i - 1]!.fontSize);
    }
  });
});

describe('wordcloud spiral layout (deterministic, collision-free)', () => {
  it('produces byte-identical placements across runs and never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const first = runLayout();
    const second = runLayout();
    expect(second).toEqual(first);
    // Same for the rotated variant.
    expect(runLayout({ rotate: true })).toEqual(runLayout({ rotate: true }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('anchors the heaviest term exactly at the plot center', () => {
    const words = runLayout();
    expect(words[0]!.placed).toBe(true);
    expect(words[0]!.x).toBe(PLOT.x + PLOT.w / 2);
    expect(words[0]!.y).toBe(PLOT.y + PLOT.h / 2);
  });

  it('places every box inside the plot with no overlaps', () => {
    const words = runLayout();
    expect(words.every((w) => w.placed)).toBe(true);
    for (const w of words) {
      const b = boxOf(w);
      expect(b.x).toBeGreaterThanOrEqual(PLOT.x);
      expect(b.y).toBeGreaterThanOrEqual(PLOT.y);
      expect(b.x + b.w).toBeLessThanOrEqual(PLOT.x + PLOT.w);
      expect(b.y + b.h).toBeLessThanOrEqual(PLOT.y + PLOT.h);
    }
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = boxOf(words[i] as WordPlacement);
        const b = boxOf(words[j] as WordPlacement);
        const apart =
          a.x + a.w + WORD_GAP <= b.x ||
          b.x + b.w + WORD_GAP <= a.x ||
          a.y + a.h + WORD_GAP <= b.y ||
          b.y + b.h + WORD_GAP <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('sizes boxes from measured width and the documented height/width fallbacks', () => {
    const words = runLayout();
    // Unrotated: w = measured width, h = fontSize * LINE_HEIGHT_RATIO.
    expect(words[0]!.w).toBe(stubMeasure('alpha'));
    expect(words[0]!.h).toBeCloseTo(DEFAULT_MAX_FONT_SIZE * LINE_HEIGHT_RATIO, 10);
    // No metrics available -> term.length * fontSize * FALLBACK_WIDTH_RATIO.
    const noMetrics = runLayout({ measure: () => Number.NaN });
    expect(noMetrics[0]!.w).toBeCloseTo(5 * DEFAULT_MAX_FONT_SIZE * FALLBACK_WIDTH_RATIO, 10);
    const zeroMetrics = runLayout({ measure: () => 0 });
    expect(zeroMetrics[0]!.w).toBeCloseTo(5 * DEFAULT_MAX_FONT_SIZE * FALLBACK_WIDTH_RATIO, 10);
  });

  it('rotates alternate ranks by 90° only when asked, swapping the box axes', () => {
    const upright = runLayout();
    expect(upright.every((w) => !w.rotated)).toBe(true);
    const rotated = runLayout({ rotate: true });
    expect(rotated.map((w) => w.rotated)).toEqual([false, true, false, true, false, true]);
    const one = rotated[1] as WordPlacement;
    expect(one.w).toBeCloseTo(one.fontSize * LINE_HEIGHT_RATIO, 10);
    expect(one.h).toBe(stubMeasure('beta'));
  });

  it('cycles the categorical slots IN ORDER BY RANK, wrapping after the 8th', () => {
    const nine: [string, number][] = Array.from({ length: 9 }, (_, i) => [`t${i}`, 9 - i]);
    const words = runLayout({ terms: terms(nine) });
    words.forEach((w, rank) => {
      expect(w.fill).toBe(lightTheme.series[rank % 8]);
    });
    expect(words[8]!.fill).toBe(lightTheme.series[0]); // wraps, never a new hue
    // A per-datum color override still wins.
    const overridden = layoutWordCloud({
      terms: [{ term: 'x', weight: 1, pi: 0, color: '#123456' }],
      plot: PLOT,
      minFontSize: 12,
      maxFontSize: 48,
      rotate: false,
      palette: lightTheme.series,
      measure: stubMeasure,
    });
    expect(overridden[0]!.fill).toBe('#123456');
  });

  it('drops words that cannot fit instead of clipping or overlapping them', () => {
    const tight = layoutWordCloud({
      terms: terms([['enormous', 10], ['tiny', 1]]),
      plot: { x: 0, y: 0, w: 60, h: 40 },
      minFontSize: 12,
      maxFontSize: 48,
      rotate: false,
      palette: lightTheme.series,
      measure: () => 500, // wider than the plot at any position
    });
    expect(tight.map((w) => w.placed)).toEqual([false, false]);
    // Unplaced words keep their rank and weight for the a11y table.
    expect(tight[0]).toMatchObject({ term: 'enormous', rank: 0, weight: 10 });
    expect(layoutWordCloud({
      terms: [],
      plot: PLOT,
      minFontSize: 12,
      maxFontSize: 48,
      rotate: false,
      palette: lightTheme.series,
      measure: stubMeasure,
    })).toEqual([]);
  });
});

describe('wordcloud rendering, legend, a11y, interaction', () => {
  it('paints every term as text in its rank slot color, largest first', () => {
    const { el } = mount({ type: 'wordcloud', data: cloudData() });
    const texts = paintedText(el);
    expect(texts).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
    const ctx = ctxOf(el);
    const fills = ctx.__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    // Text IS the mark here, so it legitimately wears the series slots.
    expect(fills).toContain(lightTheme.series[0]);
    expect(fills).toContain(lightTheme.series[1]);
    // Fonts scale with rank: 48px down to 12px.
    const fonts = ctx.__props.filter((p) => p.prop === 'font').map((p) => String(p.value));
    expect(fonts).toContain(`600 48px ${lightTheme.fontFamily}`);
    expect(fonts).toContain(`600 12px ${lightTheme.fontFamily}`);
  });

  it('renders identically on two independent mounts (seeded, reproducible)', () => {
    const positionsOf = (el: HTMLElement) =>
      ctxOf(el)
        .__calls.filter((c) => c.method === 'fillText')
        .map((c) => c.args);
    const first = mount({ type: 'wordcloud', data: cloudData() });
    const second = mount({ type: 'wordcloud', data: cloudData() });
    expect(positionsOf(second.el)).toEqual(positionsOf(first.el));
    expect(positionsOf(first.el).length).toBe(WEIGHTS.length);
  });

  it('honors the wordcloud option block (font bounds, swapped bounds, rotation)', () => {
    const { el } = mount({
      type: 'wordcloud',
      data: cloudData(),
      wordcloud: { minFontSize: 40, maxFontSize: 20, rotate: true },
    });
    const ctx = ctxOf(el);
    const fonts = ctx.__props.filter((p) => p.prop === 'font').map((p) => String(p.value));
    // Swapped bounds are normalized: 20..40, nothing outside.
    for (const f of fonts) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 0);
      expect(px).toBeGreaterThanOrEqual(20);
      expect(px).toBeLessThanOrEqual(40);
    }
    // 90° rotation goes through the renderer's rotate path.
    const rotations = ctx.__calls.filter((c) => c.method === 'rotate').map((c) => c.args[0]);
    expect(rotations.length).toBeGreaterThan(0);
    expect(rotations.every((a) => a === -Math.PI / 2)).toBe(true);
  });

  it('accepts `weight` as the alias of y', () => {
    const { el } = mount({
      type: 'wordcloud',
      data: { series: [{ name: 'Terms', data: [{ x: 'low', weight: 1 }, { x: 'high', weight: 9 }] as unknown as DataValue[] }] },
    });
    // Rank order = weight order, so 'high' paints first.
    expect(paintedText(el)).toEqual(['high', 'low']);
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['high', '9', '1'],
      ['low', '1', '2'],
    ]);
  });

  it('hides the legend by default; an explicit legend lists terms by rank, non-toggleably', () => {
    const auto = mount({ type: 'wordcloud', data: cloudData() });
    expect((auto.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const shown = mount({ type: 'wordcloud', data: cloudData(), legend: true });
    const items = [...shown.el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
    ]);
    expect(items.every((i) => i.disabled)).toBe(true);
    // Swatch colors follow the rank slots.
    expect((items[0]!.querySelector('.chartcraft-legend-swatch') as HTMLElement).style.background).toBeTruthy();
  });

  it('a11y table = term, weight, rank in rank order (and exportData mirrors it)', () => {
    const { el, chart } = mount({ type: 'wordcloud', data: cloudData() });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Term',
      'Weight',
      'Rank',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['alpha', '10', '1'],
      ['beta', '8', '2'],
      ['gamma', '6', '3'],
      ['delta', '4', '4'],
      ['epsilon', '2', '5'],
      ['zeta', '1', '6'],
    ]);
    expect(chart.exportData()).toBe(
      'Term,Weight,Rank\nalpha,10,1\nbeta,8,2\ngamma,6,3\ndelta,4,4\nepsilon,2,5\nzeta,1,6',
    );
  });

  it('keyboard walks terms by rank with weight/rank announcements', () => {
    const { el } = mount({ type: 'wordcloud', data: cloudData() });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('alpha: 10. Rank 1 of 6.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('beta: 8. Rank 2 of 6.');
    key(el, 'End');
    expect(region.textContent).toBe('zeta: 1. Rank 6 of 6.');
    key(el, 'ArrowRight'); // clamped at the last rank
    expect(region.textContent).toBe('zeta: 1. Rank 6 of 6.');
    key(el, 'Home');
    expect(region.textContent).toBe('alpha: 10. Rank 1 of 6.');
  });

  it('hit-tests word boxes and shows a term + weight tooltip', () => {
    const { el, chart } = mount({ type: 'wordcloud', data: cloudData() });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // The heaviest term sits dead center of the plot.
    pointerMove(el, MOUNTED_PLOT.x + MOUNTED_PLOT.w / 2, MOUNTED_PLOT.y + MOUNTED_PLOT.h / 2);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Terms', dataIndex: 0 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('alpha');
    expect(tip.innerHTML).toContain('>10<');
    // The plot corner holds no word.
    pointerMove(el, MOUNTED_PLOT.x + 1, MOUNTED_PLOT.y + 1);
    expect(tip.style.display).toBe('none');
  });
});
