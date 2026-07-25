/**
 * Chart-type registry (v0.2).
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
import type { ChartOptions, ChartType, SeriesKind, Theme, TooltipPoint } from '../types';
import type { DataModel, ResolvedOptions } from '../model';
import type { HoverState, Layout, TypeGeom } from '../layout';
import type { Renderer } from '../render/renderer';
import type { RenderContext } from '../layout';
import type { LegendItem } from '../components/legend';
import type { NavContext, NavPosition } from '../a11y/keyboard';
import type { A11yTableSpec } from '../a11y';

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
 * What a chart type NEEDS from the shared pipeline. The pipeline owns
 * scales/axes building, stacking math, downsampling, animation, tooltip and
 * legend DOM, keyboard focus management and the a11y layer — a definition
 * only declares which of those apply and supplies the per-type pieces.
 */
export interface ChartTypeNeeds {
  /** Pipeline builds x/y scales + ticks + margins and draws grid/axes. */
  cartesianAxes: boolean;
  /** Draw axis lines / tick labels / grid (default true). Sparkline: false. */
  axisChrome?: boolean;
  /** 'band' forces a category x-axis (bar, boxplot); 'auto' infers from data. */
  xScale?: 'band' | 'auto';
  /** Base mark kind for series without a per-series override (cartesian only). */
  baseKind?: SeriesKind;
  /** Per-series `type` overrides allowed (combo — cartesian roots only). */
  combo?: boolean;
  /** `stacked` option honored (applies within same-kind groups: bar, area). */
  stacking?: boolean;
  /** `horizontal` option honored (bar). */
  horizontal?: boolean;
  /** LTTB downsampling for eligible series kinds (line/scatter, unstacked area). */
  downsample?: boolean;
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
   * Compute per-datum geometry against the pipeline-built layout/scales.
   * `pos`/`slices` in the result are interpolated by the animation system;
   * `extra` is free-form and redrawn without interpolation.
   */
  layout(ctx: DefinitionLayoutContext): TypeGeom;

  /** Paint marks through the Renderer (never the canvas API directly). */
  render(ctx: RenderContext): void;

  /** Hit-test a canvas-space pointer position to a datum. */
  hitTest(ctx: GeomContext, px: number, py: number): HoverState | null;

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

  /** Columns + rows for the accessible data table (shape-appropriate). */
  a11yTable(ctx: DefinitionContext): A11yTableSpec;

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

/** Every id the v0.2 contract declares. Registration is open to exactly these. */
export const CHART_TYPE_IDS: readonly ChartType[] = [
  'line', 'area', 'bar', 'scatter', 'pie', 'donut',
  'bubble', 'sparkline', 'histogram', 'boxplot', 'candlestick', 'ohlc',
  'waterfall', 'heatmap', 'treemap', 'sunburst', 'funnel', 'radar', 'gauge',
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
  return (
    `@chartcraft/core: chart type '${id}' is declared in the v0.2 contract but is ` +
    `not implemented yet. Implement it as a ChartTypeDefinition module in ` +
    `src/charts/${id}.ts and register it via registerChartType() in ` +
    `src/charts/index.ts (see src/charts/AUTHORING.md for the how-to).`
  );
}

/**
 * A definition that throws a helpful "not implemented" error from every
 * pipeline entry point. Registered for contract ids that have no real module
 * yet, so `createChart({ type: 'heatmap' })` fails fast with guidance while
 * parallel type modules land independently.
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
