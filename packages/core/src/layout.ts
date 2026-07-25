/**
 * Layout & render-context types shared by chart-type definitions, plus the
 * PIPELINE-OWNED cartesian layout builder: scales, ticks and margins are
 * computed here for every chart type that declares `needs.cartesianAxes` —
 * definitions never build axes themselves, they only declare needs and then
 * position their marks against the scales the pipeline hands them.
 */
import type { Renderer } from './render/renderer';
import type { AxisOptions, Theme } from './types';
import type { DataModel, ResolvedOptions } from './model';
import type { AxisArrangement, ResolvedAxisChrome } from './charts/registry';
import type { Viewport } from './decorate';
import { BandScale } from './scales/band';
import { LinearScale } from './scales/linear';
import { LogScale } from './scales/log';
import { TimeScale } from './scales/time';
import { clamp, formatDate, formatNumber, formatValue } from './util';

export type ContinuousScale = LinearScale | LogScale;
export type AnyScale = ContinuousScale | BandScale;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tick {
  /** Pixel position along the axis. */
  pos: number;
  label: string;
}

export interface Layout {
  width: number;
  height: number;
  plot: Rect;
  /** Scale along the x screen axis (band for vertical bar/category). */
  xScale: AnyScale | null;
  /** Scale along the y screen axis (band for horizontal bar). */
  yScale: AnyScale | null;
  xTicks: Tick[];
  yTicks: Tick[];
  /** Pixel position of the zero baseline on the value axis. */
  baselinePx: number;
  /**
   * v0.3 — the viewport actually applied to the scales (null when unzoomed).
   * Continuous axes only; band (category) axes ignore it.
   */
  viewport: Viewport | null;
}

/** Screen position for one datum. y0 = baseline/stack-lower pixel. */
export interface PointPos {
  x: number;
  y: number;
  y0: number;
}

export interface PieSlice {
  pi: number;
  a0: number;
  a1: number;
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  color: string;
  label: string;
  value: number;
}

export interface HoverState {
  si: number;
  pi: number;
}

/**
 * Per-type geometry computed by a ChartTypeDefinition's `layout()` stage.
 * `pos`/`slices` are animated (interpolated) by the pipeline; `extra` is
 * free-form geometry for custom types and is redrawn without interpolation.
 */
export interface TypeGeom {
  /** Per model-series positions (null entries = gaps / hidden series). */
  pos: (PointPos | null)[][];
  /** Pie/donut-style slices (null for cartesian types). */
  slices: PieSlice[] | null;
  /** Bar slot geometry when bar-kind marks are present. */
  bars: { barW: number } | null;
  /** Free-form geometry for custom types (cells, nodes, candles, ...). */
  extra?: unknown;
}

export interface RenderContext {
  r: Renderer;
  theme: Theme;
  model: DataModel;
  opts: ResolvedOptions;
  layout: Layout;
  geom: TypeGeom;
  hover: HoverState | null;
}

// ---------------------------------------------------------------------------
// Pipeline-owned cartesian layout (scales / ticks / margins)

export interface CartesianLayoutArgs {
  width: number;
  height: number;
  /** Extra top space already consumed by title/subtitle. */
  topExtra: number;
  opts: ResolvedOptions;
  model: DataModel;
  theme: Theme;
  /** Text measurement (renderer-backed). */
  measure(text: string, font: string): number;
  /**
   * PER-AXIS chrome (v0.3). An axis whose switch is false gets no ticks, no
   * axis line, no title and no reserved margin — `{ x: false, y: false }` is
   * the chrome-free sparkline preset, `{ x: true, y: false }` keeps the data
   * axis and drops a meaningless value axis (streamgraph).
   */
  axisChrome: ResolvedAxisChrome;
  /**
   * v0.3 — which screen axis carries the value axis and which the band axis.
   * `'rows'` pairs the band (category) axis on screen-y with the continuous
   * DATA axis on screen-x, which is the only way to express "task rows against
   * a time axis" (gantt).
   */
  arrangement: AxisArrangement;
  /**
   * v0.3 — optional zoom viewport: continuous x/y domain OVERRIDES. When an
   * axis range is given it wins over both the data extent and the axis
   * min/max, and the domain is used verbatim (no `nice()` widening, so the
   * visible window matches the requested range exactly). Falls back to
   * `model.viewport` when omitted. Band axes ignore it.
   */
  viewport?: Viewport | null;
}

export function axisTickFont(theme: Theme): string {
  return `${theme.fontSize}px ${theme.fontFamily}`;
}

export function formatCategory(c: string | number | Date, axis: AxisOptions): string {
  const fmt = axis.ticks?.format;
  if (fmt) return fmt(c);
  return formatValue(c);
}

function makeValueScale(
  domain: [number, number],
  axis: AxisOptions,
  override?: [number, number] | null,
  /** v0.3 — the type's `extendValueDomain` asked for the domain VERBATIM. */
  exact = false,
): { scale: ContinuousScale; tickValues: number[] } {
  const count = axis.ticks?.count ?? 5;
  let [lo, hi] = domain;
  let explicitMin = typeof axis.min === 'number';
  let explicitMax = typeof axis.max === 'number';
  if (explicitMin) lo = axis.min as number;
  if (explicitMax) hi = axis.max as number;
  // An `exact` value domain is treated as explicit on both ends: nice() must
  // not widen it (bullet's outermost range has to end at the plot edge).
  if (exact) {
    explicitMin = true;
    explicitMax = true;
  }
  // A viewport override wins over data extent AND axis min/max, and is used
  // verbatim (treated as explicit, so nice() never widens the zoom window).
  if (override) {
    [lo, hi] = override;
    explicitMin = true;
    explicitMax = true;
  }

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
  return { scale, tickValues: scale.ticks(count) };
}

function bandTicks(band: BandScale, plotW: number, axis: AxisOptions): Tick[] {
  const cats = band.ticks();
  const maxLabels = Math.max(1, Math.floor(plotW / 56));
  const stride = axis.ticks?.count
    ? Math.max(1, Math.ceil(cats.length / axis.ticks.count))
    : Math.max(1, Math.ceil(cats.length / maxLabels));
  const out: Tick[] = [];
  cats.forEach((c, i) => {
    if (i % stride !== 0) return;
    out.push({ pos: band.center(i), label: formatCategory(c, axis) });
  });
  return out;
}

function continuousXTicks(scale: ContinuousScale | TimeScale, plotW: number, axis: AxisOptions, spanMs: number): Tick[] {
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

/**
 * Build the cartesian layout: value scale, category/continuous x scale, tick
 * sets and margins. Band padding is keyed off the marks present: charts with
 * bar-kind series get bar padding, marker/line charts get centered padding.
 */
export function computeCartesianLayout(args: CartesianLayoutArgs): Layout {
  const { width, height, topExtra, opts: o, model: m, theme: t, axisChrome: chrome, arrangement } = args;
  const pad = o.padding;
  /** True when the band (category) axis is on screen-y ('value-x' / 'rows'). */
  const bandOnY = arrangement !== 'value-y';
  const font = axisTickFont(t);

  // ---- v0.3 zoom viewport: continuous domain overrides (band axes ignore it).
  const viewport = args.viewport !== undefined ? args.viewport : m.viewport;
  // The viewport is expressed in DATA space: `x` addresses the data x axis and
  // `y` the value axis, regardless of which screen axis each lands on.
  const vpX = viewport?.x ?? null;
  const vpY = viewport?.y ?? null;

  // ---- Value axis (screen-y for 'value-y', screen-x for 'value-x', absent
  // for 'rows'). `xAxis`/`yAxis` role assignment is the registry's answer, not
  // a `model.horizontal` guess (see `valueAxisOf` / `categoryAxisOf`).
  const valueAxis = arrangement === 'value-x' ? o.xAxis : o.yAxis;
  const { scale: valueScale, tickValues: valueTickValues } = makeValueScale(
    m.yDomain,
    valueAxis,
    vpY,
    m.valueDomainExact,
  );
  const valueFormat = valueAxis.ticks?.format ?? ((v: number | Date | string) => formatNumber(v as number));

  // ---- Category / continuous data axis.
  const catAxis = bandOnY ? o.yAxis : o.xAxis;
  const hasBars = m.series.some((s) => s.visible && s.kind === 'bar');
  let band: BandScale | null = null;
  let xCont: ContinuousScale | TimeScale | null = null;
  let xSpanMs = 0;
  // In 'rows' mode the DATA axis is continuous by construction: the categories
  // are the cross axis, so a category x-type falls back to an index domain.
  if (m.xType === 'category' && arrangement !== 'rows') {
    band = new BandScale(m.categories ?? []);
    if (hasBars) band.padding(0.25, 0.15);
    else band.padding(0.6, 0.3);
  } else {
    let [lo, hi] = m.xDomain ?? [0, Math.max(1, m.maxLen - 1)];
    if (typeof o.xAxis.min === 'number') lo = o.xAxis.min;
    if (typeof o.xAxis.max === 'number') hi = o.xAxis.max;
    if (vpX) [lo, hi] = vpX;
    xCont = m.xType === 'time' ? new TimeScale([lo, hi]) : m.xType === 'log' ? new LogScale([lo, hi]) : new LinearScale([lo, hi]);
    xSpanMs = Math.abs(hi - lo);
  }

  // ---- Margins. Each axis only reserves space while ITS chrome is on, so
  // turning one axis off releases its margin.
  let leftW = 0;
  let bottomH = 0;
  if (chrome.y) {
    const leftLabels: string[] = bandOnY
      ? (m.categories ?? []).map((c) => formatCategory(c, catAxis))
      : valueTickValues.map((v) => valueFormat(v));
    let maxLeft = 0;
    for (const s of leftLabels) maxLeft = Math.max(maxLeft, args.measure(s, font));
    leftW = Math.ceil(maxLeft) + 14 + (o.yAxis.label ? t.fontSize + 10 : 0);
  }
  if (chrome.x) {
    bottomH = t.fontSize + 10 + (o.xAxis.label ? t.fontSize + 8 : 0);
  }

  const plot: Rect = {
    x: pad.left + leftW,
    y: pad.top + topExtra,
    w: Math.max(10, width - pad.left - leftW - pad.right),
    h: Math.max(10, height - pad.top - topExtra - bottomH - pad.bottom),
  };

  // ---- Assign ranges.
  let xTicks: Tick[] = [];
  let yTicks: Tick[] = [];
  let baselinePx: number;

  const setValueTicks = (ticks: number[], toPx: (v: number) => number): Tick[] =>
    ticks.map((v) => ({ pos: toPx(v), label: valueFormat(v) }));
  const categoryTicksOnY = (b: BandScale): Tick[] =>
    (m.categories ?? []).map((c, i) => ({ pos: b.center(i), label: formatCategory(c, catAxis) }));

  if (arrangement === 'value-y') {
    // Bottom = x data axis, left = value axis.
    valueScale.range([plot.y + plot.h, plot.y]);
    if (chrome.y) yTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
    if (band) {
      band.range([plot.x, plot.x + plot.w]);
      if (chrome.x) xTicks = bandTicks(band, plot.w, catAxis);
    } else if (xCont) {
      xCont.range([plot.x, plot.x + plot.w]);
      if (chrome.x) xTicks = continuousXTicks(xCont, plot.w, o.xAxis, xSpanMs);
    }
    baselinePx = clamp(valueScale.scale(0), plot.y, plot.y + plot.h);
    return {
      width,
      height,
      plot,
      xScale: (band ?? xCont) as AnyScale | null,
      yScale: valueScale,
      xTicks,
      yTicks,
      baselinePx,
      viewport: viewport ?? null,
    };
  }

  if (arrangement === 'rows') {
    // Task rows: left = band (category) axis, bottom = continuous DATA axis
    // (a real TimeScale when `xAxis.type` is 'time'). There is no value axis.
    const rows = band ?? new BandScale(m.categories ?? []);
    rows.range([plot.y, plot.y + plot.h]);
    if (chrome.y) yTicks = categoryTicksOnY(rows);
    if (xCont) {
      xCont.range([plot.x, plot.x + plot.w]);
      if (chrome.x) xTicks = continuousXTicks(xCont, plot.w, o.xAxis, xSpanMs);
    }
    return {
      width,
      height,
      plot,
      xScale: xCont as AnyScale | null,
      yScale: rows,
      xTicks,
      yTicks,
      baselinePx: plot.y + plot.h,
      viewport: viewport ?? null,
    };
  }

  // 'value-x' (horizontal bars): bottom = value axis, left = band axis.
  valueScale.range([plot.x, plot.x + plot.w]);
  if (chrome.x) xTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
  const b = band ?? new BandScale(m.categories ?? []);
  b.range([plot.y, plot.y + plot.h]);
  if (chrome.y) yTicks = categoryTicksOnY(b);
  baselinePx = clamp(valueScale.scale(0), plot.x, plot.x + plot.w);
  return {
    width,
    height,
    plot,
    xScale: valueScale,
    yScale: b,
    xTicks,
    yTicks,
    baselinePx,
    viewport: viewport ?? null,
  };
}

/** Plain plot layout for non-cartesian types (pie, donut, gauge, ...). */
export function computePlainLayout(args: {
  width: number;
  height: number;
  topExtra: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /** Carried through for decorators; non-cartesian types have no scales to override. */
  viewport?: Viewport | null;
}): Layout {
  const { width, height, topExtra, padding: pad } = args;
  const plot: Rect = {
    x: pad.left,
    y: pad.top + topExtra,
    w: Math.max(10, width - pad.left - pad.right),
    h: Math.max(10, height - pad.top - topExtra - pad.bottom),
  };
  return {
    width,
    height,
    plot,
    xScale: null,
    yScale: null,
    xTicks: [],
    yTicks: [],
    baselinePx: plot.y + plot.h,
    viewport: args.viewport ?? null,
  };
}
