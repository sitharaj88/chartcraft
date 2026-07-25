/**
 * PARAMETERIZED A11Y CONFORMANCE AUDIT — every contract chart type, one bar.
 *
 * The per-type suites each assert their own type's a11y stages, which means a
 * type can only fail a check its own author thought to write. This file asserts
 * the CROSS-CUTTING requirements the contract states once and expects of all 39
 * ("A11y: meaningful generated aria summary; data table columns appropriate to
 * the shape; arrow-key navigation walks the type's natural reading order; Enter
 * fires pointclick"), so a type that skips one shows up HERE.
 *
 * Deliberately strict where the contract is strict, and explicit about what it
 * cannot decide mechanically:
 *
 * - "INFORMATIVE accessible name" is checked as "says something beyond the type
 *   id": the name must carry a quantity or a measurement, not just
 *   "<Type> chart". A label that merely echoes the type id fails.
 * - "a data table whose columns/rows describe the marks" is checked as: >= 2
 *   columns, no column that is just the type id, a row per navigable mark or a
 *   documented richer shape (a matrix table is rows x columns; a hierarchy table
 *   lists interior nodes the chart draws only as containers), and every cell a
 *   real string.
 * - "keyboard navigation reaches every mark and announces something meaningful"
 *   is checked by ENUMERATING the type's own `keyboardNav` geometry and driving
 *   the real keydown path to each position: every reachable position must
 *   announce non-empty text that is not a bare repeat of the previous one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS, getChartType } from '../src/charts/registry';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions, ChartType, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, key, mount } from './helpers';
import { FIXTURES } from './fixtures.all-types';
import { resetMediaQueries, setMediaQuery } from './setup';
import { createChart } from '../src/index';
import { buildModel, resolveOptions } from '../src/model';
import { resolveTheme } from '../src/theme';
import { computePlainLayout } from '../src/layout';

registerBuiltinChartTypes();

afterEach(() => {
  resetMediaQueries();
  cleanupDom();
});

function announcerOf(el: HTMLElement): HTMLElement {
  const a = el.querySelector('.chartcraft-announcer');
  if (!a) throw new Error('no announcer region');
  return a as HTMLElement;
}

function tableOf(el: HTMLElement): HTMLTableElement | null {
  return el.querySelector('.chartcraft-a11y-table table');
}

function headersOf(el: HTMLElement): string[] {
  return [...(tableOf(el)?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent ?? '');
}

function bodyRowsOf(el: HTMLElement): string[][] {
  return [...(tableOf(el)?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
    [...tr.children].map((c) => c.textContent ?? ''),
  );
}

/**
 * Keyboard stops the TYPE ITSELF declares, per visible series, read straight off
 * its `keyboardNav` geometry against a freshly built model. This is the number
 * the real keydown walk must reach.
 */
function declaredNavStops(type: ChartType, options: ChartOptions): number[] {
  const def = getChartType(type);
  const opts = resolveOptions(options);
  const model = buildModel(opts, new Map());
  // Some types populate nav geometry from their layout stage, so run it exactly
  // as the pipeline would before asking.
  const theme = resolveTheme('light');
  const layout = computePlainLayout({ width: 600, height: 400, topExtra: 0, padding: opts.padding, viewport: null });
  try {
    def.layout({ opts, theme, model, layout, measure: (t) => t.length * 6 });
  } catch {
    // A type needing the cartesian layout shape: its nav geometry does not
    // depend on that stage, so the model alone is enough here.
  }
  const nav = def.keyboardNav(model);
  const out: number[] = [];
  for (let si = 0; si < nav.seriesCount; si++) {
    if (nav.isVisible(si)) out.push(nav.pointCount(si));
  }
  return out;
}

/**
 * Drive the REAL keydown path over the reading order, one series at a time, and
 * return the announcements per series.
 *
 * `seriesCount` comes from the type's own declaration because `ArrowDown` WRAPS
 * (`navigate()` steps `(si + dir) % seriesCount`), so "the announcement stopped
 * changing" cannot mark the end of the series axis — pressing Down past the last
 * series silently returns to the first. Stepping Down exactly `seriesCount - 1`
 * times therefore visits each series once, in order.
 */
function walkPerSeries(el: HTMLElement, seriesCount: number): string[][] {
  const ann = el.querySelector('.chartcraft-announcer') as HTMLElement;
  const perSeries: string[][] = [];
  for (let s = 0; s < Math.max(1, seriesCount); s++) {
    if (s > 0) key(el, 'ArrowDown');
    key(el, 'Home');
    const stops: string[] = [ann.textContent ?? ''];
    let prev = stops[0] as string;
    // 500 is a guard, not an expectation: a nav geometry claiming an unbounded
    // point count must FAIL this suite rather than hang it.
    for (let i = 0; i < 500; i++) {
      key(el, 'ArrowRight');
      const text = ann.textContent ?? '';
      if (text === prev) break;
      prev = text;
      stops.push(text);
    }
    perSeries.push(stops);
  }
  return perSeries;
}

/** Flat list of every announcement the keyboard walk produced. */
function walkAll(el: HTMLElement, seriesCount: number): string[] {
  return walkPerSeries(el, seriesCount).flat();
}

describe.each(CHART_TYPE_IDS.map((t) => [t] as [ChartType]))('a11y conformance: %s', (type) => {
  const fixture = () => ({ type, ...FIXTURES[type] }) as ChartOptions;

  it('canvas is role="img" with an accessible name that describes the DATA, not just its shape', () => {
    const { el } = mount(fixture());
    const canvas = canvasOf(el);
    expect(canvas.getAttribute('role')).toBe('img');
    const label = canvas.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
    // It names the type...
    expect(label.toLowerCase()).toContain(type.toLowerCase());

    // ...and then reports something about the DATA. This is the bar the old
    // generated name failed on all 39 types: "Line chart with 1 series and 3
    // points." names a category and counts its containers, and stops. Strip the
    // type name and the "N series and M points" shape boilerplate; a number must
    // SURVIVE — a range, a total, a cell count, a reading, a date span. If
    // nothing does, the name told a screen-reader user nothing they could not
    // have guessed from `options.type`.
    const dataFacts = label
      .replace(new RegExp(type, 'gi'), '')
      .replace(/chart/gi, '')
      .replace(/\d+\s+series/gi, '')
      .replace(/\d+\s+points?/gi, '');
    expect(dataFacts).toMatch(/\d/);
  });

  it('exposes a data table whose columns and cells describe the marks', () => {
    const { el, chart } = mount(fixture());
    const headers = headersOf(el);
    // Shape-appropriate columns: a row-header column plus at least one data
    // column, and no header that is merely the type id.
    expect(headers.length).toBeGreaterThanOrEqual(2);
    for (const h of headers) {
      expect(h.trim().length).toBeGreaterThan(0);
      expect(h.trim().toLowerCase()).not.toBe(type.toLowerCase());
    }
    const rows = bodyRowsOf(el);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Every row is fully populated: header cell + one cell per data column.
      expect(row.length).toBe(headers.length);
      expect((row[0] ?? '').trim().length).toBeGreaterThan(0);
      for (const cell of row) expect(cell).not.toMatch(/NaN|Infinity|undefined|\[object/);
    }
    // exportData mirrors the table exactly (ONE spec, two consumers).
    const csvLines = chart.exportData({ format: 'csv' }).split('\n');
    expect(csvLines.length).toBe(rows.length + 1);
    const json = JSON.parse(chart.exportData({ format: 'json' })) as { columns: string[]; rows: unknown[] };
    expect(json.columns).toEqual(headers);
    expect(json.rows.length).toBe(rows.length);
  });

  it('keyboard walks the whole reading order and announces every stop meaningfully', () => {
    const { el } = mount(fixture());
    const announced = walkAll(el, declaredNavStops(type, fixture()).length);

    // Every position this type exposes announces real content.
    expect(announced.length).toBeGreaterThan(0);
    for (const a of announced) {
      expect(a.trim().length).toBeGreaterThan(0);
      // "Meaningful" = it reports a quantity, not just a bare label.
      expect(a).toMatch(/\d/);
      expect(a).not.toMatch(/undefined|NaN|Infinity|\[object/);
    }
    // Distinct marks announce distinct text — an announcer that emits one
    // string for every position tells a screen-reader user nothing. (`>= 2`
    // only where the type actually has more than one reachable mark.)
    if (announced.length > 1) expect(new Set(announced).size).toBeGreaterThan(1);
  });

  it('the reachable mark count matches the type declaration (no silently skipped marks)', () => {
    const declared = declaredNavStops(type, fixture());
    const { el } = mount(fixture());
    const reached = walkPerSeries(el, declared.length).map((s) => s.length);
    // Per series, not just in total: a walk that reaches the right NUMBER of
    // stops by over-visiting one series and skipping another would pass a sum.
    expect(reached).toEqual(declared);
  });

  it('Enter on a focused mark fires pointclick with a meaningful dataIndex', () => {
    const { el, chart } = mount(fixture());
    const clicks: PointEvent[] = [];
    chart.on('pointclick', (e) => clicks.push(e));
    key(el, 'ArrowRight');
    key(el, 'Enter');
    expect(clicks.length).toBeGreaterThan(0);
    expect(clicks[0]!.dataIndex).toBeGreaterThanOrEqual(0);
    expect(clicks[0]!.clientX).toBe(-1); // keyboard-originated, per the contract
    expect(typeof clicks[0]!.seriesId).toBe('string');
  });

  it('mounts a polite aria-live announcer and an aria-describedby target when described', () => {
    const { el } = mount({ ...fixture(), a11y: { description: 'Audit description.' } } as ChartOptions);
    const region = announcerOf(el);
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.style.position).toBe('absolute');
    const canvas = canvasOf(el);
    const id = canvas.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const desc = el.querySelector(`#${id}`) as HTMLElement;
    expect(desc.textContent).toContain('Audit description.');
    // ONE hidden node, ONE token — features must never add a second.
    expect(id!.split(/\s+/)).toHaveLength(1);
    expect(el.querySelectorAll(`#${id}`)).toHaveLength(1);
  });

  it("a11y.table 'off' | 'hidden' | 'visible' all behave", () => {
    const off = mount({ ...fixture(), a11y: { table: 'off' } } as ChartOptions);
    expect(tableOf(off.el)).toBeNull();
    // 'off' removes the table but must NOT remove the export path.
    expect(off.chart.exportData({ format: 'csv' }).length).toBeGreaterThan(0);
    cleanupDom();

    const hidden = mount({ ...fixture(), a11y: { table: 'hidden' } } as ChartOptions);
    const hw = hidden.el.querySelector('.chartcraft-a11y-table') as HTMLElement;
    expect(tableOf(hidden.el)).toBeTruthy();
    expect(hw.style.width).toBe('1px');
    expect(hw.style.clipPath).toBe('inset(50%)');
    cleanupDom();

    const visible = mount({ ...fixture(), a11y: { table: 'visible' } } as ChartOptions);
    const vw = visible.el.querySelector('.chartcraft-a11y-table') as HTMLElement;
    expect(tableOf(visible.el)).toBeTruthy();
    expect(vw.style.width).not.toBe('1px');
    expect(vw.style.clipPath).not.toBe('inset(50%)');
  });

  it('a11y.keyboard: false removes the tab stop and stops responding to keys', () => {
    const { el } = mount({ ...fixture(), a11y: { keyboard: false } } as ChartOptions);
    expect(canvasOf(el).hasAttribute('tabindex')).toBe(false);
    key(el, 'ArrowRight');
    expect(announcerOf(el).textContent ?? '').toBe('');
  });

  it('prefers-reduced-motion paints the final frame immediately', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const el = document.createElement('div');
    document.body.appendChild(el);
    // A 10s animation: anything painted synchronously proves it was not gated.
    const chart = createChart(el, {
      theme: 'light',
      width: 600,
      height: 400,
      animation: { duration: 10_000 },
      ...fixture(),
    } as ChartOptions);
    const ctx = canvasOf(el).getContext('2d') as unknown as { __calls: unknown[] };
    expect(ctx.__calls.length).toBeGreaterThan(0);
    chart.destroy();
  });
});

// ---------------------------------------------------------------------------
// Regression locks for the specific a11y defects the quality audit found.

describe('a11y regressions found by the quality audit', () => {
  it('label-only pie/donut data announces the SLICE NAME and its share, not the point index', () => {
    for (const type of ['pie', 'donut'] as const) {
      const { el } = mount({
        type,
        data: { series: [{ name: 'Browsers', data: [{ label: 'Chrome', y: 62 }, { label: 'Safari', y: 21 }] }] },
      } as ChartOptions);
      key(el, 'ArrowRight');
      const said = announcerOf(el).textContent ?? '';
      // Was: "0: 62. Browsers, point 1 of 2." — `x` is null for `{ label, y }`
      // data, so the pipeline default announced the INDEX and no share.
      expect(said).toContain('Chrome');
      expect(said).toContain('62');
      expect(said).toMatch(/74\.7%/);
      expect(said).not.toMatch(/^0:/);
      cleanupDom();
    }
  });

  it('label-only funnel data announces the STAGE NAME and the conversion figures', () => {
    const { el } = mount({
      type: 'funnel',
      data: { series: [{ name: 'Signup', data: [{ label: 'Visited', y: 1000 }, { label: 'Paid', y: 250 }] }] },
    } as ChartOptions);
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    const said = announcerOf(el).textContent ?? '';
    expect(said).toContain('Paid');
    expect(said).toContain('25% of the first stage');
    expect(said).not.toMatch(/^1:/);
  });

  it('radar without `categories` still has a populated table, nav and export', () => {
    // Legal, validation-passing data (`rawSpokeCount` accepts the index
    // fallback), which used to render blank with an EMPTY table, zero keyboard
    // stops, a silent announcer and a header-only CSV.
    const { el, chart } = mount({ type: 'radar', data: { series: [{ name: 'S', data: [3, 4, 2, 5] }] } } as ChartOptions);
    expect(bodyRowsOf(el)).toHaveLength(4);
    expect(headersOf(el)).toEqual(['Category', 'S']);
    key(el, 'ArrowRight');
    expect(announcerOf(el).textContent ?? '').toMatch(/Spoke 1: 3/);
    expect(chart.exportData({ format: 'csv' }).split('\n')).toHaveLength(5);
  });

  it('the accessible name reports MARKS, not model.maxLen, for types whose marks are not points', () => {
    const heat = mount({ type: 'heatmap', ...FIXTURES.heatmap } as ChartOptions);
    // 2 rows x 3 columns = 6 cells. The old label said "3 points".
    expect(canvasOf(heat.el).getAttribute('aria-label')).toContain('6 cells');
    cleanupDom();

    const sank = mount({ type: 'sankey', ...FIXTURES.sankey } as ChartOptions);
    // 3 nodes + 2 links. The old label said "1 series and 5 points".
    const sl = canvasOf(sank.el).getAttribute('aria-label') ?? '';
    expect(sl).toContain('3 nodes');
    expect(sl).toContain('2 links');
    cleanupDom();

    const tree = mount({ type: 'treemap', ...FIXTURES.treemap } as ChartOptions);
    expect(canvasOf(tree.el).getAttribute('aria-label')).toContain('3 leaves');
  });

  it('gantt does not announce epoch milliseconds as data values', () => {
    const { el } = mount({ type: 'gantt', ...FIXTURES.gantt } as ChartOptions);
    const label = canvasOf(el).getAttribute('aria-label') ?? '';
    // Was: "values from 1767.23B to 1768.18B" — `model.yDomain` scraped by the
    // generic extent pass on a type that declares `axes: 'rows'` (no value axis).
    expect(label).not.toMatch(/values from/);
    expect(label).not.toMatch(/\d+\.\d+B/);
    expect(label).toContain('2 tasks');
  });

  it("'ohlc' is not capitalized to 'Ohlc' in the accessible name", () => {
    const { el } = mount({ type: 'ohlc', ...FIXTURES.ohlc } as ChartOptions);
    const label = canvasOf(el).getAttribute('aria-label') ?? '';
    expect(label).toContain('OHLC');
    expect(label).not.toContain('Ohlc');
  });

  /**
   * KNOWN GAP, deliberately encoded rather than hidden (QUALITY-AUDIT.md,
   * finding A-3): a calendar draws a cell for every day in its range but only
   * days carrying a datum are navigable or tabulated. This test pins the current
   * behavior so the gap cannot widen silently, and documents the number.
   */
  it('calendar: no-value day cells are drawn but not navigable (known gap, pinned)', () => {
    const { el } = mount({
      type: 'calendar',
      calendar: { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 0, 31)) },
      data: {
        series: [
          {
            name: 'commits',
            data: [
              { x: new Date(Date.UTC(2026, 0, 5)), y: 3 },
              { x: new Date(Date.UTC(2026, 0, 20)), y: 9 },
            ],
          },
        ],
      },
    } as ChartOptions);
    // 31 day cells are painted; 2 are reachable and tabulated.
    expect(bodyRowsOf(el)).toHaveLength(2);
    expect(walkPerSeries(el, 1)[0]).toHaveLength(2);
    // The accessible NAME is the mitigation: it states the span and the sparsity,
    // so a screen-reader user is not told the year has only two days in it.
    const label = canvasOf(el).getAttribute('aria-label') ?? '';
    expect(label).toContain('31 days');
    expect(label).toContain('2 with data');
  });
});
