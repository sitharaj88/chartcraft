/**
 * Public-surface tests: selectors, inputs/outputs metadata (read back from the
 * real AOT-compiled component definitions via `reflectComponentType`), and
 * exhaustiveness against core's `ChartType` union.
 */
import { describe, expect, it } from 'vitest';
import { reflectComponentType, type Type } from '@angular/core';
import * as api from '../src/public-api';
import type { ChartType } from '../src/public-api';

/** The six bridged core events, plus the 0.3.1 lifecycle output. */
const OUTPUTS = [
  'pointClick',
  'pointEnter',
  'pointLeave',
  'legendToggle',
  'zoom',
  'annotationClick',
  'ready',
];

/**
 * `Record<ChartType, …>` makes this exhaustive at COMPILE time: a chart type
 * added to core without a component here fails `tsc`.
 */
const BY_TYPE: Record<ChartType, Type<unknown>> = {
  line: api.CcLineChart,
  area: api.CcAreaChart,
  bar: api.CcBarChart,
  scatter: api.CcScatterChart,
  pie: api.CcPieChart,
  donut: api.CcDonutChart,
  bubble: api.CcBubbleChart,
  sparkline: api.CcSparklineChart,
  histogram: api.CcHistogramChart,
  boxplot: api.CcBoxplotChart,
  candlestick: api.CcCandlestickChart,
  ohlc: api.CcOhlcChart,
  waterfall: api.CcWaterfallChart,
  heatmap: api.CcHeatmapChart,
  treemap: api.CcTreemapChart,
  sunburst: api.CcSunburstChart,
  funnel: api.CcFunnelChart,
  radar: api.CcRadarChart,
  gauge: api.CcGaugeChart,
  rangearea: api.CcRangeareaChart,
  bullet: api.CcBulletChart,
  dumbbell: api.CcDumbbellChart,
  lollipop: api.CcLollipopChart,
  slope: api.CcSlopeChart,
  streamgraph: api.CcStreamgraphChart,
  marimekko: api.CcMarimekkoChart,
  pyramid: api.CcPyramidChart,
  calendar: api.CcCalendarChart,
  radialbar: api.CcRadialbarChart,
  rose: api.CcRoseChart,
  violin: api.CcViolinChart,
  parallel: api.CcParallelChart,
  icicle: api.CcIcicleChart,
  circlepack: api.CcCirclepackChart,
  wordcloud: api.CcWordcloudChart,
  sankey: api.CcSankeyChart,
  gantt: api.CcGanttChart,
  choropleth: api.CcChoroplethChart,
  network: api.CcNetworkChart,
};

describe('public surface (Angular)', () => {
  it('exports one component per ChartType id — 39 of them', () => {
    expect(Object.keys(BY_TYPE)).toHaveLength(39);
    for (const [type, component] of Object.entries(BY_TYPE)) {
      expect(component, `no component exported for type "${type}"`).toBeTruthy();
    }
  });

  it('every per-type component uses the cc-<type>-chart selector and is standalone', () => {
    for (const [type, component] of Object.entries(BY_TYPE)) {
      const mirror = reflectComponentType(component);
      expect(mirror, `${type} is not a component`).not.toBeNull();
      expect(mirror!.selector).toBe(`cc-${type}-chart`);
      expect(mirror!.isStandalone).toBe(true);
    }
  });

  it('the generic component is <cc-chart> and standalone', () => {
    const mirror = reflectComponentType(api.CcChart)!;
    expect(mirror.selector).toBe('cc-chart');
    expect(mirror.isStandalone).toBe(true);
  });

  it('every component declares the single `options` input and the seven outputs', () => {
    for (const component of [api.CcChart, ...Object.values(BY_TYPE)]) {
      const mirror = reflectComponentType(component)!;
      expect(mirror.inputs.map((i) => i.templateName)).toEqual(['options']);
      expect(mirror.outputs.map((o) => o.templateName)).toEqual(OUTPUTS);
      expect(mirror.outputs.map((o) => o.propName)).toEqual(OUTPUTS);
    }
  });

  it('exports the ChartBase directive for advanced extension', () => {
    expect(typeof api.ChartBase).toBe('function');
  });
});
