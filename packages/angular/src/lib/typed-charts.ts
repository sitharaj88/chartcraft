/**
 * The 39 per-type ChartCraft Angular components.
 *
 * Each is a standalone, OnPush component that injects its `type` into the
 * options before handing them to core, so `options` is `ChartOptions` minus
 * `type`. Everything else — inputs, the six outputs, the `chart` signal, the
 * SSR-safe lifecycle — is inherited from {@link ChartBase}.
 *
 * The list mirrors core's `ChartType` union exactly; `typed-charts.test.ts`
 * enforces that with a `Record<ChartType, …>`, so a chart type added to core
 * without a component here fails `tsc`.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ChartBase, type TypedChartOptions } from './chart-base';

// ---------------------------------------------------------------- v0.1 types

/** `<cc-line-chart [options]="opts" />` — injects `type: 'line'`. */
@Component({
  selector: 'cc-line-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcLineChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'line';
}

/** `<cc-area-chart [options]="opts" />` — injects `type: 'area'`. */
@Component({
  selector: 'cc-area-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcAreaChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'area';
}

/** `<cc-bar-chart [options]="opts" />` — injects `type: 'bar'`. */
@Component({
  selector: 'cc-bar-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcBarChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'bar';
}

/** `<cc-scatter-chart [options]="opts" />` — injects `type: 'scatter'`. */
@Component({
  selector: 'cc-scatter-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcScatterChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'scatter';
}

/** `<cc-pie-chart [options]="opts" />` — injects `type: 'pie'`. */
@Component({
  selector: 'cc-pie-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcPieChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'pie';
}

/** `<cc-donut-chart [options]="opts" />` — injects `type: 'donut'`. */
@Component({
  selector: 'cc-donut-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcDonutChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'donut';
}

// ---------------------------------------------------------------- v0.2 types

/** `<cc-bubble-chart [options]="opts" />` — injects `type: 'bubble'`. */
@Component({
  selector: 'cc-bubble-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcBubbleChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'bubble';
}

/** `<cc-sparkline-chart [options]="opts" />` — injects `type: 'sparkline'`. */
@Component({
  selector: 'cc-sparkline-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcSparklineChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'sparkline';
}

/** `<cc-histogram-chart [options]="opts" />` — injects `type: 'histogram'`. */
@Component({
  selector: 'cc-histogram-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcHistogramChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'histogram';
}

/** `<cc-boxplot-chart [options]="opts" />` — injects `type: 'boxplot'`. */
@Component({
  selector: 'cc-boxplot-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcBoxplotChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'boxplot';
}

/** `<cc-candlestick-chart [options]="opts" />` — injects `type: 'candlestick'`. */
@Component({
  selector: 'cc-candlestick-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcCandlestickChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'candlestick';
}

/** `<cc-ohlc-chart [options]="opts" />` — injects `type: 'ohlc'`. */
@Component({
  selector: 'cc-ohlc-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcOhlcChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'ohlc';
}

/** `<cc-waterfall-chart [options]="opts" />` — injects `type: 'waterfall'`. */
@Component({
  selector: 'cc-waterfall-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcWaterfallChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'waterfall';
}

/** `<cc-heatmap-chart [options]="opts" />` — injects `type: 'heatmap'`. */
@Component({
  selector: 'cc-heatmap-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcHeatmapChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'heatmap';
}

/** `<cc-treemap-chart [options]="opts" />` — injects `type: 'treemap'`. */
@Component({
  selector: 'cc-treemap-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcTreemapChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'treemap';
}

/** `<cc-sunburst-chart [options]="opts" />` — injects `type: 'sunburst'`. */
@Component({
  selector: 'cc-sunburst-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcSunburstChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'sunburst';
}

/** `<cc-funnel-chart [options]="opts" />` — injects `type: 'funnel'`. */
@Component({
  selector: 'cc-funnel-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcFunnelChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'funnel';
}

/** `<cc-radar-chart [options]="opts" />` — injects `type: 'radar'`. */
@Component({
  selector: 'cc-radar-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcRadarChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'radar';
}

/** `<cc-gauge-chart [options]="opts" />` — injects `type: 'gauge'`. */
@Component({
  selector: 'cc-gauge-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcGaugeChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'gauge';
}

// ---------------------------------------------------------------- v0.3 types

/** `<cc-rangearea-chart [options]="opts" />` — injects `type: 'rangearea'`. */
@Component({
  selector: 'cc-rangearea-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcRangeareaChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'rangearea';
}

/** `<cc-bullet-chart [options]="opts" />` — injects `type: 'bullet'`. */
@Component({
  selector: 'cc-bullet-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcBulletChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'bullet';
}

/** `<cc-dumbbell-chart [options]="opts" />` — injects `type: 'dumbbell'`. */
@Component({
  selector: 'cc-dumbbell-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcDumbbellChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'dumbbell';
}

/** `<cc-lollipop-chart [options]="opts" />` — injects `type: 'lollipop'`. */
@Component({
  selector: 'cc-lollipop-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcLollipopChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'lollipop';
}

/** `<cc-slope-chart [options]="opts" />` — injects `type: 'slope'`. */
@Component({
  selector: 'cc-slope-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcSlopeChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'slope';
}

/** `<cc-streamgraph-chart [options]="opts" />` — injects `type: 'streamgraph'`. */
@Component({
  selector: 'cc-streamgraph-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcStreamgraphChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'streamgraph';
}

/** `<cc-marimekko-chart [options]="opts" />` — injects `type: 'marimekko'`. */
@Component({
  selector: 'cc-marimekko-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcMarimekkoChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'marimekko';
}

/** `<cc-pyramid-chart [options]="opts" />` — injects `type: 'pyramid'`. */
@Component({
  selector: 'cc-pyramid-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcPyramidChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'pyramid';
}

/** `<cc-calendar-chart [options]="opts" />` — injects `type: 'calendar'`. */
@Component({
  selector: 'cc-calendar-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcCalendarChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'calendar';
}

/** `<cc-radialbar-chart [options]="opts" />` — injects `type: 'radialbar'`. */
@Component({
  selector: 'cc-radialbar-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcRadialbarChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'radialbar';
}

/** `<cc-rose-chart [options]="opts" />` — injects `type: 'rose'`. */
@Component({
  selector: 'cc-rose-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcRoseChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'rose';
}

/** `<cc-violin-chart [options]="opts" />` — injects `type: 'violin'`. */
@Component({
  selector: 'cc-violin-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcViolinChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'violin';
}

/** `<cc-parallel-chart [options]="opts" />` — injects `type: 'parallel'`. */
@Component({
  selector: 'cc-parallel-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcParallelChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'parallel';
}

/** `<cc-icicle-chart [options]="opts" />` — injects `type: 'icicle'`. */
@Component({
  selector: 'cc-icicle-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcIcicleChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'icicle';
}

/** `<cc-circlepack-chart [options]="opts" />` — injects `type: 'circlepack'`. */
@Component({
  selector: 'cc-circlepack-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcCirclepackChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'circlepack';
}

/** `<cc-wordcloud-chart [options]="opts" />` — injects `type: 'wordcloud'`. */
@Component({
  selector: 'cc-wordcloud-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcWordcloudChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'wordcloud';
}

/** `<cc-sankey-chart [options]="opts" />` — injects `type: 'sankey'`. */
@Component({
  selector: 'cc-sankey-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcSankeyChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'sankey';
}

/** `<cc-gantt-chart [options]="opts" />` — injects `type: 'gantt'`. */
@Component({
  selector: 'cc-gantt-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcGanttChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'gantt';
}

/** `<cc-choropleth-chart [options]="opts" />` — injects `type: 'choropleth'`. */
@Component({
  selector: 'cc-choropleth-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcChoroplethChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'choropleth';
}

/** `<cc-network-chart [options]="opts" />` — injects `type: 'network'`. */
@Component({
  selector: 'cc-network-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcNetworkChart extends ChartBase<TypedChartOptions> {
  protected override readonly chartType = 'network';
}
