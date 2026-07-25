/**
 * Chart-type registry (v0.3).
 *
 * Every chart type is a `ChartTypeDefinition` registered here. The pipeline
 * (`chart.ts` / `model.ts`) dispatches EXCLUSIVELY through the registry and
 * contains no per-type branching: it resolves options, builds the model,
 * computes cartesian scales/axes when a definition declares
 * `needs.cartesianAxes`, then delegates layout, render, hit-testing, legend
 * items, a11y table rows, keyboard geometry and tooltip extraction to the
 * definition. Adding a chart type = one new module + one `registerChartType`
 * call (see ./AUTHORING.md).
 */
import type { AxisOptions, ChartOptions, ChartType, SeriesKind, Theme, TooltipPoint } from '../types';
import type { DataModel, ResolvedOptions } from '../model';
import type { HoverState, Layout, TypeGeom } from '../layout';
import type { Renderer } from '../render/renderer';
import type { RenderContext } from '../layout';
import type { LegendItem } from '../components/legend';
import type { NavContext, NavPosition } from '../a11y/keyboard';
import type { A11yTableOptions, A11yTableSpec } from '../a11y';
import type { DecorationLayer } from '../decorate';

/** Everything the pipeline computed before the definition runs a stage. */
export interface DefinitionContext {
  opts: ResolvedOptions;
  theme: Theme;
  model: DataModel;
  layout: Layout;
}

export interface DefinitionLayoutContext extends DefinitionContext {
  /** Text measurement (renderer-backed), for label-aware geometry. */
  measure(text: string, font: string): number;
}

export interface GeomContext extends DefinitionContext {
  geom: TypeGeom;
}

export interface TooltipExtractContext extends GeomContext {
  /**
   * Pipeline-built TooltipPoint for a datum (series identity, palette color,
   * default x/y formatting). Definitions post-process (slice labels, OHLC
   * blocks, ...) or gather multiple points (shared/crosshair tooltips).
   */
  pointFor(si: number, pi: number): TooltipPoint | null;
}

/**
 * v0.3 — PER-AXIS chrome switches. `true`/`false` on `needs.axisChrome` still
 * means "both axes"; this shape turns one screen axis off on its own.
 *
 * A switch covers everything the pipeline draws FOR that screen axis: its axis
 * line, its tick labels, its axis title and its gridlines. Turning an axis off
 * also releases the margin the pipeline reserved for its labels.
 */
export interface AxisChromeNeeds {
  /** Bottom (screen-x) axis: line + tick labels + `xAxis.label` + x gridlines. */
  x?: boolean;
  /** Left (screen-y) axis: line + tick labels + `yAxis.label` + y gridlines. */
  y?: boolean;
}

/** `AxisChromeNeeds` with both switches decided. */
export interface ResolvedAxisChrome {
  x: boolean;
  y: boolean;
}

/**
 * v0.3 — the cartesian AXIS ARRANGEMENT: which screen axis carries which of
 * the two logical axes (the continuous VALUE axis, and the DATA axis that
 * carries `x` — band/category or continuous).
 *
 * - `'value-y'` — screen-x = data axis (band or continuous), screen-y = the
 *   continuous value axis. The default, and what every vertical chart uses.
 * - `'value-x'` — screen-x = the continuous value axis, screen-y = the band
 *   (category) axis. What `horizontal: true` produces (bar, bullet). A
 *   non-cartesian type that draws its own mirrored rows declares it too, so the
 *   pipeline formats its VALUES with `xAxis` and its CATEGORIES with `yAxis`
 *   (pyramid).
 * - `'rows'` — screen-x = the continuous DATA axis (honoring
 *   `xAxis.type: 'time' | 'log' | 'linear'`), screen-y = the band (category)
 *   axis. There is NO value axis: the categories are the cross axis, so this is
 *   the arrangement a schedule needs (gantt: task rows against a time axis).
 *   `computeCartesianLayout` pairs a band axis with a Linear/Log VALUE scale in
 *   the other two modes, which cannot express a band cross-axis + time axis.
 */
export type AxisArrangement = 'value-y' | 'value-x' | 'rows';

/**
 * What a chart type NEEDS from the shared pipeline. The pipeline owns
 * scales/axes building, stacking math, downsampling, animation, tooltip and
 * legend DOM, keyboard focus management and the a11y layer — a definition
 * only declares which of those apply and supplies the per-type pieces.
 */
export interface ChartTypeNeeds {
  /** Pipeline builds x/y scales + ticks + margins and draws grid/axes. */
  cartesianAxes: boolean;
  /**
   * Draw axis lines / tick labels / axis titles / grid (default true).
   * `false` = chrome-free (sparkline); an `AxisChromeNeeds` object turns the
   * two screen axes off independently (streamgraph: `{ y: false }` keeps the
   * x axis and drops the meaningless value axis).
   */
  axisChrome?: boolean | AxisChromeNeeds;
  /**
   * v0.3 — which screen axis carries the value axis and which the band axis.
   * Defaults to `'value-x'` when `horizontal` is in effect, else `'value-y'`.
   */
  axes?: AxisArrangement;
  /**
   * The x-axis KIND this type declares.
   *
   * - `'band'` — a category x-axis (bar, boxplot), whatever the data looks like.
   * - `'time'` — v0.3.2: the x of this type is INHERENTLY temporal (a candle is
   *   an instant, a task starts on a date). `inferXType` honours the
   *   declaration, so a bare number is epoch milliseconds BY DECLARATION rather
   *   than by sniffing — which is the only safe basis, since integer `x` values
   *   are legal everywhere else. Declaring it makes the tick labels, the tooltip
   *   header, the a11y table's time column and the keyboard announcement agree
   *   with each other; a scoped formatting patch would have made only one of
   *   them right (quality audit E-5 / A-7).
   *   Explicit caller intent still wins (`xAxis.type`), and so does genuinely
   *   categorical data — supplied `categories`, or string `x` values — because a
   *   band placement the rest of the pipeline is already using must not be
   *   contradicted by a declaration.
   * - `'auto'` (default) — infer from the data.
   */
  xScale?: 'band' | 'auto' | 'time';
  /**
   * v0.3 — how a datum is mapped onto a category band. `'auto'` (default)
   * reads an integer `x` as a band index and falls back to the point index;
   * `'position'` ALWAYS uses the point index, for types whose normalized `x` is
   * meaningless (violin reads raw `number[]` samples, which the generic
   * normalizer folds into tuple shapes). `bandIndexFor` obeys the flag, so
   * band placement, tick lookup, tooltips and the a11y table agree.
   */
  bandIndex?: 'auto' | 'position';
  /** Base mark kind for series without a per-series override (cartesian only). */
  baseKind?: SeriesKind;
  /** Per-series `type` overrides allowed (combo — cartesian roots only). */
  combo?: boolean;
  /**
   * v0.3 — a series with no explicit per-series `type` renders as the
   * `'rangearea'` band kind whenever its DATA carries a full `low`/`high` pair.
   * The `rangearea` root declares it, so band-ness is decided by the data while
   * everything else on the chart keeps its ordinary cartesian mark. An explicit
   * `SeriesOptions.type` always wins.
   */
  rangeFromData?: boolean;
  /** `stacked` option honored (applies within same-kind groups: bar, area). */
  stacking?: boolean;
  /** `horizontal` option honored (bar). */
  horizontal?: boolean;
  /** LTTB downsampling for eligible series kinds (line/scatter, unstacked area). */
  downsample?: boolean;
  /**
   * v0.3 — how a three-element data tuple is read by the normalizer:
   * 'size' (default) = `[x, y, r]` (bubble size channel), 'range' =
   * `[x, low, high]` (rangearea/dumbbell band). Object data always carries
   * `r` and `low`/`high` verbatim regardless of this flag.
   */
  triple?: 'size' | 'range';
}

/**
 * v0.3 — result of the `extendValueDomain` stage. A bare `[lo, hi]` tuple is
 * shorthand for `{ domain: [lo, hi] }`.
 */
export interface ValueDomainExtension {
  /** Value range to include. UNIONED with the data extent; never narrows. */
  domain: [number, number];
  /**
   * `true` = use the resulting domain VERBATIM as the value-axis domain: no
   * `nice()` widening, so the outermost mark ends exactly at the plot edge
   * (bullet's widest qualitative range must fill its row). An explicit
   * `xAxis`/`yAxis` `min`/`max` still wins.
   */
  exact?: boolean;
}

/**
 * A chart type. One module per type; register with `registerChartType`.
 * The contract names the responsibilities: layout, render, hit-test, legend
 * items, a11y table rows, keyboard geometry, tooltip point extraction and
 * per-type option resolution (legend auto policy, tooltip defaults, chrome).
 */
export interface ChartTypeDefinition {
  readonly id: ChartType;
  readonly needs: ChartTypeNeeds;

  /**
   * Per-type option resolution. Called after generic resolution with the
   * resolved options (mutate in place) and the raw options (to detect what
   * the caller set explicitly). Examples: pie keys legend-auto off slice
   * count; line/area default `tooltip.shared` to true; sparkline strips
   * chrome and defaults the tooltip off.
   */
  resolveOptions?(resolved: ResolvedOptions, raw: ChartOptions): void;

  /**
   * v0.3 — OPTIONAL value-domain extension: the definition-side counterpart of
   * `Decorator.extendYDomain`. Called while the MODEL is built, right after the
   * data extent is known and BEFORE any scale exists, so a type can widen the
   * value axis to cover marks the generic extent cannot see (a bullet's
   * qualitative ranges and target, a boxplot's whiskers/outliers read from RAW
   * `number[]` samples, a waterfall's running totals).
   *
   * The pipeline UNIONS the result with the data extent and never narrows.
   * Return `{ domain, exact: true }` to also suppress `nice()` widening.
   *
   * Use this INSTEAD of writing `xAxis.min`/`max` from `resolveOptions`: axis
   * options belong to the caller, and `getOptions()` must keep reporting what
   * the caller configured rather than a computed domain.
   */
  extendValueDomain?(model: DataModel, opts: ResolvedOptions): ValueDomainExtension | [number, number] | null;

  /**
   * Compute per-datum geometry against the pipeline-built layout/scales.
   * `pos`/`slices` in the result are interpolated by the animation system;
   * `extra` is free-form and redrawn without interpolation.
   */
  layout(ctx: DefinitionLayoutContext): TypeGeom;

  /** Paint marks through the Renderer (never the canvas API directly). */
  render(ctx: RenderContext): void;

  /**
   * v0.3 — OPTIONAL overlay stage, called twice per frame: once with
   * `'under'` immediately before `render` and once with `'over'` immediately
   * after the axis chrome. Use it for a type's own decorations (reference
   * marks, direct labels, a center total) so `render` stays about the marks.
   *
   * Cross-cutting features (error bars, data labels, annotations, trendlines,
   * the zoom brush) do NOT use this hook — they are pipeline-level
   * `Decorator`s (src/decorate.ts) and no chart type ever knows about them.
   */
  decorations?(ctx: RenderContext, layer: DecorationLayer): void;

  /** Hit-test a canvas-space pointer position to a datum. */
  hitTest(ctx: GeomContext, px: number, py: number): HoverState | null;

  /**
   * v0.3 — OPTIONAL legend-visibility stage, run by the pipeline BETWEEN
   * `layout()` and the DOM sync, for a legend decision that depends on
   * MEASURED layout (slope: "no legend when the direct end labels fit" needs
   * both text metrics and the plot rect, which `resolveOptions` does not have).
   *
   * It receives the frame's geometry (`ctx.geom`, so a plan computed in
   * `layout()` can simply be read back off `extra`). Return `true`/`false` to
   * set `legend.show`, or `null`/`undefined` to leave the resolved value alone.
   * Consult `ctx.opts.legend.auto` to avoid overriding an explicit caller
   * choice. `layout()` must NOT mutate `opts` — this is the sanctioned seam.
   */
  resolveLegend?(ctx: GeomContext): boolean | null;

  /** Legend entries (series for cartesian, slices for pie/donut, ...). */
  legendItems(ctx: DefinitionContext): LegendItem[];

  /**
   * Optional custom legend element (e.g. heatmap's gradient color-scale
   * bar, which the item-based legend cannot express). When this returns an
   * element, the pipeline mounts it in the legend's place instead of
   * rendering items; the legend.show policy still controls visibility.
   * Return null (or omit the hook) for regular item rendering.
   */
  legendCustomEl?(ctx: DefinitionContext, doc: Document): HTMLElement | null;

  /**
   * Columns + rows for the accessible data table (shape-appropriate).
   *
   * v0.3.2 — `opts.limit` is an OPTIONAL bound on how many rows to build. The
   * DOM path passes the resolved `a11y.tableMaxRows`; `exportData()` passes
   * nothing and gets everything. Honouring it is optional in the strict sense:
   * the pipeline slices whatever comes back and fills in `A11yTableSpec.total`,
   * so a definition that ignores `limit` keeps working exactly as before.
   *
   * Honour it when building a row is genuinely expensive — one row object with
   * formatted string cells per DATUM, on a type that can carry a million of them
   * (the shared cartesian table, the financial table). Then also set
   * `spec.total` to the row count you WOULD have produced, or the chart will
   * report the truncated count as the whole truth. See AUTHORING.md.
   */
  a11yTable(ctx: DefinitionContext, opts?: A11yTableOptions): A11yTableSpec;

  /**
   * v0.3 — OPTIONAL extra prose for the chart's accessible DESCRIPTION, merged
   * by the pipeline with `a11y.description` and every decorator's
   * `a11yDescription` into the single node the canvas points at with
   * `aria-describedby`. Return null when there is nothing to say.
   *
   * This is where a type reports something a data table cannot: choropleth uses
   * it to name data rows that matched no map feature.
   */
  a11yDescription?(ctx: GeomContext): string | null;

  /**
   * OPTIONAL one-clause summary for the chart's accessible NAME, replacing the
   * generic "N series and M points" clause the pipeline would otherwise
   * generate. Declare it when "points" is the wrong noun for this type's marks:
   * a heat map has ROWS × COLUMNS of cells, a graph has NODES and LINKS, a
   * hierarchy has nested NODES, a map has FEATURES.
   *
   * Return a fragment without a leading capital or trailing period — the
   * pipeline renders it as `"<Title>. <Type> chart: <summary>"`. Return
   * null/undefined to keep the generic clause.
   *
   * This is the accessible NAME (`aria-label`, one line, read before anything
   * else). `a11yDescription` is the longer prose in `aria-describedby`.
   */
  a11ySummary?(ctx: GeomContext): string | null;

  /**
   * Keyboard geometry: how arrow keys walk this type's natural reading
   * order. The pure `navigate()` state machine consumes this context.
   */
  keyboardNav(model: DataModel): NavContext;

  /**
   * Optional: screen-reader announcement for a focused datum. Default:
   * "<x>: <y>. <series>, point i of n."
   */
  announce?(ctx: GeomContext, pos: NavPosition): string | null;

  /** Tooltip points for a hover/focus state (empty array = no tooltip). */
  tooltipPoints(ctx: TooltipExtractContext, hit: HoverState): TooltipPoint[];
}

// ---------------------------------------------------------------------------
// Axis arrangement / chrome helpers (v0.3)
//
// These are the ONE place the pipeline answers "which screen axis is which"
// and "what chrome does this type want". Before v0.3 both questions were
// answered ad hoc from `model.horizontal`, which is meaningless for a type that
// is neither vertical nor `horizontal: true` — three types then post-processed
// `formattedX`/`formattedY` in `tooltipPoints` to compensate.

/** Per-axis chrome, with the boolean shorthand and the defaults resolved. */
export function resolveAxisChrome(needs: ChartTypeNeeds): ResolvedAxisChrome {
  if (!needs.cartesianAxes) return { x: false, y: false };
  const c = needs.axisChrome ?? true;
  if (typeof c === 'boolean') return { x: c, y: c };
  return { x: c.x ?? true, y: c.y ?? true };
}

/** True when ANY axis chrome is drawn (grid/axes passes can be skipped). */
export function hasAxisChrome(chrome: ResolvedAxisChrome): boolean {
  return chrome.x || chrome.y;
}

/**
 * The axis arrangement in effect: the type's declaration, else derived from
 * whether `horizontal` is actually in force on the model.
 */
export function axisArrangement(needs: ChartTypeNeeds, horizontal: boolean): AxisArrangement {
  return needs.axes ?? (horizontal ? 'value-x' : 'value-y');
}

/**
 * The `AxisOptions` block describing a type's continuous VALUE axis — the one
 * whose `ticks.format` formats data VALUES (tooltips, data labels, the value
 * tick labels). `'rows'` has no value axis; `yAxis` is returned so a formatter
 * lookup still resolves to something harmless.
 */
export function valueAxisOf(needs: ChartTypeNeeds, opts: ResolvedOptions, horizontal: boolean): AxisOptions {
  return axisArrangement(needs, horizontal) === 'value-x' ? opts.xAxis : opts.yAxis;
}

/**
 * The `AxisOptions` block describing a type's CATEGORY / data axis — the one
 * whose `ticks.format` formats category labels (tick labels, tooltip headers).
 */
export function categoryAxisOf(needs: ChartTypeNeeds, opts: ResolvedOptions, horizontal: boolean): AxisOptions {
  return axisArrangement(needs, horizontal) === 'value-y' ? opts.xAxis : opts.yAxis;
}

// ---------------------------------------------------------------------------

/** The 19 ids the v0.1/v0.2 contract declares. */
export const V02_CHART_TYPE_IDS: readonly ChartType[] = [
  'line', 'area', 'bar', 'scatter', 'pie', 'donut',
  'bubble', 'sparkline', 'histogram', 'boxplot', 'candlestick', 'ohlc',
  'waterfall', 'heatmap', 'treemap', 'sunburst', 'funnel', 'radar', 'gauge',
];

/** The 20 ids the v0.3 contract adds. */
export const V03_CHART_TYPE_IDS: readonly ChartType[] = [
  'rangearea', 'bullet', 'dumbbell', 'lollipop', 'slope',
  'streamgraph', 'marimekko', 'pyramid', 'calendar',
  'radialbar', 'rose', 'violin', 'parallel',
  'icicle', 'circlepack', 'wordcloud', 'sankey', 'gantt',
  'choropleth', 'network',
];

/** Every id the contract declares (39). Registration is open to exactly these. */
export const CHART_TYPE_IDS: readonly ChartType[] = [
  ...V02_CHART_TYPE_IDS,
  ...V03_CHART_TYPE_IDS,
];

const PLACEHOLDER = Symbol('chartcraft.placeholder');

const registry = new Map<ChartType, ChartTypeDefinition>();

/**
 * Register (or replace) a chart-type definition. Placeholders registered for
 * not-yet-implemented ids are replaced silently, so type modules can land
 * independently and in any order.
 */
export function registerChartType(def: ChartTypeDefinition): void {
  if (!CHART_TYPE_IDS.includes(def.id)) {
    throw new Error(
      `@chartcraft/core: cannot register unknown chart type '${String(def.id)}'. ` +
        `Valid ids: ${CHART_TYPE_IDS.join(', ')}. New ids must be added to the ` +
        `contract (docs/api-contract.md) and to ChartType first.`,
    );
  }
  registry.set(def.id, def);
}

/** Look up a definition. Throws a helpful error for unimplemented ids. */
export function getChartType(id: ChartType): ChartTypeDefinition {
  const def = registry.get(id);
  if (def && !(PLACEHOLDER in def)) return def;
  if (CHART_TYPE_IDS.includes(id)) {
    throw new Error(notImplementedMessage(id));
  }
  throw new Error(
    `@chartcraft/core: unknown chart type '${String(id)}'. ` +
      `Valid types: ${CHART_TYPE_IDS.join(', ')}.`,
  );
}

export function isChartTypeRegistered(id: ChartType): boolean {
  const def = registry.get(id);
  return def !== undefined && !(PLACEHOLDER in def);
}

/** Ids with a real (non-placeholder) definition. */
export function registeredChartTypes(): ChartType[] {
  return [...registry.keys()].filter((id) => isChartTypeRegistered(id));
}

function notImplementedMessage(id: ChartType): string {
  const version = V03_CHART_TYPE_IDS.includes(id) ? 'v0.3' : 'v0.2';
  return (
    `@chartcraft/core: chart type '${id}' is declared in the ${version} contract but is ` +
    `not implemented yet. Implement it as a ChartTypeDefinition module in ` +
    `src/charts/${id}.ts and register it via registerChartType() in ` +
    `src/charts/index.ts (see src/charts/AUTHORING.md for the how-to).`
  );
}

/**
 * A definition that throws a helpful "not implemented" error from every
 * pipeline entry point. Registered for contract ids that have no real module
 * yet, so `createChart({ type: 'sankey' })` fails fast with guidance while
 * parallel type modules land independently. `decorations` is deliberately
 * absent (it is optional — the pipeline simply skips it).
 */
export function createNotImplementedPlaceholder(id: ChartType): ChartTypeDefinition {
  const fail = (): never => {
    throw new Error(notImplementedMessage(id));
  };
  const def: ChartTypeDefinition = {
    id,
    needs: { cartesianAxes: false },
    resolveOptions: fail,
    layout: fail,
    render: fail,
    hitTest: fail,
    legendItems: fail,
    a11yTable: fail,
    keyboardNav: fail,
    tooltipPoints: fail,
  };
  (def as unknown as Record<symbol, boolean>)[PLACEHOLDER] = true;
  return def;
}

/** Fill every contract id that has no definition yet with a placeholder. */
export function registerPlaceholders(): void {
  for (const id of CHART_TYPE_IDS) {
    if (!registry.has(id)) registry.set(id, createNotImplementedPlaceholder(id));
  }
}

// Re-export renderer type for definition authors' convenience.
export type { Renderer };
