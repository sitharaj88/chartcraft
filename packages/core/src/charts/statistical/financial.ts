/**
 * Financial chart engine shared by `candlestick` and `ohlc` (v0.2).
 *
 * Data: `[x, o, h, l, c]` tuples or `{x, o, h, l, c}` objects on a time
 * (or linear) x axis. Marks are colored `theme.up` / `theme.down` by
 * comparing close vs open. Candlestick: body o→c filled, wick h→l at 1px.
 * OHLC: 1px h–l bar with open/close ticks left/right.
 *
 * Per the contract these marks are NEVER animated (no sweeps): all geometry
 * lives in `TypeGeom.extra` (redrawn at target immediately) and the
 * animation is force-disabled in resolveOptions, so candles appear
 * instantly regardless of reduced-motion state.
 */
import type { ChartData, ChartType, DataPoint, TooltipPoint, Theme } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import { a11yRowBudget } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { LinearScale } from '../../scales/linear';
import { clamp, formatTemporal, formatValue } from '../../util';
import { HIT_RADIUS, nearestByX } from '../../interaction/hittest';

export const CANDLE_MIN_WIDTH = 3;
export const CANDLE_MAX_WIDTH = 48;
export const WICK_WIDTH = 1;
/** Outline width of a HOLLOW (rising) candle body. */
export const CANDLE_BODY_STROKE = 1;

/**
 * The rise/fall convention, stated once and used by both the renderer and the
 * accessible description so the drawn chart and the announced one cannot drift.
 *
 * `theme.up` and `theme.down` separate at only ΔE 4.1 under deuteranopia — below
 * even the 6-8 floor band that is legal *with* a secondary encoding — and on a
 * candlestick the direction of the candle IS the chart. So direction is carried
 * by FILL as well as hue: a rising body is hollow (outlined, surface-filled), a
 * falling body is solid. That is the convention professional trading platforms
 * already use, so it costs a reader nothing to learn, and it survives
 * deuteranopia, greyscale print and forced-colors mode, where `up` and `down`
 * collapse to the same system color outright.
 *
 * OHLC bars have no body to fill, and do not need one: an OHLC mark already
 * encodes direction geometrically — the close tick sits ABOVE the open tick on a
 * rising bar and below it on a falling one — which is the same redundancy a
 * waterfall gets from whether its bar rises or falls.
 */
export const CANDLE_FILL_CONVENTION =
  'Rising marks (close at or above open) are drawn hollow: outlined, with the chart surface showing ' +
  'through. Falling marks are solid bodies. Direction is never carried by color alone.';

export const OHLC_SHAPE_CONVENTION =
  'On a rising mark the close tick (right) sits above the open tick (left), and below it on a ' +
  'falling mark. Direction is never carried by color alone.';

export interface CandleGeom {
  si: number;
  pi: number;
  x: number;
  w: number;
  openPx: number;
  closePx: number;
  highPx: number;
  lowPx: number;
  /** close >= open */
  up: boolean;
}

export interface FinancialExtra {
  candles: CandleGeom[];
  w: number;
}

/** Rise/fall color: compare close vs open. */
export function candleColor(o: number, c: number, theme: Theme): string {
  return c >= o ? theme.up : theme.down;
}

/**
 * Mark slot width from the pixel positions of the candles: 0.7× the
 * smallest gap between adjacent x positions, clamped to [3, 48] px (and to
 * the plot width). A lone candle gets the max width.
 */
export function computeSlotWidth(xPx: readonly number[], plotW: number): number {
  const uniq = [...new Set(xPx)].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < uniq.length; i++) minGap = Math.min(minGap, (uniq[i] as number) - (uniq[i - 1] as number));
  const w = Number.isFinite(minGap) ? minGap * 0.7 : plotW * 0.5;
  const hi = Math.max(CANDLE_MIN_WIDTH, Math.min(CANDLE_MAX_WIDTH, plotW));
  return clamp(w, CANDLE_MIN_WIDTH, hi);
}

/** Low/high extent over all visible series' raw OHLC entries. */
export function ohlcExtent(data: ChartData): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of data.series) {
    if (s.visible === false) continue;
    for (const d of dataValuesOf(s.data)) {
      let h: number | undefined;
      let l: number | undefined;
      if (Array.isArray(d) && d.length >= 5) {
        h = typeof d[2] === 'number' ? d[2] : undefined;
        l = typeof d[3] === 'number' ? (d[3] as number) : undefined;
      } else if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
        const p = d as DataPoint;
        if (typeof p.h === 'number') h = p.h;
        if (typeof p.l === 'number') l = p.l;
      }
      if (typeof h === 'number' && Number.isFinite(h) && h > hi) hi = h;
      if (typeof l === 'number' && Number.isFinite(l) && l < lo) lo = l;
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/**
 * Value domain covering every raw high/low, `nice()`d; null when no entry is a
 * usable OHLC shape. Pure, so it is unit-testable without mounting a chart.
 */
export function ohlcValueDomain(data: ChartData): [number, number] | null {
  const ext = ohlcExtent(data);
  if (!ext) return null;
  let [lo, hi] = ext;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const nice = new LinearScale([lo, hi]).nice(5).domain();
  return [nice[0], nice[1]];
}

/** True when a raw datum carries a full open/high/low/close (either encoding). */
export function isOhlcEntry(d: unknown): boolean {
  if (Array.isArray(d)) {
    return d.length >= 5 && [1, 2, 3, 4].every((i) => typeof d[i] === 'number');
  }
  if (d === null || typeof d !== 'object') return false;
  const p = d as DataPoint;
  return (
    typeof p.o === 'number' && typeof p.h === 'number' && typeof p.l === 'number' && typeof p.c === 'number'
  );
}

/** How a datum reads in an error message, without dumping the whole payload. */
function describeEntry(d: unknown): string {
  if (typeof d === 'number') return `a bare number (${d})`;
  if (Array.isArray(d)) return `a ${d.length}-element tuple`;
  if (d !== null && typeof d === 'object') {
    const keys = Object.keys(d as object).slice(0, 6).join(', ');
    return `an object { ${keys} }`;
  }
  return `a ${typeof d}`;
}

/**
 * Wrong-shape data is an ERROR, not an empty chart (quality audit E-9).
 *
 * These two types used to draw nothing, tabulate nothing and say nothing when
 * handed a value list — while `gantt` and `sankey` throw a diagnostic for the
 * same class of mistake. A blank chart with no error is the worst failure mode
 * available: it reads as "no data" and sends the developer looking in the wrong
 * place entirely.
 *
 * The bar is "data that cannot be drawn at all": a series carrying values, none
 * of which is an OHLC entry. Empty series, empty data and all-null data are NOT
 * errors — no data is not wrong data — and a payload with SOME valid entries
 * still renders, exactly as before.
 */
function assertOhlcShape(id: string, data: ChartData): void {
  let sawValue = false;
  let firstBad: { series: string; index: number; value: unknown } | null = null;
  for (const s of data.series ?? []) {
    const values = dataValuesOf(s.data);
    for (let i = 0; i < values.length; i++) {
      const d = values[i];
      if (d === null || d === undefined) continue;
      if (isOhlcEntry(d)) return; // at least one drawable mark: not this error
      sawValue = true;
      if (!firstBad) firstBad = { series: s.name, index: i, value: d };
    }
  }
  if (!sawValue || !firstBad) return;
  throw new Error(
    `@chartcraft/core: ${id} data must be OHLC entries — [x, open, high, low, close] tuples or ` +
      `{ x, o, h, l, c } objects. Series '${firstBad.series}' entry ${firstBad.index} is ` +
      `${describeEntry(firstBad.value)}, and no entry in this chart carries all four of ` +
      `open/high/low/close.`,
  );
}

export function makeFinancialDefinition(id: 'candlestick' | 'ohlc'): ChartTypeDefinition {
  return {
    id: id as ChartType,
    // v0.3.2 (E-5): the x of a financial series is INHERENTLY temporal, so the
    // type declares it rather than leaving `inferXType` to guess. A bare number
    // is then epoch milliseconds by declaration — which is what makes the tick
    // labels, the tooltip header, the table's `Time` column and the keyboard
    // announcement agree instead of announcing `1767.23B`.
    needs: { cartesianAxes: true, xScale: 'time' },

    resolveOptions(resolved) {
      assertOhlcShape(id, resolved.data);
      // Contract: candlestick/ohlc are never animated — marks appear instantly.
      resolved.animation = { ...resolved.animation, enabled: false };
    },

    /**
     * The value axis must span every high and low, which live in raw OHLC
     * entries the generic value extent cannot read (`y` is only the close).
     * Pipeline stage — the caller's `yAxis` stays the caller's.
     */
    extendValueDomain(_model, opts) {
      return ohlcValueDomain(opts.data);
    },

    layout(ctx): TypeGeom {
      const m = ctx.model;
      const L = ctx.layout;
      const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
      const ys = L.yScale as ContinuousScale | null;
      const xsc = L.xScale;
      if (!ys || !xsc) return empty;

      const xOf = (xv: number | null, pi: number): number | null => {
        if (xsc instanceof BandScale) return xsc.center(bandIndexFor(m, xv, pi));
        if (xv === null) return null;
        return (xsc as ContinuousScale).scale(xv);
      };

      const xs: number[] = [];
      m.series.forEach((s) => {
        if (!s.visible) return;
        s.points.forEach((p, pi) => {
          if (p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return;
          const x = xOf(p.xv, pi);
          if (x !== null) xs.push(x);
        });
      });
      const w = computeSlotWidth(xs, L.plot.w);

      const candles: CandleGeom[] = [];
      const pos: (PointPos | null)[][] = m.series.map((s, si) => {
        if (!s.visible) return [];
        return s.points.map((p, pi): PointPos | null => {
          if (p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return null;
          const x = xOf(p.xv, pi);
          if (x === null) return null;
          const geomC: CandleGeom = {
            si,
            pi,
            x,
            w,
            openPx: ys.scale(p.o),
            closePx: ys.scale(p.c),
            highPx: ys.scale(p.h),
            lowPx: ys.scale(p.l),
            up: p.c >= p.o,
          };
          candles.push(geomC);
          return { x, y: geomC.closePx, y0: L.baselinePx };
        });
      });
      const extra: FinancialExtra = { candles, w };
      return { pos, slices: null, bars: null, extra };
    },

    render(ctx: RenderContext): void {
      const { r, theme, layout: L, geom, hover } = ctx;
      const extra = geom.extra as FinancialExtra | undefined;
      if (!extra) return;
      r.clipRect(L.plot.x - extra.w, L.plot.y - 2, L.plot.w + 2 * extra.w, L.plot.h + 4, () => {
        for (const c of extra.candles) {
          const color = c.up ? theme.up : theme.down;
          const hovered = hover !== null && hover.si === c.si && hover.pi === c.pi;
          const alpha = hover && !hovered ? 0.55 : 1;
          if (id === 'candlestick') {
            // Wick h→l at 1px; body o→c HOLLOW when rising, solid when falling
            // (see CANDLE_FILL_CONVENTION — colour is not the only channel).
            r.line(c.x, c.highPx, c.x, c.lowPx, { color, width: WICK_WIDTH }, alpha);
            const top = Math.min(c.openPx, c.closePx);
            const h = Math.max(1, Math.abs(c.openPx - c.closePx));
            r.rect(
              c.x - c.w / 2,
              top,
              c.w,
              h,
              c.up
                ? { fill: theme.surface, stroke: { color, width: CANDLE_BODY_STROKE }, alpha }
                : { fill: color, alpha },
            );
          } else {
            // OHLC: h–l bar with open tick left, close tick right.
            r.line(c.x, c.highPx, c.x, c.lowPx, { color, width: WICK_WIDTH }, alpha);
            r.line(c.x - c.w / 2, c.openPx, c.x, c.openPx, { color, width: WICK_WIDTH }, alpha);
            r.line(c.x, c.closePx, c.x + c.w / 2, c.closePx, { color, width: WICK_WIDTH }, alpha);
          }
        }
      });
    },

    hitTest(ctx, px, py): HoverState | null {
      const extra = ctx.geom.extra as FinancialExtra | undefined;
      const L = ctx.layout;
      if (!extra) return null;
      if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
      const masked = ctx.model.series.map((s, si) => (s.visible ? (ctx.geom.pos[si] ?? []) : []));
      const hit = nearestByX(masked, px, Math.max(HIT_RADIUS, extra.w));
      return hit ? { si: hit.si, pi: hit.pi } : null;
    },

    legendItems(ctx): LegendItem[] {
      return ctx.model.series.map((s) => ({
        id: s.id,
        name: s.name,
        color: seriesColor(s, ctx.theme),
        visible: s.visible,
        toggleable: true,
      }));
    },

    /**
     * v0.3.2 (E-8): honours `limit` — a financial series is one row per bar and
     * five formatted numbers per row, which is exactly the per-datum cost the
     * eager build was paying for on mount. `total` keeps the count true.
     */
    a11yTable(ctx, tableOpts): A11yTableSpec {
      const m = ctx.model;
      const multi = m.series.length > 1;
      const span = m.xDomain ? Math.abs(m.xDomain[1] - m.xDomain[0]) : 0;
      const rows: A11yTableSpec['rows'] = [];
      const budget = a11yRowBudget(tableOpts);
      let total = 0;
      m.series.forEach((s) => {
        s.points.forEach((p) => {
          if (p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return;
          total += 1;
          if (rows.length >= budget) return;
          // A candle's x is an INSTANT (needs.xScale: 'time'), so a numeric x is
          // epoch ms — this column is titled `Time` and must read like one.
          const xLabel = formatTemporal(p.x, m.xType === 'time', span);
          rows.push({
            header: multi ? `${xLabel} — ${s.name}` : xLabel,
            cells: [formatValue(p.o), formatValue(p.h), formatValue(p.l), formatValue(p.c)],
          });
        });
      });
      return { columns: ['Time', 'Open', 'High', 'Low', 'Close'], rows, total };
    },

    keyboardNav(model): NavContext {
      return {
        seriesCount: model.series.length,
        isVisible: (si) => model.series[si]?.visible ?? false,
        pointCount: (si) => model.series[si]?.points.length ?? 0,
      };
    },

    /**
     * The rise/fall convention is announced, not merely drawn: a reader who
     * cannot separate `up` from `down` (deuteranopia, greyscale, forced colors)
     * needs to know which channel actually carries the direction.
     */
    a11yDescription(): string | null {
      return id === 'candlestick' ? CANDLE_FILL_CONVENTION : OHLC_SHAPE_CONVENTION;
    },

    announce(ctx, pos): string | null {
      const s = ctx.model.series[pos.si];
      const p = s?.points[pos.pi];
      if (!s || !p || p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return null;
      const span = ctx.model.xDomain ? Math.abs(ctx.model.xDomain[1] - ctx.model.xDomain[0]) : 0;
      const xLabel = formatTemporal(p.x, ctx.model.xType === 'time', span);
      // Direction is stated in words. Announcing "Open 100 … Close 105" left the
      // rise/fall comparison to the listener; it is the one fact this chart type
      // exists to convey, and it is the fact the color was carrying alone.
      const direction = p.c > p.o ? 'rising' : p.c < p.o ? 'falling' : 'unchanged';
      return (
        `${xLabel}: Open ${formatValue(p.o)}, High ${formatValue(p.h)}, Low ${formatValue(p.l)}, ` +
        `Close ${formatValue(p.c)}, ${direction}. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
      );
    },

    tooltipPoints(ctx, hit): TooltipPoint[] {
      const tp = ctx.pointFor(hit.si, hit.pi);
      if (!tp) return [];
      const p = ctx.model.series[hit.si]?.points[hit.pi];
      if (p && p.o !== undefined && p.h !== undefined && p.l !== undefined && p.c !== undefined) {
        tp.formattedY =
          `Open ${formatValue(p.o)} · High ${formatValue(p.h)} · ` +
          `Low ${formatValue(p.l)} · Close ${formatValue(p.c)}`;
        tp.color = candleColor(p.o, p.c, ctx.theme);
      }
      return [tp];
    },
  };
}
