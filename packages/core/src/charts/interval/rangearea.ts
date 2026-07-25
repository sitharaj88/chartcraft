/**
 * Range area (v0.3). Data is `{x, low, high}` or `[x, low, high]` (the
 * registry declares `needs.triple: 'range'` so three-element tuples read as
 * `[x, low, high]`; `SeriesOptions.lowKey`/`highKey` remap custom object field
 * names during normalization).
 *
 * The band is a real MARK KIND (`SeriesKind` gained `'rangearea'` in v0.3), so
 * this module owns almost nothing: `src/charts/rangeband.ts` paints the mark and
 * the shared cartesian engine owns geometry, the combo z-order
 * (`rangearea < area < bar < line < scatter`) and hit-testing. The root declares
 * `needs.rangeFromData`, which is what keeps the documented rule — a series is
 * a BAND exactly when its data carries a full `low`/`high` pair — while
 * `SeriesOptions.type: 'rangearea'` makes the band available as an explicit
 * per-series override on ANY cartesian root.
 *
 * `baseKind: 'line'` (not `'area'`) is deliberate: `'area'` would zero-anchor
 * the value domain and squash a 90..110 confidence band against the axis.
 */
import type { TooltipPoint } from '../../types';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { a11yRowBudget } from '../../a11y';
import type { NormalizedPoint } from '../../data/normalize';
import { bandIndexFor } from '../../model';
import { rangeOf } from '../../data/normalize';
import { formatValue } from '../../util';
import { makeCartesianDefinition } from '../cartesian';

// The band mark, its paths and its positions live with the other mark kinds.
export {
  RANGE_BAND_ALPHA,
  RANGE_EDGE_WIDTH,
  rangeBandPaths,
  rangeBandPositions,
  renderRangeBandKind,
  type RangeBandPaths,
} from '../rangeband';

/**
 * Model indices of the visible series whose DATA carries low/high bounds. Pure
 * predicate over the data — this is the rule `needs.rangeFromData` implements.
 */
export function bandSeriesIndices(
  series: readonly { visible: boolean; points: NormalizedPoint[] }[],
): number[] {
  const out: number[] = [];
  series.forEach((s, si) => {
    if (s.visible && s.points.some((p) => rangeOf(p) !== null)) out.push(si);
  });
  return out;
}

/**
 * Model indices of the series actually RENDERED as bands. The resolved mark
 * kind is authoritative — an explicit `type: 'line'` on band-shaped data opts
 * out of the band, and the table has to agree with the picture.
 */
function bandIndicesOf(series: readonly { kind: string | null; visible: boolean }[]): number[] {
  const out: number[] = [];
  series.forEach((s, si) => {
    if (s.visible && s.kind === 'rangearea') out.push(si);
  });
  return out;
}

const base = makeCartesianDefinition({
  id: 'rangearea',
  // Combo root: series without low/high data render as ordinary line marks
  // (or their per-series `type` override) on the SAME y-axis as the band.
  baseKind: 'line',
  combo: true,
});

export const rangeareaDefinition: ChartTypeDefinition = {
  ...base,
  // `rangeFromData`: the DATA decides band-ness on this root. `triple: 'range'`
  // reads three-element tuples as `[x, low, high]`.
  needs: { ...base.needs, triple: 'range', rangeFromData: true },

  /** Honours `limit` (v0.3.2, E-8): one row per DATUM, so it can be huge. */
  a11yTable(ctx, tableOpts): A11yTableSpec {
    const m = ctx.model;
    const o = ctx.opts;
    const xHead = o.xAxis.label ?? (m.xType === 'category' ? 'Category' : m.xType === 'time' ? 'Time' : 'X');
    const bandIdx = new Set(bandIndicesOf(m.series));
    // A lone band series owns the plain "Low"/"High" columns; with several
    // series the bounds are prefixed with the series name.
    const soleBand = bandIdx.size === 1 && m.series.length === 1;
    const columns: string[] = [xHead];
    m.series.forEach((s, si) => {
      if (bandIdx.has(si)) {
        columns.push(soleBand ? 'Low' : `${s.name} low`, soleBand ? 'High' : `${s.name} high`);
      } else {
        columns.push(s.name);
      }
    });
    const rows: A11yTableSpec['rows'] = [];
    const built = Math.min(m.maxLen, a11yRowBudget(tableOpts));
    for (let i = 0; i < built; i++) {
      const cat = m.categories?.[i];
      const xVal = cat !== undefined ? cat : (m.series[0]?.points[i]?.x ?? i);
      const cells: string[] = [];
      m.series.forEach((s, si) => {
        const p = s.points[i];
        if (bandIdx.has(si)) {
          const rg = rangeOf(p);
          cells.push(rg ? formatValue(rg.low) : '—', rg ? formatValue(rg.high) : '—');
        } else {
          const y = p?.y ?? null;
          cells.push(y === null ? '—' : formatValue(y));
        }
      });
      rows.push({ header: formatValue(xVal), cells });
    }
    return { columns, rows, total: m.maxLen };
  },

  announce(ctx, pos): string | null {
    const s = ctx.model.series[pos.si];
    const rg = rangeOf(s?.points[pos.pi]);
    if (!s || !rg) return null;
    const p = s.points[pos.pi];
    const cat = ctx.model.categories?.[bandIndexFor(ctx.model, p?.xv ?? null, pos.pi)];
    const xLabel = formatValue(cat !== undefined ? cat : (p?.x ?? pos.pi));
    return (
      `${xLabel}: low ${formatValue(rg.low)}, high ${formatValue(rg.high)}. ` +
      `${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const rg = rangeOf(ctx.model.series[hit.si]?.points[hit.pi]);
    if (rg) tp.formattedY = `low ${formatValue(rg.low)} · high ${formatValue(rg.high)}`;
    return [tp];
  },
};
