/**
 * Public types for @chartcraft/core.
 * These mirror docs/api-contract.md exactly — the contract is law.
 */

export type ChartType = 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'donut';

export interface ChartOptions {
  type: ChartType;
  data: ChartData;
  // Presentation
  /** default 'auto' (follows prefers-color-scheme) */
  theme?: 'light' | 'dark' | 'auto' | Theme;
  /** rendered above plot, primary ink */
  title?: string;
  /** secondary ink */
  subtitle?: string;
  /** px; default: container size (responsive) */
  width?: number;
  height?: number;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  // Cartesian only (ignored by pie/donut)
  xAxis?: AxisOptions;
  yAxis?: AxisOptions;
  /** bar/area stacking */
  stacked?: boolean;
  /** bar only: horizontal bars */
  horizontal?: boolean;
  // Components
  /** default: auto (shown when series >= 2, hidden for 1) */
  legend?: LegendOptions | boolean;
  /** default: true */
  tooltip?: TooltipOptions | boolean;
  // Behavior
  /** default: true; auto-disabled by prefers-reduced-motion */
  animation?: AnimationOptions | boolean;
  /** default { enabled: true, threshold: 5000 } (line/area/scatter) */
  downsample?: { enabled?: boolean; threshold?: number };
  a11y?: A11yOptions;
}

export interface ChartData {
  /** band x-axis (bar, or line/area with category x) */
  categories?: (string | number | Date)[];
  series: SeriesOptions[];
}

export interface SeriesOptions {
  /** stable identity; defaults to name */
  id?: string;
  /** legend & tooltip label (required) */
  name: string;
  data: DataValue[];
  /** override; otherwise palette slot by first-seen identity */
  color?: string;
  /** default true; legend toggles this */
  visible?: boolean;
  // line/area only:
  /** default 'linear' */
  curve?: 'linear' | 'monotone' | 'step';
  /** default 2 */
  lineWidth?: number;
  /** 'auto': markers when point count <= 60 */
  showMarkers?: boolean | 'auto';
}

export type DataValue =
  | number
  | null // y against categories/index (null = gap)
  | [number | Date, number | null] // [x, y] pair
  | { x?: number | Date | string; y: number | null; label?: string; color?: string };

export interface AxisOptions {
  /** axis title */
  label?: string;
  min?: number | 'auto';
  max?: number | 'auto';
  /** default inferred from data */
  type?: 'linear' | 'time' | 'log' | 'category';
  ticks?: { count?: number; format?: (value: number | Date | string) => string };
  /** default: true on y, false on x */
  grid?: boolean;
}

export interface LegendOptions {
  show?: boolean;
  /** default 'top' */
  position?: 'top' | 'bottom' | 'right';
  /** click toggles series; default true */
  interactive?: boolean;
}

export interface TooltipOptions {
  show?: boolean;
  /** default: true on line/area (crosshair, all series at x), false on bar/scatter/pie */
  shared?: boolean;
  /** returns HTML string */
  format?: (points: TooltipPoint[]) => string;
}

export interface TooltipPoint {
  seriesId: string;
  seriesName: string;
  color: string;
  x: number | Date | string | null;
  y: number | null;
  formattedX: string;
  formattedY: string;
}

export interface AnimationOptions {
  /** ms, default 300 */
  duration?: number;
  easing?: 'linear' | 'ease-out' | 'ease-in-out';
}

export interface A11yOptions {
  /** aria label; defaults to options.title or a generated summary */
  title?: string;
  /** longer text description */
  description?: string;
  /** data table fallback; default 'hidden' (visually hidden, AT-readable) */
  table?: 'hidden' | 'visible' | 'off';
  /** arrow-key point navigation + live announcements; default true */
  keyboard?: boolean;
}

// ---------------------------------------------------------------------------
// Events

export interface ChartEventMap {
  /** pointer or keyboard focus enters a datum */
  pointenter: PointEvent;
  pointleave: PointEvent;
  /** click / Enter on focused datum */
  pointclick: PointEvent;
  legendtoggle: { seriesId: string; visible: boolean };
  render: { reason: 'init' | 'update' | 'resize' | 'toggle' };
  destroy: Record<string, never>;
}

export interface PointEvent {
  seriesId: string;
  seriesName: string;
  dataIndex: number;
  x: number | Date | string | null;
  y: number | null;
  /** -1 for keyboard-originated events */
  clientX: number;
  clientY: number;
  native: Event | null;
}

// ---------------------------------------------------------------------------
// Theme

export interface Theme {
  colorScheme: 'light' | 'dark';
  /** chart surface */
  surface: string;
  textPrimary: string;
  textSecondary: string;
  /** axis tick labels */
  textMuted: string;
  /** hairline */
  gridline: string;
  axisLine: string;
  /** 8 categorical slots, validated order — never re-sort */
  series: string[];
  /** default: system-ui, -apple-system, "Segoe UI", sans-serif */
  fontFamily: string;
  /** base px, default 12 */
  fontSize: number;
}

// ---------------------------------------------------------------------------
// Chart instance

export interface Chart {
  /** deep-merged, diffed re-render */
  update(options: Partial<ChartOptions>): void;
  /** convenience for update({ data }) */
  setData(data: ChartData): void;
  /** manual; auto via ResizeObserver by default */
  resize(): void;
  /** removes DOM, observers, listeners */
  destroy(): void;
  /** returns unsubscribe */
  on<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): () => void;
  off<K extends keyof ChartEventMap>(type: K, handler: (ev: ChartEventMap[K]) => void): void;
  /** resolved options snapshot */
  getOptions(): Readonly<ChartOptions>;
  /** the container */
  readonly el: HTMLElement;
}
