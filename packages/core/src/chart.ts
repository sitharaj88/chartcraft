/**
 * createChart + Chart implementation.
 * Pipeline: normalize options -> build data model -> compute scales/layout ->
 * render. update() deep-merges, diffs, and re-runs only the affected stages.
 * Animation interpolates between retained models; renders driven by rAF.
 */
import type {
  AxisOptions,
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
  buildModel,
  resolveOptions,
  seriesColor,
  type DataModel,
  type ResolvedOptions,
} from './model';
import { resolveTheme, watchColorScheme } from './theme';
import { CanvasRenderer } from './render/canvas';
import type { Renderer } from './render/renderer';
import { LinearScale } from './scales/linear';
import { TimeScale } from './scales/time';
import { BandScale } from './scales/band';
import { LogScale } from './scales/log';
import type { ContinuousScale, HoverState, Layout, PieSlice, PointPos, Rect, Tick } from './layout';
import { drawGrid } from './components/grid';
import { drawAxes, tickFont } from './components/axis';
import { Legend } from './components/legend';
import { Tooltip, defaultTooltipHTML } from './components/tooltip';
import { renderLine } from './charts/line';
import { renderArea } from './charts/area';
import { renderBar, BAR_GAP } from './charts/bar';
import { renderScatter } from './charts/scatter';
import { computeSlices, renderPie, START_ANGLE } from './charts/pie';
import { indicesAtX, nearestByX, nearestPoint, sliceAt, HIT_RADIUS } from './interaction/hittest';
import { Announcer, buildDataTable, generateAriaLabel, visuallyHide } from './a11y';
import { navigate, type NavPosition } from './a11y/keyboard';
import { Animator, lerp, prefersReducedMotion } from './animation';
import { caf, clamp, deepMerge, formatDate, formatNumber, formatValue, raf, uid } from './util';

export const version = '0.1.0';

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
  private pos: (PointPos | null)[][] = [];
  private slices: PieSlice[] | null = null;

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
        const p = this.pos[si];
        if (p) prevPosById.set(s.id, p);
      });
    }
    const prevSlices = this.slices;
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
      const targetPos = this.pos;
      const targetSlices = this.slices;
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
      this.drawFrame(this.pos, this.slices);
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
    const o = this.opts;
    const t = this.theme;
    const m = this.model;
    const { width, height } = this.measuredSize();
    const pad = o.padding;
    const topExtra = this.topExtra();
    const isPie = m.type === 'pie' || m.type === 'donut';

    if (isPie) {
      const plot: Rect = {
        x: pad.left,
        y: pad.top + topExtra,
        w: Math.max(10, width - pad.left - pad.right),
        h: Math.max(10, height - pad.top - topExtra - pad.bottom),
      };
      this.layoutState = {
        width,
        height,
        plot,
        xScale: null,
        yScale: null,
        xTicks: [],
        yTicks: [],
        band: null,
        baselinePx: plot.y + plot.h,
      };
      this.slices = computeSlices(m, plot, t);
      this.pos = m.series.map(() => []);
      return;
    }

    this.slices = null;
    const horizontal = m.horizontal;
    const font = tickFont(t);

    // ---- Value axis (left when vertical, bottom when horizontal).
    const valueAxis = horizontal ? o.xAxis : o.yAxis;
    const { scale: valueScale, tickValues: valueTickValues } = this.makeValueScale(m.yDomain, valueAxis, m.type);
    const valueFormat = valueAxis.ticks?.format ?? ((v: number | Date | string) => formatNumber(v as number));

    // ---- Category / continuous x axis.
    const catAxis = horizontal ? o.yAxis : o.xAxis;
    let band: BandScale | null = null;
    let xCont: ContinuousScale | null = null;
    let xSpanMs = 0;
    if (m.xType === 'category') {
      band = new BandScale(m.categories ?? []);
      if (m.type === 'bar') band.padding(0.25, 0.15);
      else band.padding(0.6, 0.3);
    } else {
      let [lo, hi] = m.xDomain ?? [0, 1];
      if (typeof o.xAxis.min === 'number') lo = o.xAxis.min;
      if (typeof o.xAxis.max === 'number') hi = o.xAxis.max;
      xCont = m.xType === 'time' ? new TimeScale([lo, hi]) : m.xType === 'log' ? new LogScale([lo, hi]) : new LinearScale([lo, hi]);
      xSpanMs = Math.abs(hi - lo);
    }

    // ---- Margins (left labels measured before ranges are known).
    const leftLabels: string[] = horizontal
      ? (m.categories ?? []).map((c) => this.formatCategory(c, catAxis))
      : valueTickValues.map((v) => valueFormat(v));
    let maxLeft = 0;
    for (const s of leftLabels) maxLeft = Math.max(maxLeft, this.renderer.measure(s, font));
    const leftW = Math.ceil(maxLeft) + 14 + (o.yAxis.label ? t.fontSize + 10 : 0);
    const bottomH = t.fontSize + 10 + (o.xAxis.label ? t.fontSize + 8 : 0);

    const plot: Rect = {
      x: pad.left + leftW,
      y: pad.top + topExtra,
      w: Math.max(10, width - pad.left - leftW - pad.right),
      h: Math.max(10, height - pad.top - topExtra - bottomH - pad.bottom),
    };

    // ---- Assign ranges.
    let xTicks: Tick[] = [];
    let yTicks: Tick[] = [];
    let bandLayout: Layout['band'] = null;
    let baselinePx: number;

    const setValueTicks = (ticks: number[], toPx: (v: number) => number): Tick[] =>
      ticks.map((v) => ({ pos: toPx(v), label: valueFormat(v) }));

    if (!horizontal) {
      // Bottom = x data axis, left = value axis.
      valueScale.range([plot.y + plot.h, plot.y]);
      yTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
      if (band) {
        band.range([plot.x, plot.x + plot.w]);
        xTicks = this.bandTicks(band, plot.w, catAxis);
      } else if (xCont) {
        xCont.range([plot.x, plot.x + plot.w]);
        xTicks = this.continuousXTicks(xCont, plot.w, o.xAxis, xSpanMs);
      }
      baselinePx = clamp(valueScale.scale(0), plot.y, plot.y + plot.h);
      this.layoutState = {
        width,
        height,
        plot,
        xScale: band ?? xCont,
        yScale: valueScale,
        xTicks,
        yTicks,
        band: null,
        baselinePx,
      };
    } else {
      // Horizontal bars: bottom = value axis, left = band axis.
      valueScale.range([plot.x, plot.x + plot.w]);
      xTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
      const b = band ?? new BandScale(m.categories ?? []);
      b.range([plot.y, plot.y + plot.h]);
      yTicks = (m.categories ?? []).map((c, i) => ({
        pos: b.center(i),
        label: this.formatCategory(c, catAxis),
      }));
      baselinePx = clamp(valueScale.scale(0), plot.x, plot.x + plot.w);
      band = b;
      this.layoutState = {
        width,
        height,
        plot,
        xScale: valueScale,
        yScale: b,
        xTicks,
        yTicks,
        band: null,
        baselinePx,
      };
    }

    // ---- Bar geometry.
    if (m.type === 'bar' && band) {
      const visibleCount = Math.max(1, m.series.filter((s) => s.visible).length);
      const bw = band.bandwidth();
      const slots = m.stacked ? 1 : visibleCount;
      const slotW = Math.max(1, (bw - BAR_GAP * (slots - 1)) / slots);
      const offsets: number[] = [];
      for (let k = 0; k < slots; k++) offsets.push(k * (slotW + BAR_GAP));
      bandLayout = { scale: band, barW: slotW, offsets };
      this.layoutState.band = bandLayout;
    }

    this.computePositions();
  }

  private makeValueScale(
    domain: [number, number],
    axis: AxisOptions,
    chartType: string,
  ): { scale: ContinuousScale; tickValues: number[] } {
    const count = axis.ticks?.count ?? 5;
    let [lo, hi] = domain;
    const explicitMin = typeof axis.min === 'number';
    const explicitMax = typeof axis.max === 'number';
    if (explicitMin) lo = axis.min as number;
    if (explicitMax) hi = axis.max as number;

    if (axis.type === 'log') {
      const scale = new LogScale([lo, hi]);
      if (!explicitMin || !explicitMax) {
        const nice = new LogScale([lo, hi]).nice().domain();
        scale.domain([explicitMin ? lo : nice[0], explicitMax ? hi : nice[1]]);
      }
      return { scale, tickValues: scale.ticks(count) };
    }
    const scale = new LinearScale([lo, hi]);
    if (!explicitMin || !explicitMax) {
      const nice = new LinearScale([lo, hi]).nice(count).domain();
      scale.domain([explicitMin ? lo : nice[0], explicitMax ? hi : nice[1]]);
    }
    void chartType;
    return { scale, tickValues: scale.ticks(count) };
  }

  private formatCategory(c: string | number | Date, axis: AxisOptions): string {
    const fmt = axis.ticks?.format;
    if (fmt) return fmt(c instanceof Date ? c : c);
    return formatValue(c);
  }

  private bandTicks(band: BandScale, plotW: number, axis: AxisOptions): Tick[] {
    const cats = band.ticks();
    const maxLabels = Math.max(1, Math.floor(plotW / 56));
    const stride = axis.ticks?.count ? Math.max(1, Math.ceil(cats.length / axis.ticks.count)) : Math.max(1, Math.ceil(cats.length / maxLabels));
    const out: Tick[] = [];
    cats.forEach((c, i) => {
      if (i % stride !== 0) return;
      out.push({ pos: band.center(i), label: this.formatCategory(c, axis) });
    });
    return out;
  }

  private continuousXTicks(scale: ContinuousScale, plotW: number, axis: AxisOptions, spanMs: number): Tick[] {
    const count = axis.ticks?.count ?? Math.max(2, Math.floor(plotW / 80));
    const fmt = axis.ticks?.format;
    if (scale instanceof TimeScale) {
      return scale.timeTicks(count).map((d) => ({
        pos: scale.scale(d.getTime()),
        label: fmt ? fmt(d) : formatDate(d, spanMs),
      }));
    }
    return scale.ticks(count).map((v) => ({
      pos: scale.scale(v),
      label: fmt ? fmt(v) : formatNumber(v),
    }));
  }

  private computePositions(): void {
    const m = this.model;
    const L = this.layoutState;
    const horizontal = m.horizontal;
    let slotIndex = -1;

    this.pos = m.series.map((s) => {
      if (!s.visible) return [];
      slotIndex += 1;
      const slot = m.stacked ? 0 : slotIndex;

      if (m.type === 'bar' && L.band) {
        const { scale: band, barW, offsets } = L.band;
        const valueScale = (horizontal ? L.xScale : L.yScale) as ContinuousScale;
        return s.points.map((p, pi) => {
          const yTop = m.stacked ? (s.y1?.[pi] ?? null) : p.y;
          if (yTop === null) return null;
          const yBottom = m.stacked ? (s.y0?.[pi] ?? 0) : 0;
          const bandIdx = this.bandIndexFor(p.xv, pi);
          const centerAlongBand = band.scale(bandIdx) + (offsets[slot] ?? 0) + barW / 2;
          const endPx = valueScale.scale(yTop);
          const basePx = m.stacked ? valueScale.scale(yBottom ?? 0) : L.baselinePx;
          return horizontal
            ? { x: endPx, y: centerAlongBand, y0: basePx }
            : { x: centerAlongBand, y: endPx, y0: basePx };
        });
      }

      // line / area / scatter
      const yScale = L.yScale as ContinuousScale | null;
      if (!yScale) return [];
      return s.points.map((p, pi) => {
        const yVal = m.stacked ? (s.y1?.[pi] ?? null) : p.y;
        if (yVal === null) return null;
        let x: number;
        if (m.xType === 'category') {
          const band = L.xScale as BandScale;
          x = band.center(this.bandIndexFor(p.xv, pi));
        } else {
          if (p.xv === null) return null;
          x = (L.xScale as ContinuousScale).scale(p.xv);
        }
        const y = yScale.scale(yVal);
        const y0 = m.stacked ? yScale.scale(s.y0?.[pi] ?? 0) : L.baselinePx;
        return { x, y, y0 };
      });
    });
  }

  private bandIndexFor(xv: number | null, pi: number): number {
    const n = this.model.categories?.length ?? 0;
    if (xv !== null && Number.isInteger(xv) && xv >= 0 && (n === 0 || xv < n)) return xv;
    return pi;
  }

  // -------------------------------------------------------------------- DOM

  private syncDom(): void {
    const o = this.opts;
    const t = this.theme;
    const m = this.model;
    const doc = this.root.ownerDocument;

    this.root.style.background = t.surface;
    this.root.style.flexDirection = o.legend.position === 'right' ? 'row' : 'column';

    // Legend mount order.
    this.legend.update(m.series, t, o.legend);
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

    // Data table fallback.
    this.tableWrap.textContent = '';
    if (o.a11y.table !== 'off') {
      const table = buildDataTable(doc, m, o);
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

    const m = this.model;
    const isPie = m.type === 'pie' || m.type === 'donut';
    const ctx = {
      r,
      theme: t,
      model: m,
      opts: o,
      layout: L,
      pos,
      slices,
      hover: this.hover,
    };

    if (!isPie) {
      drawGrid(r, L, t, o);
      // Crosshair for shared tooltips (under the marks).
      if (this.hover && o.tooltip.shared && (m.type === 'line' || m.type === 'area')) {
        const hp = pos[this.hover.si]?.[this.hover.pi];
        if (hp) {
          r.line(hp.x, L.plot.y, hp.x, L.plot.y + L.plot.h, { color: t.axisLine, width: 1, dash: [4, 4] });
        }
      }
    }

    switch (m.type) {
      case 'line':
        renderLine(ctx);
        break;
      case 'area':
        renderArea(ctx);
        break;
      case 'bar':
        renderBar(ctx);
        break;
      case 'scatter':
        renderScatter(ctx);
        break;
      case 'pie':
      case 'donut':
        renderPie(ctx);
        break;
    }

    if (!isPie) drawAxes(r, L, t, o);
  }

  private scheduleHoverDraw(): void {
    if (this.hoverRaf !== null) return;
    this.hoverRaf = raf(() => {
      this.hoverRaf = null;
      if (this.destroyed || this.animator.running) return;
      this.drawFrame(this.pos, this.slices);
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
    const m = this.model;
    const L = this.layoutState;

    if (m.type === 'pie' || m.type === 'donut') {
      if (!this.slices) return null;
      const slice = sliceAt(this.slices, px, py);
      if (!slice) return null;
      const si = m.series.findIndex((s) => s.visible);
      return si < 0 ? null : { si, pi: slice.pi };
    }

    if (m.type === 'bar' && L.band) {
      // Full column band hit target.
      const along = m.horizontal ? py : px;
      const cross = m.horizontal ? px : py;
      const inPlot = m.horizontal
        ? px >= L.plot.x - HIT_RADIUS && px <= L.plot.x + L.plot.w + HIT_RADIUS
        : py >= L.plot.y - HIT_RADIUS && py <= L.plot.y + L.plot.h + HIT_RADIUS;
      if (!inPlot) return null;
      const bandIdx = L.band.scale.invertIndex(along);
      if (bandIdx < 0) return null;
      // Choose the series whose bar (at this band index) is nearest the pointer.
      let best: HoverState | null = null;
      let bestD = Infinity;
      this.pos.forEach((pts, si) => {
        for (let pi = 0; pi < pts.length; pi++) {
          const p = pts[pi];
          if (!p) continue;
          if (this.bandIndexFor(m.series[si]?.points[pi]?.xv ?? null, pi) !== bandIdx) continue;
          const center = m.horizontal ? p.y : p.x;
          const valueLo = Math.min(m.horizontal ? p.x : p.y, m.horizontal ? p.y0 : p.y0);
          const valueHi = Math.max(m.horizontal ? p.x : p.y, p.y0);
          const dAlong = Math.abs(center - along);
          // Prefer bars whose value-extent contains the pointer's cross coord.
          const inside = cross >= valueLo - 2 && cross <= valueHi + 2;
          const d = dAlong + (inside ? 0 : 10000);
          if (d < bestD) {
            bestD = d;
            best = { si, pi };
          }
        }
      });
      return best;
    }

    if (this.opts.tooltip.shared && (m.type === 'line' || m.type === 'area')) {
      return nearestByX(this.pos, px);
    }
    return nearestPoint(this.pos, px, py);
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
    const m = this.model;
    const isPie = m.type === 'pie' || m.type === 'donut';
    const action = navigate(e.key, this.focus, {
      seriesCount: m.series.length,
      isVisible: (si) => (isPie ? (m.series[si]?.visible ?? false) : (m.series[si]?.visible ?? false)),
      pointCount: (si) => m.series[si]?.points.length ?? 0,
    });
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
      const p = this.pos[action.pos.si]?.[action.pos.pi];
      const slice = this.slices?.find((s) => s.pi === action.pos.pi);
      const cx = p ? rect.left + p.x : slice ? rect.left + slice.cx : rect.left;
      const cy = p ? rect.top + p.y : slice ? rect.top + slice.cy : rect.top;
      this.showTooltipFor(action.pos, cx, cy);
    }
    this.scheduleHoverDraw();
  }

  private announceFocus(pos: NavPosition): void {
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

  private tooltipPointFor(si: number, pi: number): TooltipPoint | null {
    const m = this.model;
    const s = m.series[si];
    const p = s?.points[pi];
    if (!s || !p) return null;
    const isPie = m.type === 'pie' || m.type === 'donut';
    let color = seriesColor(s, this.theme);
    let formattedX = this.formatXValue(p.x);
    if (isPie) {
      const slice = this.slices?.find((sl) => sl.pi === pi);
      if (slice) {
        color = slice.color;
        formattedX = slice.label;
      }
    } else if (m.xType === 'category') {
      const cat = m.categories?.[this.bandIndexFor(p.xv, pi)];
      if (cat !== undefined) formattedX = this.formatCategory(cat, m.horizontal ? this.opts.yAxis : this.opts.xAxis);
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
    const m = this.model;
    const points: TooltipPoint[] = [];

    if (this.opts.tooltip.shared && (m.type === 'line' || m.type === 'area')) {
      const anchor = this.pos[hit.si]?.[hit.pi];
      if (anchor) {
        const idxs = indicesAtX(this.pos, anchor.x);
        m.series.forEach((s, si) => {
          if (!s.visible) return;
          const pi = idxs[si];
          if (pi === null || pi === undefined) return;
          const tp = this.tooltipPointFor(si, pi);
          if (tp) points.push(tp);
        });
      }
    } else {
      const tp = this.tooltipPointFor(hit.si, hit.pi);
      if (tp) points.push(tp);
    }
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
    this.drawFrame(this.pos, this.slices);
    this.emitter.emit('legendtoggle', { seriesId, visible: nowVisible });
    this.emitter.emit('render', { reason: 'toggle' });
  }
}
