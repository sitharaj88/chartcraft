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
} from './types';
import { Emitter } from './events';
import {
  bandIndexFor,
  buildModel,
  resolveOptions,
  seriesColor,
  type DataModel,
  type ResolvedOptions,
} from './model';
import { resolveTheme, watchColorScheme } from './theme';
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
import { Legend } from './components/legend';
import { Tooltip, defaultTooltipHTML } from './components/tooltip';
import { getChartType, type ChartTypeDefinition, type GeomContext } from './charts/registry';
import { START_ANGLE } from './charts/pie';
import { Announcer, buildDataTable, generateAriaLabel, visuallyHide } from './a11y';
import { navigate, type NavPosition } from './a11y/keyboard';
import { Animator, lerp, prefersReducedMotion } from './animation';
import { caf, deepMerge, formatValue, raf, uid } from './util';

export const version = '0.2.0';

type RenderReason = ChartEventMap['render']['reason'];

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

  private ro: ResizeObserver | null = null;
  private unwatchScheme: () => void = () => {};
  private animator = new Animator();
  private hover: HoverState | null = null;
  private focus: NavPosition | null = null;
  private destroyed = false;
  private resizeRaf: number | null = null;
  private hoverRaf: number | null = null;
  private lastSize: { w: number; h: number; dpr: number } | null = null;

  private onPointerMove: (e: PointerEvent | MouseEvent) => void;
  private onPointerLeave: () => void;
  private onClick: (e: MouseEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, options: ChartOptions) {
    this.el = container;
    this.raw = deepMerge({} as ChartOptions, options);
    this.opts = resolveOptions(this.raw);
    this.theme = resolveTheme(this.opts.theme);
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
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerLeave = () => this.handlePointerLeave();
    this.onClick = (e) => this.handleClick(e);
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.canvas.addEventListener('pointermove', this.onPointerMove as EventListener);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('blur', this.onPointerLeave);

    // Responsive by default: ResizeObserver coalesced through rAF.
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleResize());
      this.ro.observe(container);
    }

    this.watchThemeIfAuto();

    this.model = buildModel(this.opts, this.paletteSlots);
    this.refresh('init', false);
  }

  /** The chart-type definition for the current resolved type. */
  private get def(): ChartTypeDefinition {
    return getChartType(this.opts.type);
  }

  /** Whether the pipeline draws grid + axes for the current type. */
  private get axisChrome(): boolean {
    const needs = this.def.needs;
    return needs.cartesianAxes && (needs.axisChrome ?? true);
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

  update(partial: Partial<ChartOptions>): void {
    if (this.destroyed) return;
    this.raw = deepMerge(this.raw, partial);
    this.opts = resolveOptions(this.raw);
    this.theme = resolveTheme(this.opts.theme);
    if ('theme' in partial) this.watchThemeIfAuto();

    const modelKeys: (keyof ChartOptions)[] = ['data', 'type', 'stacked', 'horizontal', 'downsample', 'xAxis', 'yAxis'];
    const modelDirty = modelKeys.some((k) => k in partial);
    this.refresh('update', modelDirty);
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
    this.animator.cancel();
    if (this.resizeRaf !== null) caf(this.resizeRaf);
    if (this.hoverRaf !== null) caf(this.hoverRaf);
    this.ro?.disconnect();
    this.ro = null;
    this.unwatchScheme();
    this.canvas.removeEventListener('pointermove', this.onPointerMove as EventListener);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('blur', this.onPointerLeave);
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

  // ------------------------------------------------------------ theme watch

  private watchThemeIfAuto(): void {
    this.unwatchScheme();
    this.unwatchScheme = () => {};
    const t = this.opts.theme;
    if (t === undefined || t === 'auto') {
      this.unwatchScheme = watchColorScheme(() => {
        if (this.destroyed) return;
        this.theme = resolveTheme(this.opts.theme);
        this.refresh('update', false, false);
      });
    }
  }

  // ---------------------------------------------------------------- pipeline

  /** Re-run pipeline stages and paint. */
  private refresh(reason: RenderReason, modelDirty: boolean, animate = true): void {
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
      this.model = buildModel(this.opts, this.paletteSlots);
      this.focus = null;
      this.hover = null;
      this.tooltip.hide();
    }
    this.computeLayout();
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

  private measuredSize(): { width: number; height: number } {
    const width = this.opts.width ?? (this.wrap.clientWidth || this.el.clientWidth || 640);
    const height = this.opts.height ?? (this.wrap.clientHeight || this.el.clientHeight || 400);
    return { width: Math.max(40, width), height: Math.max(40, height) };
  }

  private topExtra(): number {
    const t = this.theme;
    let extra = 0;
    if (this.opts.title) extra += t.fontSize + 6 + 6;
    if (this.opts.subtitle) extra += t.fontSize + 4;
    if (extra > 0) extra += 6;
    return extra;
  }

  private computeLayout(): void {
    const { width, height } = this.measuredSize();
    const topExtra = this.topExtra();
    const measure = (text: string, font: string): number => this.renderer.measure(text, font);

    this.layoutState = this.def.needs.cartesianAxes
      ? computeCartesianLayout({
          width,
          height,
          topExtra,
          opts: this.opts,
          model: this.model,
          theme: this.theme,
          measure,
          axisChrome: this.axisChrome,
        })
      : computePlainLayout({ width, height, topExtra, padding: this.opts.padding });

    this.geom = this.def.layout({
      opts: this.opts,
      theme: this.theme,
      model: this.model,
      layout: this.layoutState,
      measure,
    });
  }

  // -------------------------------------------------------------------- DOM

  private syncDom(): void {
    const o = this.opts;
    const t = this.theme;
    const m = this.model;
    const doc = this.root.ownerDocument;

    this.root.style.background = t.surface;
    this.root.style.flexDirection = o.legend.position === 'right' ? 'row' : 'column';

    // Legend content comes from the type definition: item entries (series
    // for cartesian charts, non-toggleable slices for pie/donut, ...) or a
    // custom element (heatmap's gradient color scale) mounted in the items'
    // place — the legend.show policy applies to both.
    const legendCustom = this.def.legendCustomEl?.(this.geomContext(), doc) ?? null;
    if (legendCustom) {
      this.legend.update([], t, o.legend);
      if (o.legend.show) this.legend.el.appendChild(legendCustom);
    } else {
      this.legend.update(this.def.legendItems(this.geomContext()), t, o.legend);
    }
    if (o.legend.position === 'top') {
      if (this.root.firstChild !== this.legend.el) this.root.insertBefore(this.legend.el, this.wrap);
    } else {
      // bottom / right: legend after the canvas wrap.
      if (this.legend.el.previousSibling !== this.wrap) this.root.insertBefore(this.legend.el, this.wrap.nextSibling);
    }

    // Canvas aria.
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', generateAriaLabel(o, m));
    if (o.a11y.keyboard) {
      this.canvas.tabIndex = 0;
      this.canvas.style.outline = 'none';
    } else {
      this.canvas.removeAttribute('tabindex');
    }

    // Description.
    if (o.a11y.description) {
      if (!this.descEl) {
        this.descEl = doc.createElement('div');
        this.descEl.id = this.descId;
        visuallyHide(this.descEl);
        this.root.appendChild(this.descEl);
      }
      this.descEl.textContent = o.a11y.description;
      this.canvas.setAttribute('aria-describedby', this.descId);
    } else if (this.descEl) {
      this.descEl.remove();
      this.descEl = null;
      this.canvas.removeAttribute('aria-describedby');
    }

    // Data table fallback (content supplied by the type definition).
    this.tableWrap.textContent = '';
    if (o.a11y.table !== 'off') {
      const spec = this.def.a11yTable(this.geomContext());
      const table = buildDataTable(doc, o.title ?? generateAriaLabel(o, m), spec);
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

    this.tooltip.applyTheme(t);
  }

  // ------------------------------------------------------------------- paint

  private drawFrame(pos: (PointPos | null)[][], slices: PieSlice[] | null): void {
    const t = this.theme;
    const L = this.layoutState;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (!this.lastSize || this.lastSize.w !== L.width || this.lastSize.h !== L.height || this.lastSize.dpr !== dpr) {
      this.renderer.resize(L.width, L.height, dpr);
      this.lastSize = { w: L.width, h: L.height, dpr };
    }
    const r = this.renderer;
    r.clear(t.surface);

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

    if (this.axisChrome) drawGrid(r, L, t, o);
    this.def.render(ctx);
    if (this.axisChrome) drawAxes(r, L, t, o);
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

  private hitTest(px: number, py: number): HoverState | null {
    return this.def.hitTest(this.geomContext(), px, py);
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

  private handlePointerMove(e: PointerEvent | MouseEvent): void {
    if (this.destroyed) return;
    const { px, py } = this.canvasPoint(e);
    const hit = this.hitTest(px, py);
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
    if (hit && this.opts.tooltip.show) {
      this.showTooltipFor(hit, e.clientX, e.clientY);
    } else if (!hit) {
      this.tooltip.hide();
    } else if (this.tooltip.visible) {
      this.tooltip.position(e.clientX, e.clientY);
    }
  }

  private handlePointerLeave(): void {
    if (this.destroyed) return;
    if (this.hover) {
      const ev = this.pointEventFor(this.hover.si, this.hover.pi, -1, -1, null);
      if (ev) this.emitter.emit('pointleave', ev);
    }
    this.hover = null;
    this.focus = null;
    this.tooltip.hide();
    this.scheduleHoverDraw();
  }

  private handleClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const { px, py } = this.canvasPoint(e);
    const hit = this.hitTest(px, py);
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

  private formatXValue(x: number | Date | string | null): string {
    const fmt = this.opts.xAxis.ticks?.format;
    if (x !== null && fmt) return fmt(x);
    const span = this.model.xDomain ? Math.abs(this.model.xDomain[1] - this.model.xDomain[0]) : 0;
    return formatValue(x, x instanceof Date ? span : 0);
  }

  private formatYValue(y: number | null): string {
    if (y === null) return '—';
    const fmt = (this.model.horizontal ? this.opts.xAxis : this.opts.yAxis).ticks?.format;
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
      if (cat !== undefined) formattedX = formatCategory(cat, m.horizontal ? this.opts.yAxis : this.opts.xAxis);
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

  private showTooltipFor(hit: HoverState, clientX: number, clientY: number): void {
    const points = this.def.tooltipPoints(
      {
        ...this.geomContext(),
        pointFor: (si, pi) => this.tooltipPointFor(si, pi),
      },
      hit,
    );
    if (points.length === 0) {
      this.tooltip.hide();
      return;
    }
    const html = this.opts.tooltip.format ? this.opts.tooltip.format(points) : defaultTooltipHTML(points);
    this.tooltip.show(html, clientX, clientY);
  }

  // ------------------------------------------------------------- legend flow

  private toggleSeries(seriesId: string): void {
    if (this.destroyed) return;
    const rawSeries = this.raw.data?.series ?? [];
    const target = rawSeries.find((s) => (s.id ?? s.name) === seriesId);
    if (!target) return;
    const nowVisible = !(target.visible ?? true);
    target.visible = nowVisible;
    this.opts = resolveOptions(this.raw);
    this.model = buildModel(this.opts, this.paletteSlots);
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
