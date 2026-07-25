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
  /** false = chrome-free (sparkline): no margins, no ticks. */
  axisChrome: boolean;
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
  const { width, height, topExtra, opts: o, model: m, theme: t, axisChrome } = args;
  const pad = o.padding;
  const horizontal = m.horizontal;
  const font = axisTickFont(t);

  // ---- Value axis (left when vertical, bottom when horizontal).
  const valueAxis = horizontal ? o.xAxis : o.yAxis;
  const { scale: valueScale, tickValues: valueTickValues } = makeValueScale(m.yDomain, valueAxis);
  const valueFormat = valueAxis.ticks?.format ?? ((v: number | Date | string) => formatNumber(v as number));

  // ---- Category / continuous x axis.
  const catAxis = horizontal ? o.yAxis : o.xAxis;
  const hasBars = m.series.some((s) => s.visible && s.kind === 'bar');
  let band: BandScale | null = null;
  let xCont: ContinuousScale | TimeScale | null = null;
  let xSpanMs = 0;
  if (m.xType === 'category') {
    band = new BandScale(m.categories ?? []);
    if (hasBars) band.padding(0.25, 0.15);
    else band.padding(0.6, 0.3);
  } else {
    let [lo, hi] = m.xDomain ?? [0, 1];
    if (typeof o.xAxis.min === 'number') lo = o.xAxis.min;
    if (typeof o.xAxis.max === 'number') hi = o.xAxis.max;
    xCont = m.xType === 'time' ? new TimeScale([lo, hi]) : m.xType === 'log' ? new LogScale([lo, hi]) : new LinearScale([lo, hi]);
    xSpanMs = Math.abs(hi - lo);
  }

  // ---- Margins (left labels measured before ranges are known).
  let leftW = 0;
  let bottomH = 0;
  if (axisChrome) {
    const leftLabels: string[] = horizontal
      ? (m.categories ?? []).map((c) => formatCategory(c, catAxis))
      : valueTickValues.map((v) => valueFormat(v));
    let maxLeft = 0;
    for (const s of leftLabels) maxLeft = Math.max(maxLeft, args.measure(s, font));
    leftW = Math.ceil(maxLeft) + 14 + (o.yAxis.label ? t.fontSize + 10 : 0);
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

  if (!horizontal) {
    // Bottom = x data axis, left = value axis.
    valueScale.range([plot.y + plot.h, plot.y]);
    if (axisChrome) yTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
    if (band) {
      band.range([plot.x, plot.x + plot.w]);
      if (axisChrome) xTicks = bandTicks(band, plot.w, catAxis);
    } else if (xCont) {
      xCont.range([plot.x, plot.x + plot.w]);
      if (axisChrome) xTicks = continuousXTicks(xCont, plot.w, o.xAxis, xSpanMs);
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
    };
  }

  // Horizontal bars: bottom = value axis, left = band axis.
  valueScale.range([plot.x, plot.x + plot.w]);
  if (axisChrome) xTicks = setValueTicks(valueTickValues, (v) => valueScale.scale(v));
  const b = band ?? new BandScale(m.categories ?? []);
  b.range([plot.y, plot.y + plot.h]);
  if (axisChrome) {
    yTicks = (m.categories ?? []).map((c, i) => ({
      pos: b.center(i),
      label: formatCategory(c, catAxis),
    }));
  }
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
  };
}

/** Plain plot layout for non-cartesian types (pie, donut, gauge, ...). */
export function computePlainLayout(args: {
  width: number;
  height: number;
  topExtra: number;
  padding: { top: number; right: number; bottom: number; left: number };
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
  };
}
