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
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { LinearScale } from '../../scales/linear';
import { clamp, formatValue } from '../../util';
import { HIT_RADIUS, nearestByX } from '../../interaction/hittest';

export const CANDLE_MIN_WIDTH = 3;
export const CANDLE_MAX_WIDTH = 48;
export const WICK_WIDTH = 1;

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
    for (const d of s.data) {
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

export function makeFinancialDefinition(id: 'candlestick' | 'ohlc'): ChartTypeDefinition {
  return {
    id: id as ChartType,
    needs: { cartesianAxes: true, xScale: 'auto' },

    resolveOptions(resolved, raw) {
      // Contract: candlestick/ohlc are never animated — marks appear instantly.
      resolved.animation = { ...resolved.animation, enabled: false };
      const ext = ohlcExtent(resolved.data);
      if (!ext) return;
      let [lo, hi] = ext;
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const nice = new LinearScale([lo, hi]).nice(5).domain();
      const rawY = typeof raw.yAxis === 'object' && raw.yAxis !== null ? raw.yAxis : {};
      resolved.yAxis = { ...resolved.yAxis };
      if (typeof rawY.min !== 'number') resolved.yAxis.min = nice[0];
      if (typeof rawY.max !== 'number') resolved.yAxis.max = nice[1];
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
            // Wick h→l at 1px, body o→c filled.
            r.line(c.x, c.highPx, c.x, c.lowPx, { color, width: WICK_WIDTH }, alpha);
            const top = Math.min(c.openPx, c.closePx);
            const h = Math.max(1, Math.abs(c.openPx - c.closePx));
            r.rect(c.x - c.w / 2, top, c.w, h, { fill: color, alpha });
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

    a11yTable(ctx): A11yTableSpec {
      const m = ctx.model;
      const multi = m.series.length > 1;
      const span = m.xDomain ? Math.abs(m.xDomain[1] - m.xDomain[0]) : 0;
      const rows: A11yTableSpec['rows'] = [];
      m.series.forEach((s) => {
        s.points.forEach((p) => {
          if (p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return;
          const xLabel = formatValue(p.x, p.x instanceof Date ? span : 0);
          rows.push({
            header: multi ? `${xLabel} — ${s.name}` : xLabel,
            cells: [formatValue(p.o), formatValue(p.h), formatValue(p.l), formatValue(p.c)],
          });
        });
      });
      return { columns: ['Time', 'Open', 'High', 'Low', 'Close'], rows };
    },

    keyboardNav(model): NavContext {
      return {
        seriesCount: model.series.length,
        isVisible: (si) => model.series[si]?.visible ?? false,
        pointCount: (si) => model.series[si]?.points.length ?? 0,
      };
    },

    announce(ctx, pos): string | null {
      const s = ctx.model.series[pos.si];
      const p = s?.points[pos.pi];
      if (!s || !p || p.o === undefined || p.h === undefined || p.l === undefined || p.c === undefined) return null;
      const span = ctx.model.xDomain ? Math.abs(ctx.model.xDomain[1] - ctx.model.xDomain[0]) : 0;
      const xLabel = formatValue(p.x, p.x instanceof Date ? span : 0);
      return (
        `${xLabel}: Open ${formatValue(p.o)}, High ${formatValue(p.h)}, Low ${formatValue(p.l)}, ` +
        `Close ${formatValue(p.c)}. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
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
