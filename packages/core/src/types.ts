/**
 * Public types for @chartcraft/core.
 * These mirror docs/api-contract.md exactly — the contract is law.
 */

export type ChartType =
  // v0.1
  | 'line'
  | 'area'
  | 'bar'
  | 'scatter'
  | 'pie'
  | 'donut'
  // v0.2 (see the "v0.2 chart types" section of the contract)
  | 'bubble'
  | 'sparkline'
  | 'histogram'
  | 'boxplot'
  | 'candlestick'
  | 'ohlc'
  | 'waterfall'
  | 'heatmap'
  | 'treemap'
  | 'sunburst'
  | 'funnel'
  | 'radar'
  | 'gauge'
  // v0.3 (see the "v0.3 chart types & features" section of the contract)
  | 'rangearea'
  | 'bullet'
  | 'dumbbell'
  | 'lollipop'
  | 'slope'
  | 'streamgraph'
  | 'marimekko'
  | 'pyramid'
  | 'calendar'
  | 'radialbar'
  | 'rose'
  | 'violin'
  | 'parallel'
  | 'icicle'
  | 'circlepack'
  | 'wordcloud'
  | 'sankey'
  | 'gantt'
  | 'choropleth'
  | 'network';

/**
 * Mark kinds a series can render as on cartesian charts (combo).
 *
 * v0.3 adds `'rangearea'`: a low→high band. It is a real mark kind, so
 * `SeriesOptions.type: 'rangearea'` is a legal per-series override on any
 * cartesian root — the canonical forecast chart (a confidence band plus a line
 * of the same color) is one chart, one y-axis, no per-type special casing.
 */
export type SeriesKind = 'line' | 'bar' | 'area' | 'scatter' | 'rangearea';

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
  // v0.2 per-type option blocks
  /** histogram only. 'auto' = Freedman–Diaconis, clamped 5..60 */
  histogram?: { bins?: number | 'auto' };
  /** heatmap only. Default ramp: sequentialPalette; min/max default to data extent */
  heatmap?: { ramp?: string[]; min?: number; max?: number };
  /** gauge only. Default 0..100; optional colored ranges */
  /**
   * `bands[].color` is OPTIONAL (v0.4.0): a band with no colour takes the themed
   * status default for its POSITION — first band `theme.up`, last `theme.down`,
   * every band between them `theme.warning` (a lone band is `theme.neutral`).
   * See `charts/radial/gauge.ts#resolveGaugeBands` for the polarity assumption.
   */
  gauge?: { min?: number; max?: number; bands?: { to: number; color?: string }[] };
  /** waterfall only. Hairline connectors between bars, default true */
  waterfall?: { connectors?: boolean };
  // ---- v0.3 cross-cutting features -------------------------------------
  /** default false; 'auto' selectivity when enabled (see DataLabelOptions) */
  dataLabels?: DataLabelOptions | boolean;
  /** reference lines/bands/points/text */
  annotations?: Annotation[];
  /** default false; zoom, pan & brush */
  zoom?: ZoomOptions | boolean;
  // ---- v0.3 per-type option blocks -------------------------------------
  /** rangearea only. Hairline edges on the band, default true */
  rangearea?: { showBounds?: boolean };
  /** bullet only. Qualitative range boundaries (ascending) */
  bullet?: { ranges?: number[]; target?: number };
  /** calendar only */
  calendar?: { start?: Date | number; end?: Date | number; weekStart?: 0 | 1; ramp?: string[] };
  /** violin only. KDE bandwidth; box overlay default true */
  violin?: { bandwidth?: number | 'auto'; showBox?: boolean };
  /** radialbar only. innerRadius 0..1 of outer, default 0.3 */
  radialbar?: { innerRadius?: number; maxValue?: number; track?: boolean };
  /** rose only */
  rose?: { startAngle?: number };
  /** sankey only */
  sankey?: { nodeWidth?: number; nodePadding?: number; align?: 'left' | 'right' | 'justify' };
  /** gantt only */
  gantt?: { rowHeight?: number; today?: Date | number };
  /** wordcloud only */
  wordcloud?: { minFontSize?: number; maxFontSize?: number; rotate?: boolean };
  /** network only. Deterministic force layout (fixedSeed default 1) */
  network?: { linkDistance?: number; charge?: number; iterations?: number; fixedSeed?: number };
  /** choropleth only. GeoJSON is caller-supplied — never bundled. */
  choropleth?: {
    /** REQUIRED — caller supplies topology (never bundled) */
    geojson: GeoFeatureCollection;
    projection?: 'mercator' | 'equirectangular' | 'albersUsa' | 'orthographic';
    /** GeoJSON property matched against data labels; default 'name' */
    featureKey?: string;
    ramp?: string[];
    min?: number;
    max?: number;
    /**
     * What to do with a data row whose label matches NO map feature. Real-world
     * GeoJSON name mismatches ("USA" vs "United States of America") are the norm,
     * so the default is loud but non-fatal.
     *
     * - `'warn'` (default) — the row is not drawn, but it is reported: a
     *   structured `console.warn` naming the unmatched labels and the key used,
     *   plus a sentence in the chart's accessible description. The row still
     *   appears in the a11y table and in `exportData()`, so no datum is lost.
     * - `'strict'` — throw. Pick this in CI or a data pipeline where a typo'd
     *   region must fail the build rather than ship a plausible-looking map.
     * - `'omit'` — drop it silently. Only for deliberately partial datasets.
     */
    unmatched?: 'warn' | 'strict' | 'omit';
  };
  /** parallel only. Dimension order; default = data key order */
  parallel?: { axes?: string[] };
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
  data: SeriesData;
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
  // v0.2:
  /**
   * COMBO: per-series mark override on charts whose root type is
   * line/area/bar/scatter. All series share ONE y-axis (the one-axis rule is
   * non-negotiable — no dual axes, ever).
   */
  type?: SeriesKind;
  /**
   * bubble only: min/max marker DIAMETER px (value maps to AREA, never
   * radius); default [8, 40]
   */
  sizeRange?: [number, number];
  // v0.3:
  /** decoration on line/area/bar/scatter/bubble */
  errorBars?: ErrorBarOptions;
  /** decoration on line/scatter/bubble */
  trendline?: TrendlineOptions;
  /** rangearea: field name when using object data (default 'low') */
  lowKey?: string;
  /** rangearea: field name when using object data (default 'high') */
  highKey?: string;
}

/**
 * Rich object form of a datum (superset; all optional, per-type semantics).
 */
export interface DataPoint {
  x?: number | Date | string;
  y?: number | null;
  label?: string;
  color?: string;
  /** bubble: size value (maps to area) */
  r?: number;
  /** candlestick/ohlc open (y unused) */
  o?: number;
  /** candlestick/ohlc high */
  h?: number;
  /** candlestick/ohlc low */
  l?: number;
  /** candlestick/ohlc close */
  c?: number;
  // boxplot 5-number summary (alt: raw number[] per category)
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  outliers?: number[];
  /** waterfall: value is an absolute total, not a delta */
  isTotal?: boolean;
  /** treemap/sunburst nesting */
  children?: TreeNode[];
  /**
   * Hierarchy node value (treemap / sunburst / icicle / circlepack), i.e. the
   * `TreeNode.value` field. Declared here so a genuine `TreeNode[]` is assignable
   * to `DataValue[]` without a cast; the hierarchy types read it from the RAW
   * data, falling back to `y`.
   */
  value?: number;
  // v0.3 fields:
  /** rangearea / bullet range / gantt span: lower bound */
  low?: number | null;
  /** rangearea / bullet range / gantt span: upper bound */
  high?: number | null;
  /** asymmetric error bar lower bound (absolute value) */
  eLow?: number;
  /** asymmetric error bar upper bound (absolute value) */
  eHigh?: number;
  /** bullet: target marker */
  target?: number;
  /** gantt: task span start */
  start?: number | Date;
  /** gantt: task span end */
  end?: number | Date;
  /** gantt swimlane / network cluster / parallel class */
  group?: string;
  /** wordcloud term weight (alias of y) */
  weight?: number;
  /** network node id, sankey node id */
  id?: string;
}

/** value optional when children present (parent value = sum of children) */
export interface TreeNode {
  label: string;
  value?: number;
  color?: string;
  children?: TreeNode[];
}

/**
 * Node/link payload for the two GRAPH types (v0.3). The contract puts it on the
 * FIRST series: `series: [{ name: 'Flow', data: { nodes, links } }]`.
 *
 * It is deliberately NOT a `DataValue`: it is not one datum, it is the whole
 * series. `SeriesData` therefore admits it alongside `DataValue[]`, so
 * `sankey`/`network` data typechecks without a cast. Endpoints accept a node
 * `id` or a 0-based node index; extra per-node/per-link fields are carried
 * through, which is why both members are index-signature-open.
 */
export interface GraphNodeInput {
  id?: string;
  label?: string;
  color?: string;
  group?: string;
  value?: number;
}

export interface GraphLinkInput {
  source: string | number;
  target: string | number;
  value?: number;
  label?: string;
  color?: string;
}

export interface GraphData {
  nodes: readonly GraphNodeInput[];
  links: readonly GraphLinkInput[];
}

/**
 * What a series carries: a list of data values, or — for `sankey`/`network` —
 * one graph payload. A `TreeNode[]` hierarchy (treemap/sunburst/icicle/
 * circlepack) is also legal: a `TreeNode` is a `DataPoint` with `label`,
 * `value` and `children`.
 */
export type SeriesData = DataValue[] | GraphData;

/**
 * Raw observations for ONE category.
 *
 * `boxplot` and `violin` are specified to accept "raw `number[]`" per category
 * and compute the summary (or the kernel density) themselves — a distribution
 * type's input is a SAMPLE, not a point. Without this member of the union those
 * two types' own documented data shape did not typecheck, and every example had
 * to launder it through `as unknown as DataValue`.
 *
 * Named for the same reason `GraphData` is: a type whose whole datum is a
 * different KIND of thing belongs in the union explicitly, not behind a cast.
 * (See `SeriesData`, which admits the graph payload the same way.)
 */
export type SampleList = number[];

export type DataValue =
  | number
  | null // y against categories/index (null = gap)
  | [number | Date, number | null] // [x, y] pair
  | [number | Date, number, number] // [x, y, r] bubble triple / [x, low, high] range pair
  | [number | Date, number, number, number, number] // [x, o, h, l, c]
  | SampleList // boxplot / violin: raw samples for one category
  | DataPoint;

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

// ---------------------------------------------------------------------------
// v0.3 cross-cutting feature options

export interface ErrorBarOptions {
  // Absolute bounds per point (eLow/eHigh) win; otherwise a uniform value/percent.
  value?: number;
  percent?: number;
  /** px, default 6 */
  capWidth?: number;
  /** default: the series color darkened, else textSecondary */
  color?: string;
}

export interface TrendlineOptions {
  /** default 'linear' */
  type?: 'linear' | 'movingAverage' | 'exponential';
  /** movingAverage window, default 7 */
  period?: number;
  /** default: series color */
  color?: string;
  /** default true — a trendline must never read as data */
  dashed?: boolean;
  /** legend entry; default the series name + " trend" */
  label?: string | false;
}

export interface DataLabelOptions {
  show?: boolean;
  format?: (point: TooltipPoint) => string;
  /**
   * Selectivity is mandatory: 'all' is legal but 'auto' (default) labels only
   * extremes/endpoints and drops labels that would collide.
   */
  select?: 'auto' | 'all' | 'extremes' | 'endpoints' | 'last';
  /** default 'auto' */
  position?: 'outside' | 'inside' | 'auto';
}

export type Annotation =
  | { kind: 'line'; axis: 'x' | 'y'; value: number | Date; label?: string; color?: string; dashed?: boolean }
  | { kind: 'band'; axis: 'x' | 'y'; from: number | Date; to: number | Date; label?: string; color?: string }
  | { kind: 'point'; x: number | Date | string; y: number; label: string; color?: string }
  | { kind: 'text'; x: number | Date | string; y: number; text: string; color?: string };

export interface ZoomOptions {
  enabled?: boolean;
  /** default 'x' */
  axis?: 'x' | 'y' | 'xy';
  /** ctrl/⌘+wheel zoom, default true */
  wheel?: boolean;
  /** drag a brush region to zoom, default true */
  drag?: boolean;
  /** drag to pan once zoomed, default true */
  pan?: boolean;
  /** smallest zoomable x-span in data units */
  minSpan?: number;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: unknown[];
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
  /**
   * Maximum rows MATERIALIZED into the DOM data table; default 2000.
   * `Infinity` removes the bound.
   *
   * The table is a real `<table>` with one `<tr>` per datum. Measured on the
   * bench host that costs ~115 microseconds per row, so raising this to 100,000
   * buys an ~11.5-second synchronous stall on every data change, and 1,000,000
   * exhausts the heap. The default exists for that reason, not to hide data:
   * whatever the cap, the truncation is stated in the table's own `<caption>`
   * and in the chart's accessible description, and `exportData()` is never
   * capped — it always returns every row.
   */
  tableMaxRows?: number;
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
  // v0.3
  /** null = reset */
  zoom: { x?: [number, number]; y?: [number, number] } | null;
  annotationclick: { index: number; annotation: Annotation };
}

/** Programmatic zoom range accepted by `Chart.zoomTo` and echoed by `zoom`. */
export type ZoomRange = { x?: [number, number]; y?: [number, number] } | null;

export interface PointEvent {
  seriesId: string;
  seriesName: string;
  dataIndex: number;
  x: number | Date | string | null;
  y: number | null;
  /**
   * v0.4.0 — the colour of the MARK this event is about, resolved exactly as the
   * chart drew it: a per-datum `color` override, else the mark's own palette slot
   * for the types that assign one per mark (pie/donut, rose, radialbar,
   * sunburst), else the series' palette slot.
   *
   * Present so a click-driven detail panel can show a swatch that MATCHES the
   * chart without re-deriving it. Re-deriving is not merely tedious, it is
   * wrong: palette slots follow series IDENTITY (stable across filtering and
   * updates), not the series' current array index, and per-mark types assign
   * slots per visible slice — so `palette[data.series.indexOf(s)]` silently
   * drifts from what is on screen. `TooltipPoint.color` resolves through the
   * same code path, so a tooltip swatch and a click swatch can never disagree.
   */
  color: string;
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
  // v0.2 status colors (never impersonate series slots)
  /** financial rise / waterfall increase. light '#0ca30c', dark '#0ca30c' */
  up: string;
  /** financial fall / waterfall decrease. light '#d03b3b', dark '#d03b3b' */
  down: string;
  /** waterfall totals & neutral marks. light '#52514e', dark '#c3c2b7' */
  neutral: string;
  /**
   * v0.4.0 — the CAUTION step between `up` and `down`. light '#fab219', dark
   * '#fab219' (the status palette's validated warning step, not a new colour).
   *
   * `up`/`down` covered two of the three states a status mark actually has, so
   * the middle one — a gauge's warning band, a threshold approaching, an
   * "at risk" marker — forced every consumer to hardcode a hex, which is exactly
   * the theming system being defeated one gauge at a time.
   *
   * OPTIONAL, unlike its two siblings, because `Theme` is a type callers
   * CONSTRUCT (`theme?: 'light' | 'dark' | 'auto' | Theme`): making it required
   * would break every hand-written custom theme on upgrade, with the compile
   * error landing in the caller's code. Both built-in themes set it, a partial
   * custom theme has it completed by `resolveTheme`, and the ONE place that
   * resolves the slot for a consumer (`theme#warningColor`) falls back to the
   * same validated value — so nothing downstream ever handles `undefined`.
   */
  warning?: string;
  /**
   * v0.3.1 — set by the pipeline (never by a caller) when `forced-colors:
   * active` is in effect and every color above is a CSS system-color keyword.
   * Read it to skip decoration that assumes an authored palette.
   */
  forcedColors?: boolean;
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
  // v0.3
  /**
   * Re-render offscreen at `scale` (default 2) and resolve a Blob.
   * `'svg'` rejects unless an SVG renderer is available in the build.
   */
  exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob>;
  /** Exactly the a11y table's contents as CSV or JSON (default 'csv'). */
  exportData(opts?: { format?: 'csv' | 'json' }): string;
  /** Programmatic zoom; `null` resets. Emits the `zoom` event. */
  zoomTo(range: ZoomRange): void;
}
