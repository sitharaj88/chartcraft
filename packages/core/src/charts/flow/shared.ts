/**
 * Helpers shared by the flow & schedule chart types (`sankey`, `gantt`).
 *
 * Both types describe MARKS THE GENERIC NORMALIZER CANNOT SEE: a sankey's
 * marks are graph nodes and links (its series data is a `{ nodes, links }`
 * object, not a `DataValue[]`), and a gantt's rows are tasks in swimlane order
 * across every input series. Each type therefore normalizes its input into ONE
 * synthetic series whose points are its marks IN READING ORDER, from its
 * `resolveOptions` hook — the sanctioned per-type option stage. Everything
 * downstream (palette identity, `pointenter/leave/click` payloads, keyboard
 * `dataIndex`, tooltips, the a11y table and `exportData`) then addresses the
 * same single index space, with zero pipeline changes.
 */
import type { ChartData, DataPoint, SeriesOptions } from '../../types';
import type { DataModel, ResolvedOptions } from '../../model';

/**
 * Ellipsize `text` to fit `maxW` using the caller's measurer; null when not
 * even one character plus the ellipsis fits (the caller falls back to the
 * tooltip, per the contract's "direct labels are selective, not exhaustive").
 */
export function fitText(text: string, maxW: number, measure: (t: string) => number): string | null {
  if (maxW <= 0 || text === '') return null;
  if (measure(text) <= maxW) return text;
  for (let n = text.length - 1; n >= 1; n--) {
    const t = `${text.slice(0, n).trimEnd()}…`;
    if (measure(t) <= maxW) return t;
  }
  return null;
}

/**
 * Replace `data.series` with ONE synthetic series carrying `points` (the type's
 * marks in reading order). The caller's own arrays/objects are never mutated:
 * a fresh `ChartData` is returned for the resolved options snapshot.
 */
export function singleSeriesData(data: ChartData, fallbackName: string, points: DataPoint[]): ChartData {
  const first = data.series[0];
  const series: SeriesOptions = {
    id: first?.id ?? first?.name ?? fallbackName,
    name: first?.name ?? fallbackName,
    data: points,
    visible: first?.visible ?? true,
  };
  if (first?.color !== undefined) series.color = first.color;
  const out: ChartData = { series: [series] };
  if (data.categories !== undefined) out.categories = data.categories;
  return out;
}

/** What the caller explicitly asked of the legend (undefined = "auto"). */
export function rawLegendShow(raw: { legend?: boolean | { show?: boolean } }): boolean | undefined {
  return typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
}

/**
 * Legend policy for types whose marks are DIRECTLY LABELLED (sankey node
 * labels, gantt task labels): auto resolves to hidden, an explicit
 * `legend: true` is honored.
 */
export function hideLegendByDefault(resolved: ResolvedOptions, raw: { legend?: boolean | { show?: boolean } }): void {
  if (rawLegendShow(raw) === undefined) resolved.legend.show = false;
}

/** MODEL index of the first visible series (-1 when everything is hidden). */
export function firstVisibleSeries(model: DataModel): number {
  return model.series.findIndex((s) => s.visible);
}
