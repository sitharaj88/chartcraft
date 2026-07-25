/**
 * createChart + Chart implementation.
 * Pipeline: normalize options -> build data model -> compute scales/layout ->
 * render. update() deep-merges, diffs, and re-runs only the affected stages.
 * Animation interpolates between retained models; renders driven by rAF.
 *
 * v0.2: chart.ts contains NO per-type branching. Every per-type
 * responsibility (layout geometry, rendering, hit-testing, legend items,
 * a11y table rows, keyboard geometry, tooltip extraction, option policy)
 * is dispatched through the chart-type registry (src/charts/registry.ts).
 * The pipeline keeps ownership of scales/axes building, animation, DOM,
 * events and the a11y scaffolding.
 */
import type {
  Chart,
  ChartData,
  ChartEventMap,
  ChartOptions,
  PointEvent,
  Theme,
  TooltipPoint,
  ZoomRange,
} from './types';
import { Emitter } from './events';
import {
  bandIndexFor,
  buildModel,
  resolveOptions,
  rewindowModel,
  seriesColor,
  seriesDash,
  type DataModel,
  type ResolvedOptions,
} from './model';
import { forcedColorsActive, forcedColorsTheme, resolveTheme, watchColorScheme, watchForcedColors } from './theme';
import { CanvasRenderer } from './render/canvas';
import type { Renderer } from './render/renderer';
import {
  computeCartesianLayout,
  computePlainLayout,
  formatCategory,
  type HoverState,
  type Layout,
  type PieSlice,
  type PointPos,
  type RenderContext,
  type TypeGeom,
} from './layout';
import { drawGrid } from './components/grid';
import { drawAxes } from './components/axis';
import { Legend, type LegendItem } from './components/legend';
import { Tooltip, defaultTooltipHTML } from './components/tooltip';
import {
  categoryAxisOf,
  getChartType,
  hasAxisChrome,
  resolveAxisChrome,
  valueAxisOf,
  axisArrangement,
  type AxisArrangement,
  type ChartTypeDefinition,
  type GeomContext,
  type ResolvedAxisChrome,
} from './charts/registry';
import { START_ANGLE } from './charts/pie';
import {
  applyDecoratorTables,
  applyDecoratorTooltipPoints,
  decoratorApplies,
  decoratorDescriptions,
  decorators,
  normalizeViewport,
  type DecorationLayer,
  type DecoratorContext,
  type DecoratorHost,
  type Viewport,
} from './decorate';
import { a11yTableToCSV, a11yTableToJSON, canvasToBlob } from './export';
import { registerBuiltinDecorators } from './features';
import { COARSE_HIT_RADIUS, HIT_RADIUS, coarsePointerMedia, withHitRadius } from './interaction/hittest';
import { Announcer, applyTableLimit, buildDataTable, generateAriaLabel, visuallyHide } from './a11y';
import { navigate, type NavPosition } from './a11y/keyboard';
import { Animator, lerp, prefersReducedMotion } from './animation';
import { caf, deepMerge, formatTemporal, formatValue, raf, uid } from './util';

export const version = '0.3.0';

type RenderReason = ChartEventMap['render']['reason'];

/**
 * The three pointer classes the pipeline distinguishes.
 *
 * An event with NO `pointerType` (a `click`, a `blur`, a synthetic MouseEvent)
 * is treated as `'mouse'`, which is what keeps the mouse path byte-identical:
 * every touch-specific branch is entered only on a POSITIVE `'touch'`/`'pen'`
 * signal, never on the absence of one.
 */
type PointerKind = 'mouse' | 'touch' | 'pen';

function pointerKindOf(e: Event | null | undefined): PointerKind {
  const t = (e as { pointerType?: unknown } | null | undefined)?.pointerType;
  return t === 'touch' || t === 'pen' ? t : 'mouse';
}

/**
 * Whether THIS event came from a coarse (finger-sized) pointer.
 *
 * Per-event `pointerType` first, because it is the only signal that is right on
 * a hybrid device: a touchscreen laptop matches `(pointer: coarse)` for its
 * whole session, and answering "coarse" to its trackpad would silently triple
 * every mouse hit target. The media query is the fallback for events that carry
 * no `pointerType` at all — a `click` (always a MouseEvent, even when a tap
 * synthesized it), or a UA without PointerEvent.
 *
 * A stylus is `pen` and is FINE: it has a visible, pixel-precise tip.
 */
function coarsePointer(e: Event | null | undefined): boolean {
  const t = (e as { pointerType?: unknown } | null | undefined)?.pointerType;
  if (t === 'touch') return true;
  if (t === 'mouse' || t === 'pen') return false;
  return coarsePointerMedia();
}

export function createChart(container: HTMLElement, options: ChartOptions): Chart {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('@chartcraft/core: createChart requires a DOM environment (import is SSR-safe, mounting is not)');
  }
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('@chartcraft/core: createChart requires a container element');
  }
  if (!options || !options.type) {
    throw new Error('@chartcraft/core: options.type is required');
  }
  if (!options.data || !Array.isArray(options.data.series)) {
    throw new Error('@chartcraft/core: options.data.series is required');
  }
  // Built-in decorators (error bars, trendlines, data labels, annotations,
  // zoom) register lazily and idempotently here, for the same reason chart
  // types do: `sideEffects: false` means correctness must never depend on a
  // side-effect import surviving tree-shaking.
  registerBuiltinDecorators();
  return new ChartImpl(container, options);
}

class ChartImpl implements Chart {
  readonly el: HTMLElement;

  private raw: ChartOptions;
  private opts: ResolvedOptions;
  private theme: Theme;
  private model: DataModel;
  private layoutState!: Layout;
  private geom: TypeGeom = { pos: [], slices: null, bars: null };

  private paletteSlots = new Map<string, number>();
  private emitter = new Emitter<ChartEventMap>();

  private root: HTMLElement;
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private legend: Legend;
  private tooltip: Tooltip;
  private announcer: Announcer;
  private tableWrap: HTMLElement;
  private descEl: HTMLElement | null = null;
  private descId: string;

  /** v0.3 zoom viewport: continuous domain overrides, or null when unzoomed. */
  private viewport: Viewport | null = null;
  /** Cached FULL-fidelity model for the a11y table + exportData (see a11yModel). */
  private a11yModelCache: DataModel | null = null;
  /** Cached table specs built from it, keyed by row limit (see a11yTableSpec). */
  private tableSpecCache = new Map<number, ReturnType<ChartTypeDefinition['a11yTable']>>();
  /** The DOM table needs rebuilding (data/visibility/table-mode changed). */
  private tableDirty = true;
  /** `a11y.table` mode the mounted DOM table was built for. */
  private tableMode: 'hidden' | 'visible' | 'off' | null = null;
  /** Teardowns returned by `Decorator.attach` (run on destroy). */
  private decoratorTeardowns: (() => void)[] = [];
  /** Stable per-instance `DecoratorHost` (decorators key state on its identity). */
  private hostRef: DecoratorHost | null = null;

  private ro: ResizeObserver | null = null;
  private unwatchScheme: () => void = () => {};
  private unwatchForced: () => void = () => {};
  private animator = new Animator();
  private hover: HoverState | null = null;
  private focus: NavPosition | null = null;
  private destroyed = false;
  private resizeRaf: number | null = null;
  private hoverRaf: number | null = null;
  private lastSize: { w: number; h: number; dpr: number } | null = null;

  /**
   * The touch/pen contact currently driving hover, or null. A touch has no
   * hover phase, so "is a finger down on this chart" has to be tracked
   * explicitly; it also lets a second finger be ignored rather than fighting
   * the first for the tooltip.
   */
  private touchPointerId: number | null = null;
  /**
   * True while the document-level "dismiss the touch tooltip" listeners are
   * mounted. See `armTouchDismiss`.
   */
  private touchDismissArmed = false;
  /**
   * True while a decorator gesture (a brush/pan drag) owns BOTH axes and the
   * canvas must therefore refuse to let the browser scroll the page. Raised and
   * lowered by `DecoratorHost.setGestureLock`; folded into `touchAction()`.
   */
  private gestureLock = false;

  private onPointerMove: (e: PointerEvent | MouseEvent) => void;
  private onPointerDown: (e: PointerEvent | MouseEvent) => void;
  private onPointerUp: (e: PointerEvent | MouseEvent) => void;
  private onPointerCancel: (e: PointerEvent | MouseEvent) => void;
  private onPointerLeave: (e?: Event) => void;
  private onClick: (e: MouseEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onDocPointerDown: (e: Event) => void;
  private onDocScroll: () => void;

  constructor(container: HTMLElement, options: ChartOptions) {
    this.el = container;
    this.raw = deepMerge({} as ChartOptions, options);
    this.opts = resolveOptions(this.raw);
    this.theme = this.themeFor(this.opts);
    this.descId = uid('chartcraft-desc');

    const doc = container.ownerDocument;

    this.root = doc.createElement('div');
    this.root.className = 'chartcraft';
    this.root.style.display = 'flex';
    this.root.style.position = 'relative';
    this.root.style.width = '100%';
    this.root.style.height = '100%';

    this.wrap = doc.createElement('div');
    this.wrap.className = 'chartcraft-canvas-wrap';
    this.wrap.style.position = 'relative';
    this.wrap.style.flex = '1 1 auto';
    this.wrap.style.minWidth = '0';
    this.wrap.style.minHeight = '0';

    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'chartcraft-canvas';
    this.canvas.style.display = 'block';
    // Touch gestures are the browser's until we claim them — see `touchAction`.
    this.canvas.style.touchAction = this.touchAction();
    this.wrap.appendChild(this.canvas);

    this.legend = new Legend(doc, { onToggle: (id) => this.toggleSeries(id) });
    this.tooltip = new Tooltip(doc);
    this.announcer = new Announcer(doc);
    this.tableWrap = doc.createElement('div');
    this.tableWrap.className = 'chartcraft-a11y-table';

    this.root.appendChild(this.wrap);
    this.root.appendChild(this.tableWrap);
    this.root.appendChild(this.announcer.el);
    doc.body ? doc.body.appendChild(this.tooltip.el) : this.root.appendChild(this.tooltip.el);
    container.appendChild(this.root);

    this.renderer = new CanvasRenderer(this.canvas);

    // Interaction (pointer events unify mouse/touch/pen).
    //
    // `pointerdown`/`pointerup`/`pointercancel` exist for TOUCH: a finger has no
    // hover phase, so a tap is down -> up -> click with no `pointermove` in
    // between, and `handlePointerMove` — the only thing that sets hover and
    // shows the tooltip — would never run. On mouse these three handlers return
    // immediately (see each one), so the mouse path is exactly what it was.
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);
    this.onPointerCancel = (e) => this.handlePointerCancel(e);
    this.onPointerLeave = (e) => this.handlePointerLeave(e);
    this.onClick = (e) => this.handleClick(e);
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onDocPointerDown = (e) => this.handleDocumentPointerDown(e);
    this.onDocScroll = () => this.dismissTouchInspection();
    this.canvas.addEventListener('pointermove', this.onPointerMove as EventListener);
    this.canvas.addEventListener('pointerdown', this.onPointerDown as EventListener);
    this.canvas.addEventListener('pointerup', this.onPointerUp as EventListener);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel as EventListener);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave as EventListener);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('blur', this.onPointerLeave as EventListener);

    // Responsive by default: ResizeObserver coalesced through rAF.
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleResize());
      this.ro.observe(container);
    }

    this.watchThemeIfAuto();
    this.watchForcedColorsAlways();

    this.model = buildModel(this.opts, this.paletteSlots, this.viewport);
    this.refresh('init', false);
    this.attachDecorators();
  }

  /** The chart-type definition for the current resolved type. */
  private get def(): ChartTypeDefinition {
    return getChartType(this.opts.type);
  }

  /**
   * Per-axis chrome for the current type (v0.3). Each switch covers that screen
   * axis's line, tick labels, title, gridlines and reserved margin.
   */
  private get axisChrome(): ResolvedAxisChrome {
    return resolveAxisChrome(this.def.needs);
  }

  /** Which screen axis carries the value axis / the band axis (v0.3). */
  private get arrangement(): AxisArrangement {
    return axisArrangement(this.def.needs, this.model?.horizontal ?? this.opts.horizontal);
  }

  private geomContext(): GeomContext {
    return {
      opts: this.opts,
      theme: this.theme,
      model: this.model,
      layout: this.layoutState,
      geom: this.geom,
    };
  }

  // -------------------------------------------------------------- public API

  /**
   * ALL-OR-NOTHING. Every stage that can reject the caller's payload runs
   * against LOCALS first; the retained state is replaced only once they all
   * succeeded.
   *
   * This matters because rejecting bad data is a documented feature of half the
   * v0.3 types — pyramid demands exactly two series, sankey demands a
   * `{ nodes, links }` graph, gantt demands `{ x, start, end }` objects,
   * radar/rose/radialbar reject negatives, sankey rejects cycles. Those throws
   * come out of `resolveOptions`, `buildModel` or the type's `layout` stage. If
   * `this.raw` had already been overwritten when one fired, EVERY later call
   * would re-resolve the poisoned options and throw again: a single rejected
   * `update()` would brick the chart for the rest of its life, including its
   * `destroy()`. Committing last means a rejected update leaves the chart
   * exactly as it was — the throw is the whole of the damage.
   */
  update(partial: Partial<ChartOptions>): void {
    if (this.destroyed) return;
    const nextRaw = deepMerge(this.raw, partial);
    const nextOpts = resolveOptions(nextRaw);
    const nextTheme = this.themeFor(nextOpts);

    // New data (or a new type) invalidates a zoom window expressed in the old
    // data's units, so the viewport resets — every other update keeps it.
    const nextViewport = 'data' in partial || 'type' in partial ? null : this.viewport;

    const modelKeys: (keyof ChartOptions)[] = ['data', 'type', 'stacked', 'horizontal', 'downsample', 'xAxis', 'yAxis'];
    const modelDirty = modelKeys.some((k) => k in partial);
    const nextModel = modelDirty ? buildModel(nextOpts, this.paletteSlots, nextViewport) : this.model;
    // Trial the layout too: a type's `layout` stage is the third place a payload
    // can be rejected, and it is the one that runs LAST.
    const trial = this.buildLayout(nextOpts, nextTheme, nextModel);

    // ---- commit (nothing below throws) ----
    this.raw = nextRaw;
    this.opts = nextOpts;
    this.theme = nextTheme;
    this.viewport = nextViewport;
    this.invalidateA11y();
    if ('theme' in partial) this.watchThemeIfAuto();
    this.refresh('update', modelDirty, true, { model: nextModel, ...trial });
  }

  setData(data: ChartData): void {
    this.update({ data });
  }

  resize(): void {
    if (this.destroyed) return;
    this.refresh('resize', false, false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.decoratorTeardowns) {
      try {
        off();
      } catch {
        // A misbehaving decorator must never block teardown.
      }
    }
    this.decoratorTeardowns = [];
    this.animator.cancel();
    if (this.resizeRaf !== null) caf(this.resizeRaf);
    if (this.hoverRaf !== null) caf(this.hoverRaf);
    this.ro?.disconnect();
    this.ro = null;
    this.unwatchScheme();
    this.unwatchForced();
    this.canvas.removeEventListener('pointermove', this.onPointerMove as EventListener);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown as EventListener);
    this.canvas.removeEventListener('pointerup', this.onPointerUp as EventListener);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel as EventListener);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave as EventListener);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('blur', this.onPointerLeave as EventListener);
    // The touch-dismissal listeners live on the DOCUMENT, so nothing else can
    // collect them when the chart's own subtree is removed.
    this.disarmTouchDismiss();
    this.renderer.destroy();
    this.tooltip.destroy();
    this.legend.destroy();
    this.announcer.destroy();
    this.root.remove();
    this.emitter.emit('destroy', {});
    this.emitter.clear();
  }

  on<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): () => void {
    return this.emitter.on(type, handler);
  }

  off<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): void {
    this.emitter.off(type, handler);
  }

  getOptions(): Readonly<ChartOptions> {
    return Object.freeze({ ...this.opts }) as Readonly<ChartOptions>;
  }

  // ------------------------------------------------------------ v0.3 exports

  /**
   * Exactly the accessible data table's contents, as CSV (default) or JSON.
   * The rows come from the type definition's `a11yTable` stage — the single
   * source of truth for "what this chart's data looks like as a table".
   */
  exportData(opts?: { format?: 'csv' | 'json' }): string {
    // No limit, ever: an export that silently truncates is a data-integrity bug.
    const spec = this.a11yTableSpec(Number.POSITIVE_INFINITY);
    return (opts?.format ?? 'csv') === 'json' ? a11yTableToJSON(spec) : a11yTableToCSV(spec);
  }

  /**
   * The single a11y-table spec: the type definition's stage, then every
   * applying decorator's `a11yTable` transform (error bars append their `±`
   * columns here). BOTH the table DOM and `exportData()` read this, so the
   * contract's "exportData emits exactly the a11y table's contents" holds even
   * when a cross-cutting feature contributes columns.
   *
   * Built from `a11yModel()` — the FULL data — never from the render model.
   *
   * v0.3.2 (E-8) — `limit` is threaded down to the definition, which may build
   * only that many rows; whatever comes back is sliced here and given a true
   * `total`, so a definition that ignores `limit` behaves exactly as before. The
   * DOM asks for `a11y.tableMaxRows` rows (all it can materialize anyway) and
   * `exportData()` asks for all of them, so the mount no longer pays for a
   * million row objects to display two thousand.
   *
   * Cached PER LIMIT with the same lifetime as the a11y model: the DOM table,
   * the description's row count and any `exportData()` the caller makes all ask
   * on a single `syncDom`, and building rows is O(rows) with a string
   * allocation per cell.
   */
  private a11yTableSpec(limit: number): ReturnType<ChartTypeDefinition['a11yTable']> {
    const cached = this.tableSpecCache.get(limit);
    if (cached) return cached;
    const model = this.a11yModel();
    const spec = this.def.a11yTable(
      { opts: this.opts, theme: this.theme, model, layout: this.layoutState },
      { limit },
    );
    const bounded = applyTableLimit(spec, limit);
    const out = applyDecoratorTables(bounded, {
      ...this.decoratorContext(this.renderer, this.geom),
      model,
    });
    // A decorator maps rows; it does not know about the bound. Carry the count.
    const withTotal = out.total === undefined && bounded.total !== undefined
      ? { ...out, total: bounded.total }
      : out;
    this.tableSpecCache.set(limit, withTotal);
    return withTotal;
  }

  /**
   * The model the ACCESSIBLE surfaces read: every datum the caller supplied,
   * with no downsampling and no zoom window.
   *
   * The render model is a lossy view on purpose — LTTB picks the points that
   * best preserve a line's visible SHAPE, and a zoom viewport narrows to what is
   * on screen. Neither is a defensible basis for the data table or
   * `exportData()`:
   *
   * - LTTB has no notion of which rows are SEMANTICALLY important. Feeding its
   *   output to a screen reader hands that user a visual approximation of the
   *   data — 5,000 of 60,000 rows — with no way to tell that anything was
   *   dropped, while a sighted user can zoom in and recover every point. That is
   *   an accessibility defect, not a performance trade-off.
   * - `exportData()` handing back 5,000 of 60,000 rows is a data-integrity
   *   problem. An export that silently truncates is worse than one that refuses.
   *
   * So both read the full model. When it differs from what is drawn, the
   * accessible DESCRIPTION says so (`samplingNote`) — the relationship is
   * stated, never silent.
   *
   * This is a VIEW, not a rebuild: `buildModel` already retained the pre-lossy
   * points on each series (`NormalizedSeries.sourcePoints`), so recovering them
   * costs one object per series rather than a second normalize pass over the
   * caller's data. When no series was downsampled or windowed there is nothing
   * to recover and the render model is returned as-is, so the common
   * (small-data) case allocates nothing at all.
   */
  private a11yModel(): DataModel {
    if (this.a11yModelCache) return this.a11yModelCache;
    if (!this.model.series.some((s) => s.sourcePoints)) {
      this.a11yModelCache = this.model;
      return this.a11yModelCache;
    }
    const series = this.model.series.map((s) =>
      s.sourcePoints ? { ...s, points: s.sourcePoints } : s,
    );
    this.a11yModelCache = {
      ...this.model,
      series,
      // `maxLen` is read by table stages to size their row loops; it must
      // describe the points this model actually carries.
      maxLen: series.reduce((n, s) => Math.max(n, s.points.length), 0),
      // The table describes the whole series, not the zoom window.
      viewport: null,
    };
    return this.a11yModelCache;
  }

  /** Drop the cached a11y model + table DOM (data, type or visibility changed). */
  private invalidateA11y(): void {
    this.a11yModelCache = null;
    this.tableSpecCache.clear();
    this.tableDirty = true;
  }

  /**
   * One sentence stating how the drawn marks relate to the tabulated data, when
   * they differ. Concatenated into the same `aria-describedby` node as
   * `a11y.description` and the type's own prose.
   */
  private samplingNote(): string | null {
    const parts: string[] = [];
    const full = this.a11yModel();
    const count = (m: DataModel): number => m.series.reduce((n, s) => n + s.points.length, 0);
    const total = count(full);

    if (full !== this.model) {
      const shown = count(this.model);
      if (total > shown) {
        const where = this.viewport !== null ? 'the zoomed window' : 'the full series';
        parts.push(
          `The plot draws ${shown.toLocaleString()} of ${total.toLocaleString()} data points ` +
            `(a visual sample of ${where}); the data table lists the full data.`,
        );
      }
    }

    // And whether the TABLE itself is bounded. Stated, never silent — at
    // whatever bound `a11y.tableMaxRows` set (default 2,000, `Infinity` = none).
    // The count comes from `spec.total`, which is true whether the definition
    // built every row or only the first `max` of them (v0.3.2, E-8).
    if (this.opts.a11y.table !== 'off') {
      const max = this.opts.a11y.tableMaxRows;
      const spec = this.a11yTableSpec(max);
      const rows = spec.total ?? spec.rows.length;
      if (rows > max) {
        parts.push(
          `The data table lists the first ${max.toLocaleString()} of ` +
            `${rows.toLocaleString()} rows; exportData() returns all ${rows.toLocaleString()}.`,
        );
      }
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Re-render offscreen at `scale` (default 2) and resolve a Blob.
   * `'svg'` rejects: this build has no SVG renderer.
   */
  async exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob> {
    if (this.destroyed) {
      throw new Error('@chartcraft/core: exportImage called on a destroyed chart');
    }
    const format = opts?.format ?? 'png';
    if (format !== 'png') {
      throw new Error(
        `@chartcraft/core: SVG renderer not available — exportImage({ format: '${format}' }) cannot be ` +
          `satisfied by this build (canvas renderer only). Use { format: 'png' }.`,
      );
    }
    const scale = Math.max(0.1, Math.min(8, opts?.scale ?? 2));
    const background = opts?.background ?? this.theme.surface;
    const L = this.layoutState;
    const doc = this.root.ownerDocument;
    const canvas = doc.createElement('canvas');
    const renderer = new CanvasRenderer(canvas);
    try {
      renderer.resize(L.width, L.height, scale);
      // Paint the CURRENT frame (target geometry, not a mid-animation one).
      this.paint(renderer, this.geom.pos, this.geom.slices, background);
    } finally {
      renderer.destroy();
    }
    return canvasToBlob(canvas, 'image/png');
  }

  /**
   * Programmatic zoom: sets the viewport (continuous axes only), re-runs
   * downsampling against the visible window, re-lays out, repaints and emits
   * the `zoom` event. `null` resets.
   */
  zoomTo(range: ZoomRange): void {
    if (this.destroyed) return;
    const vp = normalizeViewport(range);
    this.applyViewport(vp);
    this.emitter.emit('zoom', vp === null ? null : { ...(vp.x ? { x: vp.x } : {}), ...(vp.y ? { y: vp.y } : {}) });
  }

  // --------------------------------------------------------- viewport (zoom)

  /**
   * Apply a viewport and re-run model -> layout -> paint. Emits `render`, but
   * NOT `zoom` (public `zoomTo` owns the event so decorators can batch).
   */
  private applyViewport(v: Viewport | null): void {
    if (this.destroyed) return;
    this.viewport = normalizeViewport(v);
    // v0.3.2 (E-7): a zoom gesture re-slices the retained points; it does NOT
    // re-ingest the caller's data. `rewindowModel` returns null for the shapes
    // where that is not obviously equivalent (a stacked model, a band x axis),
    // and then this is the old full rebuild.
    this.model =
      rewindowModel(this.model, this.opts, this.viewport) ??
      buildModel(this.opts, this.paletteSlots, this.viewport);
    this.invalidateA11y();
    this.hover = null;
    this.focus = null;
    this.tooltip.hide();
    this.animator.cancel();
    this.computeLayout();
    this.syncDom();
    this.drawFrame(this.geom.pos, this.geom.slices);
    this.emitter.emit('render', { reason: 'update' });
  }

  // -------------------------------------------------------------- decorators

  /**
   * Context handed to every pipeline-level decorator pass.
   *
   * `host` is the live DOM host — or **null** when the pass is painting through
   * a renderer that is not the mounted canvas, which is what keeps
   * `exportImage()` isolated: an offscreen export cannot reach the live DOM.
   */
  private decoratorContext(r: Renderer, geom: TypeGeom, host?: DecoratorHost | null): DecoratorContext {
    const L = this.layoutState;
    return {
      r,
      theme: this.theme,
      opts: this.opts,
      model: this.model,
      layout: L,
      plot: L.plot,
      xScale: L.xScale,
      yScale: L.yScale,
      geom,
      hover: this.hover,
      def: this.def,
      viewport: this.viewport,
      host: host !== undefined ? host : r === this.renderer ? this.decoratorHost() : null,
      emit: (type, ev) => this.emitter.emit(type, ev),
    };
  }

  /**
   * The chart's decorator host. Created once and reused: decorators key their
   * per-instance state on this object identity (the zoom decorator's gesture
   * state), so it must be stable for the chart's whole lifetime.
   */
  private decoratorHost(): DecoratorHost {
    if (this.hostRef) return this.hostRef;
    this.hostRef = {
      canvas: this.canvas,
      root: this.root,
      el: this.el,
      context: () => this.decoratorContext(this.renderer, this.geom),
      requestRender: () => this.scheduleHoverDraw(),
      setViewport: (v) => this.applyViewport(v),
      getViewport: () => this.viewport,
      setGestureLock: (locked) => this.setGestureLock(locked),
      emit: (type, ev) => this.emitter.emit(type, ev),
    };
    return this.hostRef;
  }

  /** One-time per-instance decorator lifecycle (listeners live here only). */
  private attachDecorators(): void {
    const host = this.decoratorHost();
    for (const d of decorators()) {
      if (!d.attach) continue;
      const off = d.attach(host);
      if (typeof off === 'function') this.decoratorTeardowns.push(off);
    }
  }

  /** Extra legend entries contributed by decorators (in decorator order). */
  private decoratorLegendItems(): LegendItem[] {
    const list = decorators().filter((d) => d.legendItems);
    if (list.length === 0) return [];
    const dctx = this.decoratorContext(this.renderer, this.geom);
    const out: LegendItem[] = [];
    for (const d of list) {
      if (!decoratorApplies(d, dctx)) continue;
      out.push(...(d.legendItems?.(dctx) ?? []));
    }
    return out;
  }

  /**
   * Give decorators first refusal on a click (annotations claim their own hit
   * targets). Topmost-drawn wins, so the list is walked in reverse.
   */
  private decoratorClick(px: number, py: number, native: MouseEvent): boolean {
    const list = decorators().filter((d) => d.onClick);
    if (list.length === 0) return false;
    const dctx = this.decoratorContext(this.renderer, this.geom);
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (!d || !decoratorApplies(d, dctx)) continue;
      if (d.onClick?.(dctx, px, py, native) === true) return true;
    }
    return false;
  }

  /** Draw one decoration layer (definition stage first, then the list). */
  private runDecorations(layer: DecorationLayer, ctx: RenderContext, host: DecoratorHost | null): void {
    this.def.decorations?.(ctx, layer);
    const list = decorators(layer);
    if (list.length === 0) return;
    const dctx = this.decoratorContext(ctx.r, ctx.geom, host);
    for (const d of list) {
      if (decoratorApplies(d, dctx)) d.draw(dctx);
    }
  }

  // ------------------------------------------------------------ theme watch

  /**
   * The theme actually painted with: the caller's resolved theme, re-expressed
   * in CSS system colors when `forced-colors: active`.
   *
   * Forced colors is a USER preference that overrides authored color the way it
   * overrides author CSS, so it applies to `theme: 'dark'` and to a fully custom
   * `Theme` object alike — the resolution order is caller first, user last.
   */
  private themeFor(opts: ResolvedOptions): Theme {
    const base = resolveTheme(opts.theme);
    return forcedColorsActive() ? forcedColorsTheme(base) : base;
  }

  private watchThemeIfAuto(): void {
    this.unwatchScheme();
    this.unwatchScheme = () => {};
    const t = this.opts.theme;
    if (t === undefined || t === 'auto') {
      this.unwatchScheme = watchColorScheme(() => {
        if (this.destroyed) return;
        this.theme = this.themeFor(this.opts);
        this.refresh('update', false, false);
      });
    }
  }

  /**
   * Forced-colors is watched for the chart's whole life, whatever `theme` says:
   * unlike `prefers-color-scheme` (which only matters when the caller delegated
   * the choice with `'auto'`), forced colors overrides an explicit theme too, so
   * there is no configuration under which we may stop listening. Canvas pixels
   * are NOT re-mapped by the browser, so a chart that ignored this event would
   * keep painting its authored palette into a high-contrast desktop.
   */
  private watchForcedColorsAlways(): void {
    this.unwatchForced();
    this.unwatchForced = watchForcedColors(() => {
      if (this.destroyed) return;
      this.theme = this.themeFor(this.opts);
      this.refresh('update', false, false);
    });
  }

  // ---------------------------------------------------------------- pipeline

  /**
   * Re-run pipeline stages and paint.
   *
   * `prebuilt` carries a model + layout that `update()` already computed (and
   * therefore already proved does not throw) so the trial run is not repeated.
   */
  private refresh(
    reason: RenderReason,
    modelDirty: boolean,
    animate = true,
    prebuilt?: { model: DataModel; layout: Layout; geom: TypeGeom; legendShow: boolean | null },
  ): void {
    if (this.destroyed) return;
    // Retain previous screen-space model for animation.
    const prevPosById = new Map<string, (PointPos | null)[]>();
    if (this.model) {
      this.model.series.forEach((s, si) => {
        const p = this.geom.pos[si];
        if (p) prevPosById.set(s.id, p);
      });
    }
    const prevSlices = this.geom.slices;
    const hadPrev = this.lastSize !== null;

    if (modelDirty || !this.model) {
      this.model = prebuilt ? prebuilt.model : buildModel(this.opts, this.paletteSlots, this.viewport);
      this.invalidateA11y();
      this.focus = null;
      this.hover = null;
      this.tooltip.hide();
    }
    this.computeLayout(prebuilt);
    this.syncDom();

    const anim = this.opts.animation;
    const duration = anim.enabled && animate && !prefersReducedMotion() ? anim.duration : 0;

    if (duration > 0 && reason !== 'resize') {
      const targetPos = this.geom.pos;
      const targetSlices = this.geom.slices;
      const frame = (t: number) => {
        if (this.destroyed) return;
        this.drawFrame(
          this.interpolatePos(prevPosById, targetPos, t),
          this.interpolateSlices(prevSlices, targetSlices, hadPrev, t),
        );
      };
      frame(0);
      this.animator.start(duration, anim.easing, frame, () => {
        if (!this.destroyed) this.drawFrame(targetPos, targetSlices);
      });
    } else {
      this.animator.cancel();
      this.drawFrame(this.geom.pos, this.geom.slices);
    }
    this.emitter.emit('render', { reason });
  }

  private interpolatePos(
    prevById: Map<string, (PointPos | null)[]>,
    target: (PointPos | null)[][],
    t: number,
  ): (PointPos | null)[][] {
    if (t >= 1) return target;
    return this.model.series.map((s, si) => {
      const next = target[si] ?? [];
      const prev = prevById.get(s.id);
      return next.map((p, pi) => {
        if (!p) return null;
        // Entering points (no previous position) rise from the baseline.
        const from = prev?.[pi] ?? { x: p.x, y: p.y0, y0: p.y0 };
        return {
          x: lerp(from.x, p.x, t),
          y: lerp(from.y, p.y, t),
          y0: lerp(from.y0, p.y0, t),
        };
      });
    });
  }

  private interpolateSlices(
    prev: PieSlice[] | null,
    target: PieSlice[] | null,
    hadPrev: boolean,
    t: number,
  ): PieSlice[] | null {
    if (!target || t >= 1) return target;
    return target.map((s) => {
      const q = hadPrev && prev ? prev.find((ps) => ps.pi === s.pi) : undefined;
      if (q) {
        return { ...s, a0: lerp(q.a0, s.a0, t), a1: lerp(q.a1, s.a1, t), r1: lerp(q.r1, s.r1, t) };
      }
      // Entering: sweep out from the start angle.
      return { ...s, a0: lerp(START_ANGLE, s.a0, t), a1: lerp(START_ANGLE, s.a1, t) };
    });
  }

  // ------------------------------------------------------------------ layout

  private measuredSize(opts: ResolvedOptions = this.opts): { width: number; height: number } {
    const width = opts.width ?? (this.wrap.clientWidth || this.el.clientWidth || 640);
    const height = opts.height ?? (this.wrap.clientHeight || this.el.clientHeight || 400);
    return { width: Math.max(40, width), height: Math.max(40, height) };
  }

  private topExtra(opts: ResolvedOptions = this.opts, t: Theme = this.theme): number {
    let extra = 0;
    if (opts.title) extra += t.fontSize + 6 + 6;
    if (opts.subtitle) extra += t.fontSize + 4;
    if (extra > 0) extra += 6;
    return extra;
  }

  /**
   * Run the layout stages against EXPLICIT options/theme/model and return the
   * result without touching retained state. Extracted from `computeLayout` so
   * `update()` can trial a payload (a type's `layout` stage may reject it) and
   * commit only on success — see `update`.
   */
  private buildLayout(
    opts: ResolvedOptions,
    theme: Theme,
    model: DataModel,
  ): { layout: Layout; geom: TypeGeom; legendShow: boolean | null } {
    const def = getChartType(opts.type);
    const { width, height } = this.measuredSize(opts);
    const topExtra = this.topExtra(opts, theme);
    const measure = (text: string, font: string): number => this.renderer.measure(text, font);
    const chrome = resolveAxisChrome(def.needs);
    const arrangement = axisArrangement(def.needs, model.horizontal ?? opts.horizontal);

    const layout = def.needs.cartesianAxes
      ? computeCartesianLayout({
          width,
          height,
          topExtra,
          opts,
          model,
          theme,
          measure,
          axisChrome: chrome,
          arrangement,
          viewport: model.viewport,
        })
      : computePlainLayout({ width, height, topExtra, padding: opts.padding, viewport: model.viewport });

    const geom = def.layout({ opts, theme, model, layout, measure });

    // v0.3 `resolveLegend` stage: a legend decision that needs MEASURED layout
    // (slope's direct end labels). It runs strictly between `layout()` and
    // `syncDom()`, so `layout()` never has to mutate the resolved options.
    const show = def.resolveLegend?.({ opts, theme, model, layout, geom });
    return { layout, geom, legendShow: typeof show === 'boolean' ? show : null };
  }

  private computeLayout(prebuilt?: { layout: Layout; geom: TypeGeom; legendShow: boolean | null }): void {
    const built = prebuilt ?? this.buildLayout(this.opts, this.theme, this.model);
    this.layoutState = built.layout;
    this.geom = built.geom;
    if (built.legendShow !== null) this.opts.legend.show = built.legendShow;
  }

  // -------------------------------------------------------------------- DOM

  private syncDom(): void {
    const o = this.opts;
    const t = this.theme;
    const m = this.model;
    const doc = this.root.ownerDocument;

    this.root.style.background = t.surface;
    this.root.style.flexDirection = o.legend.position === 'right' ? 'row' : 'column';

    // Recomputed here so an `update()` that turns zoom on (or changes its axis)
    // takes effect immediately — `touchAction` reads the RESOLVED options.
    this.canvas.style.touchAction = this.touchAction();

    // Legend content comes from the type definition: item entries (series
    // for cartesian charts, non-toggleable slices for pie/donut, ...) or a
    // custom element (heatmap's gradient color scale) mounted in the items'
    // place — the legend.show policy applies to both.
    const legendCustom = this.def.legendCustomEl?.(this.geomContext(), doc) ?? null;
    if (legendCustom) {
      this.legend.update([], t, o.legend);
      if (o.legend.show) this.legend.el.appendChild(legendCustom);
    } else {
      // Decorators may append entries (a trendline is legend-labeled so it can
      // never be mistaken for observed data) — always AFTER the type's items.
      this.legend.update(
        [...this.withSeriesEncoding(this.def.legendItems(this.geomContext())), ...this.decoratorLegendItems()],
        t,
        o.legend,
      );
    }
    if (o.legend.position === 'top') {
      if (this.root.firstChild !== this.legend.el) this.root.insertBefore(this.legend.el, this.wrap);
    } else {
      // bottom / right: legend after the canvas wrap.
      if (this.legend.el.previousSibling !== this.wrap) this.root.insertBefore(this.legend.el, this.wrap.nextSibling);
    }

    // Canvas aria.
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    if (o.a11y.keyboard) {
      this.canvas.tabIndex = 0;
      this.canvas.style.outline = 'none';
    } else {
      this.canvas.removeAttribute('tabindex');
    }

    // Description: the caller's text, the type's own `a11yDescription` stage
    // and every decorator's, in that order, in ONE node. Features never add a
    // second hidden node or a second aria-describedby token.
    const description = this.describe();
    if (description) {
      if (!this.descEl) {
        this.descEl = doc.createElement('div');
        this.descEl.id = this.descId;
        visuallyHide(this.descEl);
        this.root.appendChild(this.descEl);
      }
      this.descEl.textContent = description;
      this.canvas.setAttribute('aria-describedby', this.descId);
    } else if (this.descEl) {
      this.descEl.remove();
      this.descEl = null;
      this.canvas.removeAttribute('aria-describedby');
    }

    // Data table fallback (content supplied by the type definition).
    //
    // Rebuilt only when the DATA behind it changed, never merely because a frame
    // was painted. `syncDom` runs on every resize, theme switch and legend
    // toggle; re-materializing one `<tr>` per datum each time made a large
    // series' redraw cost scale with its row count — and the table now carries
    // the FULL series, so that cost is no longer bounded by the downsample
    // threshold. The mode is tracked too, since 'hidden' -> 'visible' restyles
    // the same content.
    if (this.tableDirty || this.tableMode !== o.a11y.table) {
      this.tableWrap.textContent = '';
      if (o.a11y.table !== 'off') {
        // The DOM can only materialize `tableMaxRows` of them, so that is all
        // the definition is asked to build (v0.3.2, E-8).
        const table = buildDataTable(
          doc,
          o.title ?? this.ariaLabel(),
          this.a11yTableSpec(o.a11y.tableMaxRows),
          o.a11y.tableMaxRows,
        );
        if (o.a11y.table === 'hidden') {
          visuallyHide(this.tableWrap);
        } else {
          this.tableWrap.removeAttribute('style');
          table.style.font = `${t.fontSize}px ${t.fontFamily}`;
          table.style.color = t.textPrimary;
          table.style.borderCollapse = 'collapse';
        }
        this.tableWrap.appendChild(table);
      } else {
        visuallyHide(this.tableWrap);
      }
      this.tableDirty = false;
      this.tableMode = o.a11y.table;
    } else if (o.a11y.table === 'visible') {
      // Content unchanged, but the theme may have. Restyle in place.
      const table = this.tableWrap.querySelector('table');
      if (table instanceof HTMLTableElement) {
        table.style.font = `${t.fontSize}px ${t.fontFamily}`;
        table.style.color = t.textPrimary;
      }
    }

    this.tooltip.applyTheme(t);
  }

  /**
   * Carry each series' composite encoding onto its legend entry.
   *
   * Applied centrally rather than in all 39 `legendItems` stages, because it is
   * a PIPELINE policy about the palette (`model.ts#seriesDash`), not something a
   * chart type gets an opinion about. Items whose id names no series (pie
   * slices, decorator entries) pass through untouched.
   */
  private withSeriesEncoding(items: readonly LegendItem[]): LegendItem[] {
    return items.map((it) => {
      const s = this.model.series.find((x) => x.id === it.id);
      const dash = s ? seriesDash(s, this.theme) : undefined;
      return dash ? { ...it, dash } : it;
    });
  }

  /**
   * The chart's accessible NAME.
   *
   * The generic summary needs facts only the pipeline can gather: how many marks
   * this type's own keyboard geometry actually reaches (NOT `model.maxLen`,
   * which is wrong for every type whose marks are not one-per-point), and the
   * value range formatted with the axis formatter the caller configured. A type
   * with a better noun for its marks overrides the whole clause through its
   * `a11ySummary` stage.
   */
  private ariaLabel(): string {
    const m = this.model;
    const nav = this.def.keyboardNav(m);
    let marks = 0;
    for (let si = 0; si < nav.seriesCount; si++) {
      if (nav.isVisible(si)) marks += nav.pointCount(si);
    }
    // `'rows'` declares "this type has NO value axis" (gantt: task rows against
    // a time axis). Its `model.yDomain` holds whatever the generic extent pass
    // scraped — for gantt, epoch milliseconds, which the label announced as
    // "values from 1767.23B to 1768.18B". No value axis, no range clause.
    const hasValueAxis = this.arrangement !== 'rows';
    return generateAriaLabel(this.opts, m, {
      marks,
      valueRange: hasValueAxis ? m.yDomain : null,
      typeSummary: this.def.a11ySummary?.(this.geomContext()) ?? null,
      formatValue: (v) => this.formatYValue(v),
    });
  }

  /**
   * The chart's full accessible description: `a11y.description`, then the type
   * definition's `a11yDescription` stage, then every applying decorator's.
   * Empty string when nobody has anything to say.
   */
  private describe(): string {
    const parts: string[] = [];
    if (this.opts.a11y.description) parts.push(this.opts.a11y.description);
    const own = this.def.a11yDescription?.(this.geomContext());
    if (own) parts.push(own);
    // How the drawn marks relate to the tabulated data, when they differ.
    const sampling = this.samplingNote();
    if (sampling) parts.push(sampling);
    parts.push(...decoratorDescriptions(this.decoratorContext(this.renderer, this.geom)));
    return parts.join(' ');
  }

  // ------------------------------------------------------------------- paint

  private drawFrame(pos: (PointPos | null)[][], slices: PieSlice[] | null): void {
    const L = this.layoutState;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (!this.lastSize || this.lastSize.w !== L.width || this.lastSize.h !== L.height || this.lastSize.dpr !== dpr) {
      this.renderer.resize(L.width, L.height, dpr);
      this.lastSize = { w: L.width, h: L.height, dpr };
    }
    this.paint(this.renderer, pos, slices);
  }

  /**
   * Paint one full frame through an arbitrary renderer (the live canvas, or an
   * offscreen one for `exportImage`). Stage order — the ONE place overlay
   * ordering is defined:
   *
   *   surface -> title/subtitle -> grid -> 'under' decorations -> marks
   *   -> axis chrome -> 'over' decorations
   *
   * Within each decoration layer the type's own `decorations(ctx, layer)` runs
   * first, then the registered `Decorator`s in `order` (ascending).
   */
  private paint(
    r: Renderer,
    pos: (PointPos | null)[][],
    slices: PieSlice[] | null,
    background?: string,
  ): void {
    const t = this.theme;
    const L = this.layoutState;
    r.clear(background ?? t.surface);

    // Title / subtitle in ink colors.
    const o = this.opts;
    let ty = o.padding.top;
    if (o.title) {
      r.text(o.title, o.padding.left, ty, {
        font: `600 ${t.fontSize + 4}px ${t.fontFamily}`,
        color: t.textPrimary,
        baseline: 'top',
      });
      ty += t.fontSize + 6 + 6;
    }
    if (o.subtitle) {
      r.text(o.subtitle, o.padding.left, ty, {
        font: `${t.fontSize}px ${t.fontFamily}`,
        color: t.textSecondary,
        baseline: 'top',
      });
    }

    const ctx: RenderContext = {
      r,
      theme: t,
      model: this.model,
      opts: o,
      layout: L,
      geom: { ...this.geom, pos, slices },
      hover: this.hover,
    };

    // Per-axis chrome: an axis whose switch is off draws no line, no tick
    // labels, no title and no gridlines.
    const chrome = this.axisChrome;
    const host = r === this.renderer ? this.decoratorHost() : null;
    if (hasAxisChrome(chrome)) drawGrid(r, L, t, o, chrome);
    this.runDecorations('under', ctx, host);
    this.def.render(ctx);
    if (hasAxisChrome(chrome)) drawAxes(r, L, t, o, chrome);
    this.runDecorations('over', ctx, host);
  }

  private scheduleHoverDraw(): void {
    if (this.hoverRaf !== null) return;
    this.hoverRaf = raf(() => {
      this.hoverRaf = null;
      if (this.destroyed || this.animator.running) return;
      this.drawFrame(this.geom.pos, this.geom.slices);
    });
  }

  private scheduleResize(): void {
    if (this.resizeRaf !== null) return;
    this.resizeRaf = raf(() => {
      this.resizeRaf = null;
      if (this.destroyed) return;
      this.resize();
    });
  }

  // ------------------------------------------------------------- interaction

  private canvasPoint(e: { clientX: number; clientY: number }): { px: number; py: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  /**
   * The canvas's `touch-action`, i.e. which gestures the BROWSER keeps.
   *
   * POLICY (v0.3.3) — the default is `pan-y`, never `none`:
   *
   * - `auto` (the old, unset value) is broken: the browser waits to see whether
   *   a touch is a scroll, then fires `pointercancel` and stops delivering
   *   pointer events, so a scrub along a line never reaches us at all. This is
   *   also why the bug reproduced in DevTools device emulation, which applies
   *   real `touch-action` semantics.
   * - `none` everywhere is worse than the bug it fixes. Charts are large on a
   *   phone — frequently most of the viewport — so a user swiping vertically to
   *   scroll the page would find the page pinned wherever a chart is under
   *   their thumb. Trapping the document to serve a tooltip is not a trade we
   *   are willing to make.
   * - `pan-y` keeps VERTICAL page scrolling with the browser (the gesture users
   *   need most and expect to always work) and hands us everything else: taps,
   *   long presses, and horizontal drags — which is precisely the axis a
   *   scrub, a brush and a pan use on a time-series chart.
   *
   * It escalates to `none` in exactly two cases, both of which genuinely need
   * both axes and neither of which is on by default:
   *
   * 1. `zoom` with `axis: 'y' | 'xy'` and a drag gesture enabled — a vertical
   *    brush/pan IS a vertical drag, so it cannot coexist with `pan-y`.
   * 2. While a brush/pan drag is actually in progress (`gestureLock`), so that a
   *    gesture that started horizontally is not stolen mid-drag when the finger
   *    wanders vertically.
   */
  private touchAction(): string {
    if (this.gestureLock) return 'none';
    const z = this.opts.zoom;
    if (z.enabled && (z.axis === 'y' || z.axis === 'xy') && (z.drag || z.pan)) return 'none';
    return 'pan-y';
  }

  /** `DecoratorHost.setGestureLock` — see `touchAction`. */
  private setGestureLock(locked: boolean): void {
    if (this.destroyed || this.gestureLock === locked) return;
    this.gestureLock = locked;
    this.canvas.style.touchAction = this.touchAction();
  }

  /**
   * Hit-test at the canvas point, with the hit radius this POINTER deserves:
   * 24px for a cursor or a stylus, 44px for a fingertip. See
   * `interaction/hittest.ts` for why the radius is ambient rather than a
   * parameter of all 39 `hitTest` stages.
   */
  private hitTest(px: number, py: number, e?: Event | null): HoverState | null {
    const r = coarsePointer(e) ? COARSE_HIT_RADIUS : HIT_RADIUS;
    return withHitRadius(r, () => this.def.hitTest(this.geomContext(), px, py));
  }

  /** Best-effort pointer capture: absent in jsdom, and stale ids throw. */
  private capturePointer(e: PointerEvent | MouseEvent): void {
    const id = (e as PointerEvent).pointerId;
    const el = this.canvas as HTMLCanvasElement & { setPointerCapture?: (id: number) => void };
    if (typeof id !== 'number' || typeof el.setPointerCapture !== 'function') return;
    try {
      el.setPointerCapture(id);
    } catch {
      // Capture is an optimization, never a correctness requirement.
    }
  }

  private releasePointer(e: PointerEvent | MouseEvent): void {
    const id = (e as PointerEvent).pointerId;
    const el = this.canvas as HTMLCanvasElement & {
      releasePointerCapture?: (id: number) => void;
      hasPointerCapture?: (id: number) => boolean;
    };
    if (typeof id !== 'number' || typeof el.releasePointerCapture !== 'function') return;
    try {
      if (el.hasPointerCapture?.(id) !== false) el.releasePointerCapture(id);
    } catch {
      // Already released implicitly by `pointerup` — nothing to undo.
    }
  }

  private pointEventFor(si: number, pi: number, clientX: number, clientY: number, native: Event | null): PointEvent | null {
    const s = this.model.series[si];
    const p = s?.points[pi];
    if (!s || !p) return null;
    return {
      seriesId: s.id,
      seriesName: s.name,
      dataIndex: pi,
      x: p.x,
      y: p.y,
      clientX,
      clientY,
      native,
    };
  }

  /**
   * TAP TO INSPECT (touch/pen only).
   *
   * A finger never hovers, so this is the touch equivalent of the first
   * `pointermove` a mouse would have produced: it sets hover, emits
   * `pointenter` and shows the tooltip at the contact point. Everything after
   * that is shared with the mouse path — including `pointermove` while the
   * finger stays down, which is what makes scrubbing along a line work.
   *
   * Returns immediately for a mouse: a mouse has already hovered by the time it
   * presses, so `pointerdown` has nothing to add and must not change anything.
   */
  private handlePointerDown(e: PointerEvent | MouseEvent): void {
    if (this.destroyed || pointerKindOf(e) === 'mouse') return;
    // Ignore a second finger: the first one owns the inspection.
    const id = (e as PointerEvent).pointerId;
    if (this.touchPointerId !== null && typeof id === 'number' && id !== this.touchPointerId) return;
    this.touchPointerId = typeof id === 'number' ? id : 0;
    // A new tap supersedes whatever the last one left on screen.
    this.disarmTouchDismiss();
    // Keep the gesture even if the finger slides off the canvas mid-scrub.
    this.capturePointer(e);
    this.inspectAt(e);
  }

  /**
   * A touch's `pointerup`. The inspection deliberately SURVIVES it: a mouse
   * user keeps the tooltip by keeping the cursor still, and the touch
   * equivalent of "keep it" is "do not take it away the instant the finger
   * lifts" — otherwise the tooltip is visible only while it is covered by the
   * finger that summoned it. It is dismissed by the next tap outside the chart,
   * by a scroll, or replaced by the next tap inside it.
   */
  private handlePointerUp(e: PointerEvent | MouseEvent): void {
    if (this.destroyed || pointerKindOf(e) === 'mouse') return;
    this.releasePointer(e);
    this.touchPointerId = null;
    if (this.hover || this.tooltip.visible) this.armTouchDismiss();
  }

  /**
   * The gesture was taken away from us (the UA decided it was a scroll, a
   * system gesture interrupted it, the pointer was destroyed). No `pointerup`
   * and no `pointerleave` follow, so this is the ONLY chance to drop the hover
   * state — without it a cancelled touch leaves a stale highlight and a tooltip
   * pinned to a point the user is no longer touching.
   */
  private handlePointerCancel(e: PointerEvent | MouseEvent): void {
    if (this.destroyed) return;
    this.releasePointer(e);
    this.touchPointerId = null;
    this.disarmTouchDismiss();
    this.clearHover();
  }

  /** Set hover + tooltip from a pointer event's position. */
  private inspectAt(e: PointerEvent | MouseEvent): void {
    this.handlePointerMove(e);
  }

  private handlePointerMove(e: PointerEvent | MouseEvent): void {
    if (this.destroyed) return;
    // While a finger is down, only THAT finger scrubs.
    const id = (e as PointerEvent).pointerId;
    if (
      this.touchPointerId !== null &&
      pointerKindOf(e) !== 'mouse' &&
      typeof id === 'number' &&
      id !== this.touchPointerId
    ) {
      return;
    }
    const { px, py } = this.canvasPoint(e);
    const hit = this.hitTest(px, py, e);
    const changed = (hit?.si !== this.hover?.si || hit?.pi !== this.hover?.pi) && !(hit === null && this.hover === null);
    if (changed) {
      if (this.hover) {
        const ev = this.pointEventFor(this.hover.si, this.hover.pi, e.clientX, e.clientY, e);
        if (ev) this.emitter.emit('pointleave', ev);
      }
      this.hover = hit;
      if (hit) {
        const ev = this.pointEventFor(hit.si, hit.pi, e.clientX, e.clientY, e);
        if (ev) this.emitter.emit('pointenter', ev);
      }
      this.scheduleHoverDraw();
    }
    // A finger sits ON the point it is inspecting, so a tooltip placed below
    // the contact (the mouse default) is under the fingertip. Touch/pen prefer
    // above; `Tooltip.position` still flips when there is no room.
    const prefer = pointerKindOf(e) === 'mouse' ? 'below' : 'above';
    if (hit && this.opts.tooltip.show) {
      this.showTooltipFor(hit, e.clientX, e.clientY, prefer);
    } else if (!hit) {
      this.tooltip.hide();
    } else if (this.tooltip.visible) {
      this.tooltip.position(e.clientX, e.clientY, prefer);
    }
  }

  /**
   * `pointerleave` — and `blur`, which passes no event at all.
   *
   * On touch this fires the INSTANT the finger lifts (the implicit pointer
   * capture is released and the pointer ceases to exist), so treating it as
   * "the user moved away" would hide every tooltip a tap ever showed, roughly
   * one frame after showing it. For touch/pen the inspection is kept and the
   * document-level dismissal is armed instead; the mouse path is untouched.
   */
  private handlePointerLeave(e?: Event): void {
    if (this.destroyed) return;
    if (pointerKindOf(e) !== 'mouse' && (this.hover !== null || this.tooltip.visible)) {
      this.armTouchDismiss();
      return;
    }
    this.clearHover();
  }

  /** Drop hover/focus/tooltip and repaint. The mouse `pointerleave` behavior. */
  private clearHover(): void {
    if (this.hover) {
      const ev = this.pointEventFor(this.hover.si, this.hover.pi, -1, -1, null);
      if (ev) this.emitter.emit('pointleave', ev);
    }
    this.hover = null;
    this.focus = null;
    this.tooltip.hide();
    this.scheduleHoverDraw();
  }

  // ------------------------------------------------- touch dismissal (document)

  /**
   * Mount the "this inspection is over" listeners.
   *
   * They have to be on the DOCUMENT because the events that end a touch
   * inspection happen outside the chart: a tap somewhere else on the page, or a
   * scroll (which does not bubble, hence the capture phase). They are mounted
   * lazily — a chart that is only ever used with a mouse never adds them — and
   * are removed on the next tap, on dismissal and unconditionally in
   * `destroy()`.
   */
  private armTouchDismiss(): void {
    if (this.touchDismissArmed || this.destroyed) return;
    const doc = this.root.ownerDocument;
    doc.addEventListener('pointerdown', this.onDocPointerDown, true);
    doc.addEventListener('scroll', this.onDocScroll, true);
    this.touchDismissArmed = true;
  }

  private disarmTouchDismiss(): void {
    if (!this.touchDismissArmed) return;
    const doc = this.root.ownerDocument;
    doc.removeEventListener('pointerdown', this.onDocPointerDown, true);
    doc.removeEventListener('scroll', this.onDocScroll, true);
    this.touchDismissArmed = false;
  }

  /** A tap that landed outside this chart ends the inspection. */
  private handleDocumentPointerDown(e: Event): void {
    const target = e.target;
    // Inside the chart: the canvas's own `pointerdown` re-inspects instead.
    if (target instanceof Node && this.root.contains(target)) return;
    this.dismissTouchInspection();
  }

  private dismissTouchInspection(): void {
    if (this.destroyed) return;
    this.disarmTouchDismiss();
    this.clearHover();
  }

  private handleClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const { px, py } = this.canvasPoint(e);
    // Decorators (annotations) claim clicks before datum hit-testing.
    if (this.decoratorClick(px, py, e)) return;
    // A `click` is a MouseEvent even when a tap synthesized it, so it carries no
    // `pointerType` — `coarsePointer` falls back to the media query here, which
    // is the right answer on a phone and on a desktop alike.
    const hit = this.hitTest(px, py, e);
    if (hit) {
      const ev = this.pointEventFor(hit.si, hit.pi, e.clientX, e.clientY, e);
      if (ev) this.emitter.emit('pointclick', ev);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.destroyed || !this.opts.a11y.keyboard) return;
    const action = navigate(e.key, this.focus, this.def.keyboardNav(this.model));
    if (action.kind === 'none') return;
    e.preventDefault();

    if (action.kind === 'clear') {
      if (this.focus) {
        const ev = this.pointEventFor(this.focus.si, this.focus.pi, -1, -1, null);
        if (ev) this.emitter.emit('pointleave', ev);
      }
      this.focus = null;
      this.hover = null;
      this.tooltip.hide();
      this.announcer.announce('');
      this.scheduleHoverDraw();
      return;
    }

    if (action.kind === 'activate') {
      const ev = this.pointEventFor(action.pos.si, action.pos.pi, -1, -1, null);
      if (ev) this.emitter.emit('pointclick', ev);
      return;
    }

    // move
    if (this.focus) {
      const prev = this.pointEventFor(this.focus.si, this.focus.pi, -1, -1, null);
      if (prev) this.emitter.emit('pointleave', prev);
    }
    this.focus = action.pos;
    this.hover = action.pos;
    const ev = this.pointEventFor(action.pos.si, action.pos.pi, -1, -1, null);
    if (ev) this.emitter.emit('pointenter', ev);
    this.announceFocus(action.pos);
    if (this.opts.tooltip.show) {
      const rect = this.canvas.getBoundingClientRect();
      const p = this.geom.pos[action.pos.si]?.[action.pos.pi];
      const slice = this.geom.slices?.find((s) => s.pi === action.pos.pi);
      const cx = p ? rect.left + p.x : slice ? rect.left + slice.cx : rect.left;
      const cy = p ? rect.top + p.y : slice ? rect.top + slice.cy : rect.top;
      this.showTooltipFor(action.pos, cx, cy);
    }
    this.scheduleHoverDraw();
  }

  private announceFocus(pos: NavPosition): void {
    const custom = this.def.announce?.(this.geomContext(), pos);
    if (custom !== undefined && custom !== null) {
      this.announcer.announce(custom);
      return;
    }
    const s = this.model.series[pos.si];
    const p = s?.points[pos.pi];
    if (!s || !p) return;
    const xLabel = this.formatXValue(p.x);
    const yLabel = p.y === null ? 'no value' : formatValue(p.y);
    this.announcer.announce(
      `${xLabel}: ${yLabel}. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`,
    );
  }

  // ---------------------------------------------------------------- tooltip

  /**
   * Format an x value the way this chart's DATA AXIS reads it.
   *
   * v0.3.2 (E-5): on a TIME axis a bare number is epoch milliseconds — by the
   * type's own `needs.xScale: 'time'` declaration, never by sniffing the
   * magnitude. This one call site serves the tooltip header AND the generic
   * keyboard announcement, so both agree with the tick labels.
   */
  private formatXValue(x: number | Date | string | null): string {
    const fmt = this.opts.xAxis.ticks?.format;
    if (x !== null && fmt) return fmt(x);
    const span = this.model.xDomain ? Math.abs(this.model.xDomain[1] - this.model.xDomain[0]) : 0;
    return formatTemporal(x, this.model.xType === 'time', span);
  }

  /**
   * Format a data VALUE with the axis that actually carries values for this
   * chart type. The role assignment is the registry's (`valueAxisOf`), not a
   * `model.horizontal` guess — a type that is neither vertical nor
   * `horizontal: true` (a mirrored pyramid, task rows) declares `needs.axes`
   * and gets the right formatter without post-processing its tooltip.
   */
  private formatYValue(y: number | null): string {
    if (y === null) return '—';
    const fmt = valueAxisOf(this.def.needs, this.opts, this.model.horizontal).ticks?.format;
    return fmt ? fmt(y) : formatValue(y);
  }

  /**
   * Pipeline-built tooltip point for a datum: series identity, palette
   * color, category-aware x formatting. Type definitions post-process
   * (slice labels, OHLC blocks, ...) in their tooltipPoints stage.
   */
  private tooltipPointFor(si: number, pi: number): TooltipPoint | null {
    const m = this.model;
    const s = m.series[si];
    const p = s?.points[pi];
    if (!s || !p) return null;
    let color = seriesColor(s, this.theme);
    let formattedX = this.formatXValue(p.x);
    if (m.xType === 'category') {
      const cat = m.categories?.[bandIndexFor(m, p.xv, pi)];
      if (cat !== undefined) formattedX = formatCategory(cat, categoryAxisOf(this.def.needs, this.opts, m.horizontal));
    }
    if (p.color) color = p.color;
    return {
      seriesId: s.id,
      seriesName: s.name,
      color,
      x: p.x,
      y: p.y,
      formattedX,
      formattedY: this.formatYValue(p.y),
    };
  }

  private showTooltipFor(
    hit: HoverState,
    clientX: number,
    clientY: number,
    prefer: 'below' | 'above' = 'below',
  ): void {
    const typePoints = this.def.tooltipPoints(
      {
        ...this.geomContext(),
        pointFor: (si, pi) => this.tooltipPointFor(si, pi),
      },
      hit,
    );
    // Decorators enrich the points (error-bar intervals) BEFORE the caller's
    // formatter sees them — no wrapping of `opts.tooltip.format`.
    const points = applyDecoratorTooltipPoints(
      typePoints,
      this.decoratorContext(this.renderer, this.geom),
      hit,
    );
    if (points.length === 0) {
      this.tooltip.hide();
      return;
    }
    const html = this.opts.tooltip.format ? this.opts.tooltip.format(points) : defaultTooltipHTML(points);
    this.tooltip.show(html, clientX, clientY, prefer);
  }

  // ------------------------------------------------------------- legend flow

  private toggleSeries(seriesId: string): void {
    if (this.destroyed) return;
    const rawSeries = this.raw.data?.series ?? [];
    const idx = rawSeries.findIndex((s) => (s.id ?? s.name) === seriesId);
    const target = rawSeries[idx];
    if (!target) return;
    const nowVisible = !(target.visible ?? true);
    // COPY-ON-WRITE. The retained options are already the chart's own deep
    // clone of what the caller passed (util.ts#deepClone), so writing
    // `target.visible` would be safe — rebuilding the entry instead makes the
    // contract's "the chart never mutates the object you pass" true by
    // construction rather than by the clone holding.
    const nextSeries = rawSeries.slice();
    nextSeries[idx] = { ...target, visible: nowVisible };
    this.raw = { ...this.raw, data: { ...(this.raw.data ?? { series: [] }), series: nextSeries } };
    this.opts = resolveOptions(this.raw);
    this.model = buildModel(this.opts, this.paletteSlots, this.viewport);
    this.invalidateA11y();
    this.hover = null;
    this.focus = null;
    this.tooltip.hide();
    this.computeLayout();
    this.syncDom();
    this.drawFrame(this.geom.pos, this.geom.slices);
    this.emitter.emit('legendtoggle', { seriesId, visible: nowVisible });
    this.emitter.emit('render', { reason: 'toggle' });
  }
}
