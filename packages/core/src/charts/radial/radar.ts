/**
 * Radar chart-type definition (v0.2 contract).
 *
 * - `categories` are the spokes (3..12 required — helpful error outside).
 * - Series values must be >= 0 (null = gap).
 * - Polar grid is recessive: hairline polygonal rings + spokes in
 *   `theme.gridline`, spoke labels in `theme.textMuted`.
 * - Series render as 2px closed outlines with a 0.15-alpha fill; vertex
 *   markers (>= 8px diameter with a surface ring) appear on hover/focus only.
 * - Legend = series, toggleable (generic legend policy: auto-shown >= 2).
 * - Keyboard: Left/Right walk vertices, Up/Down walk series (natural reading
 *   order); a11y table = category rows x series columns.
 */
import type { ChartOptions } from '../../types';
import type { PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import { seriesColor } from '../../model';
import type { ChartTypeDefinition } from '../registry';
import type { PathCmd } from '../../render/renderer';
import type { A11yTableSpec } from '../../a11y';
import { nearestPoint } from '../../interaction/hittest';
import { formatValue } from '../../util';
import { polarToCartesian, ringValues, spokeAngle } from './polar';

export const RADAR_MIN_SPOKES = 3;
export const RADAR_MAX_SPOKES = 12;
export const RADAR_FILL_ALPHA = 0.15;
export const RADAR_OUTLINE_WIDTH = 2;
/** 8px diameter — drawn on hover/focus only. */
export const RADAR_MARKER_RADIUS = 4;
export const RADAR_RING_COUNT = 4;
/** Space reserved outside the outer ring for spoke labels (px + fontSize). */
export const RADAR_LABEL_PAD = 14;

export interface RadarFrame {
  cx: number;
  cy: number;
  /** Outer (max-value) radius. */
  r: number;
  /** Spoke angles in spoke order (spoke 0 at 12 o'clock, clockwise). */
  angles: number[];
  /** Grid rings, ascending; the outermost ring's value is the scale max. */
  rings: { value: number; r: number }[];
  /** Value mapped onto the outer ring. */
  max: number;
}

/** Pure polar layout for the radar grid. */
export function computeRadarFrame(
  spokeCount: number,
  maxValue: number,
  plot: Rect,
  labelPad: number,
): RadarFrame {
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r = Math.max(10, Math.min(plot.w, plot.h) / 2 - labelPad);
  const vals = ringValues(maxValue, RADAR_RING_COUNT);
  const max = vals[vals.length - 1] ?? 1;
  return {
    cx,
    cy,
    r,
    angles: Array.from({ length: spokeCount }, (_, i) => spokeAngle(i, spokeCount)),
    rings: vals.map((value) => ({ value, r: (value / max) * r })),
    max,
  };
}

/** Screen position of a value on spoke `i`. */
export function radarVertex(frame: RadarFrame, i: number, value: number): { x: number; y: number } {
  return polarToCartesian(frame.cx, frame.cy, (value / frame.max) * frame.r, frame.angles[i] ?? 0);
}

// ---------------------------------------------------------------------------
// Validation (raw options, so createChart fails fast before any DOM work).

function rawSpokeCount(raw: ChartOptions): number {
  const cats = raw.data?.categories;
  if (cats) return cats.length;
  // Mirror the model's category derivation: distinct string x values, else
  // the index fallback (longest series length).
  const seen = new Set<string>();
  let sawString = false;
  let maxLen = 0;
  for (const s of raw.data?.series ?? []) {
    maxLen = Math.max(maxLen, s.data?.length ?? 0);
    for (const v of s.data ?? []) {
      const x = Array.isArray(v) ? v[0] : v !== null && typeof v === 'object' ? v.x : undefined;
      if (typeof x === 'string') {
        sawString = true;
        seen.add(x);
      }
    }
  }
  return sawString ? seen.size : maxLen;
}

function validateRadarOptions(raw: ChartOptions): void {
  const spokes = rawSpokeCount(raw);
  if (spokes < RADAR_MIN_SPOKES || spokes > RADAR_MAX_SPOKES) {
    throw new Error(
      `@chartcraft/core: radar requires between ${RADAR_MIN_SPOKES} and ${RADAR_MAX_SPOKES} ` +
        `categories (spokes); got ${spokes}. Provide 3-12 entries in data.categories ` +
        `(or 3-12 distinct string x values).`,
    );
  }
  for (const s of raw.data?.series ?? []) {
    (s.data ?? []).forEach((v, i) => {
      const y = typeof v === 'number' ? v : Array.isArray(v) ? v[1] : v && typeof v === 'object' ? v.y : null;
      if (typeof y === 'number' && y < 0) {
        throw new Error(
          `@chartcraft/core: radar values must be >= 0; series "${s.name}" has ${y} at index ${i}. ` +
            `Radar encodes magnitude as distance from the center and cannot show negatives.`,
        );
      }
    });
  }
}

// ---------------------------------------------------------------------------

export const radarDefinition: ChartTypeDefinition = {
  id: 'radar',
  needs: { cartesianAxes: false },

  resolveOptions(_resolved, raw) {
    // Generic legend auto (>= 2 series -> shown) is exactly the radar policy;
    // only validation lives here.
    validateRadarOptions(raw);
  },

  layout(ctx): TypeGeom {
    const { model: m, layout: L, theme: t } = ctx;
    const spokes = m.categories?.length ?? 0;
    const frame = computeRadarFrame(spokes, Math.max(0, m.yDomain[1]), L.plot, t.fontSize + RADAR_LABEL_PAD);
    const pos: (PointPos | null)[][] = m.series.map((s) => {
      if (!s.visible) return [];
      return s.points.slice(0, spokes).map((p, pi): PointPos | null => {
        if (p.y === null) return null;
        const v = radarVertex(frame, pi, p.y);
        // y0 at the center so entering vertices grow outward.
        return { x: v.x, y: v.y, y0: frame.cy };
      });
    });
    return { pos, slices: null, bars: null, extra: frame };
  },

  render(ctx: RenderContext) {
    const { r, theme: t, model: m, geom, hover } = ctx;
    const frame = geom.extra as RadarFrame | undefined;
    if (!frame || frame.angles.length === 0) return;
    const hairline = { color: t.gridline, width: 1 };

    // Recessive polar grid: polygonal rings + spokes, hairline gridline color.
    for (const ring of frame.rings) {
      const cmds: PathCmd[] = [];
      frame.angles.forEach((a, i) => {
        const p = polarToCartesian(frame.cx, frame.cy, ring.r, a);
        if (i === 0) cmds.push(['M', p.x, p.y]);
        else cmds.push(['L', p.x, p.y]);
      });
      cmds.push(['Z']);
      r.path(cmds, { stroke: hairline });
    }
    for (const a of frame.angles) {
      const p = polarToCartesian(frame.cx, frame.cy, frame.r, a);
      r.line(frame.cx, frame.cy, p.x, p.y, hairline);
    }

    // Spoke axis labels in textMuted, anchored away from the grid.
    const font = axisTickFont(t);
    (m.categories ?? []).forEach((c, i) => {
      if (i >= frame.angles.length) return;
      const a = frame.angles[i] as number;
      const p = polarToCartesian(frame.cx, frame.cy, frame.r + 8, a);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      r.text(formatValue(c), p.x, p.y, {
        font,
        color: t.textMuted,
        align: Math.abs(cos) < 0.35 ? 'center' : cos > 0 ? 'left' : 'right',
        baseline: Math.abs(sin) < 0.35 ? 'middle' : sin > 0 ? 'top' : 'bottom',
      });
    });

    // Series: 0.15-alpha fill + 2px closed outline (null vertices = gaps).
    m.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = geom.pos[si];
      if (!pts) return;
      const cmds: PathCmd[] = [];
      let started = false;
      for (const p of pts) {
        if (!p) continue;
        if (!started) cmds.push(['M', p.x, p.y]);
        else cmds.push(['L', p.x, p.y]);
        started = true;
      }
      if (!started) return;
      cmds.push(['Z']);
      const color = seriesColor(s, t);
      const dimmed = hover !== null && hover.si !== si;
      r.path(cmds, { fill: color, alpha: dimmed ? 0.08 : RADAR_FILL_ALPHA });
      r.path(cmds, {
        stroke: { color, width: s.lineWidth || RADAR_OUTLINE_WIDTH, join: 'round' },
        alpha: dimmed ? 0.45 : 1,
      });
    });

    // Vertex marker on hover/focus only (>= 8px diameter, 2px surface ring).
    if (hover) {
      const p = geom.pos[hover.si]?.[hover.pi];
      const s = m.series[hover.si];
      if (p && s) {
        r.circle(p.x, p.y, RADAR_MARKER_RADIUS, {
          fill: s.points[hover.pi]?.color ?? seriesColor(s, t),
          stroke: { color: t.surface, width: 2 },
        });
      }
    }
  },

  hitTest(ctx, px, py) {
    const hit = nearestPoint(ctx.geom.pos, px, py);
    return hit ? { si: hit.si, pi: hit.pi } : null;
  },

  legendItems(ctx) {
    // Series, toggleable — exactly like cartesian charts.
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
    const rows: A11yTableSpec['rows'] = (m.categories ?? []).map((c, i) => ({
      header: formatValue(c),
      cells: m.series.map((s) => {
        const y = s.points[i]?.y ?? null;
        return y === null ? '—' : formatValue(y);
      }),
    }));
    return { columns: ['Category', ...m.series.map((s) => s.name)], rows };
  },

  keyboardNav(model) {
    const spokes = model.categories?.length ?? 0;
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => Math.min(model.series[si]?.points.length ?? 0, spokes),
    };
  },

  tooltipPoints(ctx, hit) {
    const tp = ctx.pointFor(hit.si, hit.pi);
    return tp ? [tp] : [];
  },
};
