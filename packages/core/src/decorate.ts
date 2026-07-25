/**
 * Decoration / overlay plumbing (v0.3).
 *
 * Cross-cutting visual features — error bars, trendlines, data labels,
 * annotations, the zoom brush rectangle — are NOT chart types and must not be
 * known to chart types. They are `Decorator`s: pipeline-level passes that draw
 * beneath ('under') or above ('over') the type's marks, receiving the plot
 * rect, the pipeline scales, the data model, the theme and the renderer.
 *
 * There are two independent decoration channels, both walked by `chart.ts`:
 *
 * 1. `ChartTypeDefinition.decorations?(ctx, layer)` — a type's OWN overlay
 *    stage (e.g. a candlestick's own reference marks). Type-local.
 * 2. This module's decorator LIST — global, type-agnostic passes registered
 *    once per build via `registerDecorator`. Every mounted chart walks them.
 *
 * A decorator never mutates the model or the layout. Its only inputs are the
 * read-only `DecoratorContext`; its outputs are draw calls, optional legend
 * entries, an optional y-domain extension, an optional click claim, and an
 * optional `attach` lifecycle for its own DOM listeners (zoom/brush).
 *
 * Nothing is registered by default: with an empty list every pipeline stage
 * behaves exactly as it did in v0.2.
 *
 * Register decorators at MODULE LOAD time (a feature module's top level, or an
 * explicit `registerXDecorators()` the way chart types do it). `attach` runs
 * when a chart mounts, so a decorator registered after a chart is already
 * mounted will draw on that chart's next frame but never receive its host.
 */
import type { ChartEventMap, Theme, TooltipPoint } from './types';
import type { DataModel, ResolvedOptions } from './model';
import type { AnyScale, HoverState, Layout, Rect, TypeGeom } from './layout';
import type { Renderer } from './render/renderer';
import type { LegendItem } from './components/legend';
import type { A11yTableSpec } from './a11y';
import type { ChartTypeDefinition } from './charts/registry';

/** Which side of the type's marks a decoration paints on. */
export type DecorationLayer = 'under' | 'over';

/**
 * A zoom/pan window: continuous domain overrides applied by the layout stage.
 * `null`/absent on an axis = use the data domain. Band (category) axes ignore
 * the viewport — zoom is defined on continuous axes only.
 */
export interface Viewport {
  x?: [number, number] | null;
  y?: [number, number] | null;
}

/** Everything a decorator may read. Treat every field as read-only. */
export interface DecoratorContext {
  /** Draw through this — never the canvas API directly. */
  r: Renderer;
  theme: Theme;
  opts: ResolvedOptions;
  model: DataModel;
  /** Full pipeline layout (scales, ticks, baseline). */
  layout: Layout;
  /** Convenience alias for `layout.plot`. */
  plot: Rect;
  /** Convenience alias for `layout.xScale` (band for category x). */
  xScale: AnyScale | null;
  /** Convenience alias for `layout.yScale` (band for horizontal bars). */
  yScale: AnyScale | null;
  /** Per-datum geometry for the CURRENT frame (animation-interpolated). */
  geom: TypeGeom;
  /** Current hover/focus datum, or null. */
  hover: HoverState | null;
  /** The active chart-type definition (read `def.needs` to opt in/out). */
  def: ChartTypeDefinition;
  /** Active zoom viewport, or null when unzoomed. */
  viewport: Viewport | null;
  /**
   * v0.3 — the LIVE chart's DOM host, or **null** when this pass is painting
   * somewhere that is not the mounted chart.
   *
   * `exportImage()` renders through an offscreen `Renderer` and hands
   * decorators a context whose `host` is null, so an export can never reach the
   * live DOM. Treat a null host as "draw only, touch nothing".
   */
  host: DecoratorHost | null;
  /** Emit a public chart event (e.g. `annotationclick`). */
  emit<K extends keyof ChartEventMap>(type: K, ev: ChartEventMap[K]): void;
}

/**
 * Per-chart-instance handle passed to `Decorator.attach`. This is the ONLY
 * place a decorator may add DOM listeners or drive re-renders — used by the
 * zoom/brush decorator to own pointer, wheel and keyboard interaction without
 * the pipeline knowing anything about zoom.
 */
export interface DecoratorHost {
  /** The chart's canvas (attach pointer/wheel listeners here). */
  readonly canvas: HTMLCanvasElement;
  /** The chart's root element (legend + canvas wrap + a11y nodes). */
  readonly root: HTMLElement;
  /** The container the caller passed to `createChart`. */
  readonly el: HTMLElement;
  /** A fresh context snapshot (call it, do not cache it). */
  context(): DecoratorContext;
  /** Repaint without re-running layout (cheap; coalesced through rAF). */
  requestRender(): void;
  /** Set/clear the zoom viewport: re-runs downsampling, layout and paint. */
  setViewport(v: Viewport | null): void;
  getViewport(): Viewport | null;
  /**
   * Claim BOTH touch axes for the duration of a drag gesture (`touch-action:
   * none` on the canvas), and release them afterwards.
   *
   * The canvas is normally `touch-action: pan-y` so a user can still scroll the
   * page vertically with a finger on the chart. A decorator that is mid-DRAG
   * needs the vertical axis too — otherwise a brush that starts horizontally is
   * stolen by the browser the moment the finger wanders — so it raises the lock
   * on `pointerdown` and lowers it on `pointerup`/`pointercancel`. ALWAYS pair
   * the calls: a lock left raised pins the page.
   */
  setGestureLock(locked: boolean): void;
  /** Emit a public chart event. */
  emit<K extends keyof ChartEventMap>(type: K, ev: ChartEventMap[K]): void;
}

/**
 * A pipeline-level overlay pass. Register once per build; every chart walks
 * the list. Keep `draw` pure with respect to the context.
 */
export interface Decorator {
  /** Stable id; re-registering the same id REPLACES the decorator. */
  readonly id: string;
  /** 'under' draws beneath the type's marks, 'over' above them. */
  readonly layer: DecorationLayer;
  /** Ascending within a layer; ties keep registration order. Default 0. */
  readonly order?: number;
  /**
   * Cheap opt-out — return false to skip this chart entirely (e.g. no series
   * declares `errorBars`, or `opts.zoom.enabled` is false). Default: applies.
   */
  appliesTo?(ctx: DecoratorContext): boolean;
  /** Paint. Clip to `ctx.plot` yourself when the feature must not bleed. */
  draw(ctx: DecoratorContext): void;
  /**
   * Optional value-axis extension, applied while the MODEL is built (before
   * scales exist) — error bars use this so whiskers are inside the domain.
   * Return null to leave the domain alone. Never narrows: the pipeline unions
   * the result with the data extent.
   */
  extendYDomain?(model: DataModel, opts: ResolvedOptions): [number, number] | null;
  /**
   * Optional extra legend entries appended after the type's items (trendlines
   * are legend-labeled so they can never read as observed data).
   */
  legendItems?(ctx: DecoratorContext): LegendItem[];
  /**
   * v0.3 — optional transform of the accessible data table. Applied by the
   * pipeline between the type's `a11yTable` stage and BOTH the table DOM and
   * `exportData()`, so the two can never disagree (error bars add their
   * `± low` / `± high` columns here). Return `spec` unchanged to opt out.
   */
  a11yTable?(ctx: DecoratorContext, spec: A11yTableSpec): A11yTableSpec;
  /**
   * v0.3 — optional transform of the tooltip's points, applied after the type's
   * `tooltipPoints` stage and BEFORE `opts.tooltip.format`, so a feature can
   * enrich a value ("10 (8–12)") without wrapping the caller's formatter.
   */
  tooltipPoints?(ctx: DecoratorContext, hit: HoverState, points: TooltipPoint[]): TooltipPoint[];
  /**
   * v0.3 — optional extra prose for the chart's accessible DESCRIPTION. The
   * pipeline concatenates `a11y.description`, the type's `a11yDescription` and
   * every applying decorator's into the ONE node the canvas points at with
   * `aria-describedby` (annotations describe their reference lines here).
   * Return null when there is nothing to say.
   */
  a11yDescription?(ctx: DecoratorContext): string | null;
  /**
   * Optional click claim, consulted BEFORE datum hit-testing. Return true to
   * consume the click (annotations emit `annotationclick` here).
   */
  onClick?(ctx: DecoratorContext, px: number, py: number, native: MouseEvent): boolean;
  /**
   * Optional per-chart lifecycle. Called once on mount; the returned function
   * (if any) runs on `destroy`. Add DOM listeners here, nowhere else.
   */
  attach?(host: DecoratorHost): (() => void) | void;
}

const list: Decorator[] = [];

/** Register (or replace, by id) a pipeline-level decorator. */
export function registerDecorator(d: Decorator): void {
  if (!d || typeof d.id !== 'string' || d.id.length === 0) {
    throw new Error('@chartcraft/core: a Decorator needs a non-empty string id');
  }
  if (d.layer !== 'under' && d.layer !== 'over') {
    throw new Error(
      `@chartcraft/core: decorator '${d.id}' has an invalid layer '${String(d.layer)}' (expected 'under' or 'over')`,
    );
  }
  if (typeof d.draw !== 'function') {
    throw new Error(`@chartcraft/core: decorator '${d.id}' must implement draw(ctx)`);
  }
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0) list[i] = d;
  else list.push(d);
}

/** Remove a decorator by id. Returns true when one was removed. */
export function unregisterDecorator(id: string): boolean {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/**
 * Registered decorators, sorted by `order` (ascending, stable within equal
 * order). Pass a layer to get only that layer's passes.
 */
export function decorators(layer?: DecorationLayer): readonly Decorator[] {
  const of = layer ? list.filter((d) => d.layer === layer) : list.slice();
  return of
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.order ?? 0) - (b.d.order ?? 0) || a.i - b.i)
    .map((e) => e.d);
}

/** Drop every registered decorator (tests / teardown). */
export function clearDecorators(): void {
  list.length = 0;
}

/** True when the decorator applies to this context. */
export function decoratorApplies(d: Decorator, ctx: DecoratorContext): boolean {
  return d.appliesTo ? d.appliesTo(ctx) === true : true;
}

/**
 * Union every registered decorator's y-domain extension into `domain`.
 * Called by `buildModel` after the data extent is known.
 */
export function extendYDomainForDecorators(
  domain: [number, number],
  model: DataModel,
  opts: ResolvedOptions,
): [number, number] {
  let [lo, hi] = domain;
  for (const d of list) {
    if (!d.extendYDomain) continue;
    const ext = d.extendYDomain(model, opts);
    if (!ext) continue;
    const [a, b] = ext;
    if (Number.isFinite(a) && a < lo) lo = a;
    if (Number.isFinite(b) && b > hi) hi = b;
  }
  return [lo, hi];
}

/**
 * Apply every applying decorator's `a11yTable` transform, in decorator order.
 * ONE call site serves both the table DOM and `exportData()`.
 */
export function applyDecoratorTables(spec: A11yTableSpec, ctx: DecoratorContext): A11yTableSpec {
  let out = spec;
  for (const d of decorators()) {
    if (!d.a11yTable || !decoratorApplies(d, ctx)) continue;
    out = d.a11yTable(ctx, out);
  }
  return out;
}

/** Apply every applying decorator's `tooltipPoints` transform, in order. */
export function applyDecoratorTooltipPoints(
  points: TooltipPoint[],
  ctx: DecoratorContext,
  hit: HoverState,
): TooltipPoint[] {
  let out = points;
  for (const d of decorators()) {
    if (!d.tooltipPoints || !decoratorApplies(d, ctx)) continue;
    out = d.tooltipPoints(ctx, hit, out);
  }
  return out;
}

/** Non-empty description fragments contributed by decorators, in order. */
export function decoratorDescriptions(ctx: DecoratorContext): string[] {
  const out: string[] = [];
  for (const d of decorators()) {
    if (!d.a11yDescription || !decoratorApplies(d, ctx)) continue;
    const text = d.a11yDescription(ctx);
    if (text) out.push(text);
  }
  return out;
}

/** Normalize a viewport, dropping empty/degenerate axes. Returns null if empty. */
export function normalizeViewport(v: Viewport | null | undefined): Viewport | null {
  if (!v) return null;
  const out: Viewport = {};
  const axis = (r: [number, number] | null | undefined): [number, number] | undefined => {
    if (!r) return undefined;
    const [a, b] = r;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return undefined;
    return a < b ? [a, b] : [b, a];
  };
  const x = axis(v.x);
  const y = axis(v.y);
  if (x) out.x = x;
  if (y) out.y = y;
  return out.x || out.y ? out : null;
}
