/**
 * Layout & render-context types shared by chart mark renderers.
 */
import type { Renderer } from './render/renderer';
import type { Theme } from './types';
import type { DataModel, ResolvedOptions } from './model';
import type { BandScale } from './scales/band';
import type { LinearScale } from './scales/linear';
import type { LogScale } from './scales/log';

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
  /** Band axis geometry for bars. */
  band: {
    scale: BandScale;
    /** Width of one bar slot. */
    barW: number;
    /** Offset of each visible-series slot from the band start. */
    offsets: number[];
  } | null;
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

export interface RenderContext {
  r: Renderer;
  theme: Theme;
  model: DataModel;
  opts: ResolvedOptions;
  layout: Layout;
  /** Per model-series positions (null entries = gaps / hidden series). */
  pos: (PointPos | null)[][];
  /** Pie/donut slices (null for cartesian). */
  slices: PieSlice[] | null;
  hover: HoverState | null;
}
