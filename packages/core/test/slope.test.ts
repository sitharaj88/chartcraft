/**
 * slope (v0.3): straight stage-to-stage segments (never smoothed), >= 8px
 * endpoint dots, the direct-label fit rule and its legend fallback, a11y table
 * (series x stage), tooltip and keyboard navigation.
 *
 * Layout arithmetic used by the mounted assertions (600x400, no title,
 * categories '2019'/'2022'):
 *   value ticks 4..10 (widest '10' = 12px) -> leftW = 26 -> plot.x = 38, plot.w = 550
 *   value range [366, 12] over [4, 10]  ->  y(v) = 366 - 59 * (v - 4)
 *   band padding 0.6 / 0.3, n = 2 -> step = 275, centers 175.5 and 450.5
 *   label gutters: leftX = 167.5 (right-aligned), rightX = 458.5 (left-aligned)
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerIntervalChartTypes } from '../src/charts/interval';
import { SLOPE_DOT_RADIUS, SLOPE_LABEL_GAP, planSlopeLabels, slopeLinePath } from '../src/charts/interval';
import { cleanupDom, ctxOf, key, mount, paintedText } from './helpers';

registerIntervalChartTypes();

afterEach(cleanupDom);

const data: ChartData = {
  categories: ['2019', '2022'],
  series: [
    { name: 'Alpha', data: [10, 4] },
    { name: 'Beta', data: [4, 10] },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function dots(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc' && c.args[2] === SLOPE_DOT_RADIUS)
    .map((c) => [c.args[0] as number, c.args[1] as number]);
}

function segments(el: HTMLElement): number[][] {
  const calls = ctxOf(el).__calls;
  const out: number[][] = [];
  for (let i = 0; i < calls.length - 1; i++) {
    const a = calls[i]!;
    const b = calls[i + 1]!;
    if (a.method === 'moveTo' && b.method === 'lineTo') {
      out.push([a.args[0] as number, a.args[1] as number, b.args[0] as number, b.args[1] as number]);
    }
  }
  return out;
}

/** fillText calls as [text, x, y]. */
function texts(el: HTMLElement): [string, number, number][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillText')
    .map((c) => [String(c.args[0]), c.args[1] as number, c.args[2] as number]);
}

const entry = (name: string, width: number, leftY: number | null, rightY: number | null, si = 0) => ({
  si,
  name,
  width,
  leftY,
  rightY,
});

describe('slope — segments and label planning (pure)', () => {
  it('slopeLinePath is straight-only and splits at gaps', () => {
    expect(
      slopeLinePath([
        { x: 0, y: 100, y0: 0 },
        { x: 50, y: 20, y0: 0 },
        null,
        { x: 150, y: 60, y0: 0 },
        { x: 200, y: 10, y0: 0 },
      ]),
    ).toEqual([
      ['M', 0, 100],
      ['L', 50, 20],
      ['M', 150, 60],
      ['L', 200, 10],
    ]);
  });

  it('planSlopeLabels places right-aligned left labels and left-aligned right labels', () => {
    const plan = planSlopeLabels({
      entries: [entry('Alpha', 30, 12, 366, 0), entry('Beta', 24, 366, 12, 1)],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    });
    expect(plan.fit).toBe(true);
    expect(plan.labels).toEqual([
      { si: 0, text: 'Alpha', x: 167.5, y: 12, align: 'right' },
      { si: 0, text: 'Alpha', x: 458.5, y: 366, align: 'left' },
      { si: 1, text: 'Beta', x: 167.5, y: 366, align: 'right' },
      { si: 1, text: 'Beta', x: 458.5, y: 12, align: 'left' },
    ]);
    expect(SLOPE_LABEL_GAP).toBe(8);
  });

  it('a label wider than the gutter drops EVERY label (all or nothing)', () => {
    const plan = planSlopeLabels({
      entries: [entry('Alpha', 30, 12, 366, 0), entry('A very long series name', 138, 366, 12, 1)],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    });
    // left gutter = 167.5 - 138 = 29.5 < plotLeft 38
    expect(plan).toEqual({ fit: false, labels: [] });
  });

  it('labels closer than one line height at either end collide and are dropped', () => {
    const near = planSlopeLabels({
      entries: [entry('A', 6, 100, 12, 0), entry('B', 6, 110, 366, 1)],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    });
    expect(near.fit).toBe(false);
    const clear = planSlopeLabels({
      entries: [entry('A', 6, 100, 12, 0), entry('B', 6, 114, 366, 1)],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    });
    expect(clear.fit).toBe(true);
  });

  it('a series with no endpoints contributes no label; no entries never fits', () => {
    const plan = planSlopeLabels({
      entries: [entry('A', 6, 100, null, 0), entry('Gone', 24, null, null, 1)],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    });
    expect(plan.fit).toBe(true);
    expect(plan.labels).toEqual([{ si: 0, text: 'A', x: 167.5, y: 100, align: 'right' }]);
    expect(planSlopeLabels({
      entries: [],
      plotLeft: 38,
      plotRight: 588,
      firstX: 175.5,
      lastX: 450.5,
      lineHeight: 14,
    })).toEqual({ fit: false, labels: [] });
  });
});

describe('slope — rendering', () => {
  it('draws one straight segment per series between the stage columns', () => {
    const { el } = mount({ type: 'slope', data });
    expect(segments(el)).toContainEqual([175.5, 12, 450.5, 366]); // Alpha 10 -> 4
    expect(segments(el)).toContainEqual([175.5, 366, 450.5, 12]); // Beta 4 -> 10
  });

  it('never smooths — a per-series curve is ignored, rank changes read true', () => {
    const { el } = mount({
      type: 'slope',
      data: {
        categories: ['2019', '2022'],
        series: [
          { name: 'Alpha', curve: 'monotone', data: [10, 4] },
          { name: 'Beta', curve: 'monotone', data: [4, 10] },
        ],
      },
    });
    expect(ctxOf(el).__calls.some((c) => c.method === 'bezierCurveTo')).toBe(false);
    expect(segments(el)).toContainEqual([175.5, 12, 450.5, 366]);
  });

  it('endpoint dots are >= 8px at every stage', () => {
    const { el } = mount({ type: 'slope', data });
    expect(SLOPE_DOT_RADIUS * 2).toBe(8);
    expect(dots(el)).toEqual([
      [175.5, 12],
      [450.5, 366],
      [175.5, 366],
      [450.5, 12],
    ]);
  });

  it('marks wear series identity colors', () => {
    const { el } = mount({ type: 'slope', data });
    const strokes = ctxOf(el).__props.filter((p) => p.prop === 'strokeStyle').map((p) => p.value);
    expect(strokes).toContain(lightTheme.series[0]);
    expect(strokes).toContain(lightTheme.series[1]);
  });

  it('handles a single stage without segments (dots only, no crash)', () => {
    const { el } = mount({
      type: 'slope',
      data: { categories: ['2019'], series: [{ name: 'Alpha', data: [10] }] },
    });
    expect(dots(el)).toHaveLength(1);
  });
});

describe('slope — direct labels vs the legend', () => {
  it('labels both ends in ink colors and hides the legend when they fit', () => {
    const { el } = mount({ type: 'slope', data });
    expect(texts(el)).toContainEqual(['Alpha', 167.5, 12]);
    expect(texts(el)).toContainEqual(['Alpha', 458.5, 366]);
    expect(texts(el)).toContainEqual(['Beta', 167.5, 366]);
    expect(texts(el)).toContainEqual(['Beta', 458.5, 12]);
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    // Ink, never the mark color.
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(lightTheme.textPrimary);
  });

  it('drops the labels and shows the legend when a name does not fit the gutter', () => {
    const { el } = mount({
      type: 'slope',
      data: {
        categories: ['2019', '2022'],
        series: [
          { name: 'Alpha Region Northwest Division', data: [10, 4] },
          { name: 'Beta', data: [4, 10] },
        ],
      },
    });
    expect(paintedText(el)).not.toContain('Alpha Region Northwest Division');
    const legend = el.querySelector('.chartcraft-legend') as HTMLElement;
    expect(legend.style.display).not.toBe('none');
    expect([...legend.querySelectorAll('.chartcraft-legend-item')].map((i) => i.textContent)).toEqual([
      'Alpha Region Northwest Division',
      'Beta',
    ]);
  });

  it('drops the labels and shows the legend when two labels collide vertically', () => {
    const { el } = mount({
      type: 'slope',
      data: {
        categories: ['2019', '2022'],
        series: [
          { name: 'Alpha', data: [10, 4] },
          { name: 'Beta', data: [9.9, 4.1] },
        ],
      },
    });
    // y(10) = 12 and y(9.9) = 17.9 are 5.9px apart, under one 14px line.
    expect(paintedText(el)).not.toContain('Alpha');
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
  });

  it('re-decides on resize: a narrow plot loses the labels and gains the legend', () => {
    const { el, chart } = mount({ type: 'slope', data });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    // plot.w = 70 -> step = 35, first column center 55.5, gutter 9.5px: no fit.
    chart.update({ width: 120 });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    chart.update({ width: 600 });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('an explicit legend setting always wins over the auto rule', () => {
    const forced = mount({ type: 'slope', data, legend: true });
    expect((forced.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    expect(texts(forced.el)).toContainEqual(['Alpha', 167.5, 12]);
    const off = mount({
      type: 'slope',
      legend: false,
      data: {
        categories: ['2019', '2022'],
        series: [
          { name: 'Alpha Region Northwest Division', data: [10, 4] },
          { name: 'Beta', data: [4, 10] },
        ],
      },
    });
    expect((off.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});

describe('slope — a11y, tooltip, keyboard', () => {
  it('a11y table is series rows x stage columns', () => {
    const { el, chart } = mount({ type: 'slope', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Series', '2019', '2022']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Alpha', '10', '4'],
      ['Beta', '4', '10'],
    ]);
    expect(chart.exportData()).toBe('Series,2019,2022\nAlpha,10,4\nBeta,4,10');
  });

  it('tooltip carries the stage, the value and the change since the previous stage', () => {
    const { el } = mount({ type: 'slope', data });
    key(el, 'ArrowRight');
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('2019');
    expect(tip.innerHTML).toContain('10');
    key(el, 'ArrowRight');
    expect(tip.innerHTML).toContain('2022');
    expect(tip.innerHTML).toContain('4 (-6)');
  });

  it('keyboard walks stages with left/right and series with up/down', () => {
    const { el, chart } = mount({ type: 'slope', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'Alpha', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('2019: 10. Alpha, point 1 of 2.');
    key(el, 'ArrowDown');
    expect(region.textContent).toBe('2019: 4. Beta, point 1 of 2.');
    key(el, 'End');
    expect(region.textContent).toBe('2022: 10. Beta, point 2 of 2.');
  });

  it('hit-testing snaps to the nearest stage even between the columns', () => {
    const { el, chart } = mount({ type: 'slope', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 440, clientY: 200, bubbles: true }));
    expect(enters[0]).toMatchObject({ dataIndex: 1 });
  });
});
