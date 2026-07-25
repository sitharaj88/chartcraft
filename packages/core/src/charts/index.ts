/**
 * Chart-type registration. `registerBuiltinChartTypes()` populates the
 * registry with every built-in definition, then fills the remaining contract
 * ids (all 39 are declared; the 20 v0.3 ones have no module yet) with "not
 * implemented" placeholders that throw a helpful error. It is idempotent and
 * is invoked lazily by the pipeline (model.ts) before any registry lookup —
 * the package ships with `sideEffects: false`, so correctness must never
 * depend on a side-effect import surviving tree-shaking.
 *
 * ADDING A TYPE (see ./AUTHORING.md): create src/charts/<id>.ts exporting a
 * ChartTypeDefinition and add ONE registerChartType(...) call below, above
 * registerPlaceholders(). Registration order between real definitions does
 * not matter; placeholders never overwrite a real definition.
 */
import { registerChartType, registerPlaceholders } from './registry';
import { areaDefinition, barDefinition, lineDefinition, scatterDefinition } from './cartesian';
import { donutDefinition, pieDefinition } from './pie';
import { sparklineDefinition } from './sparkline';
import { registerStatisticalChartTypes } from './statistical';
import { registerRadialChartTypes } from './radial';
import { registerMatrixChartTypes } from './matrix';
import { registerIntervalChartTypes } from './interval';
import { registerCompositionChartTypes } from './composition';
import { registerPolarChartTypes } from './polar';
import { registerDistributionChartTypes } from './distribution';
import { registerHierarchyChartTypes } from './hierarchy';
import { registerFlowChartTypes } from './flow';
import { registerGeoChartTypes } from './geo';
import { registerGraphChartTypes } from './graph';

let registered = false;

export function registerBuiltinChartTypes(): void {
  if (registered) return;
  registered = true;

  registerChartType(lineDefinition);
  registerChartType(areaDefinition);
  registerChartType(barDefinition);
  registerChartType(scatterDefinition);
  registerChartType(pieDefinition);
  registerChartType(donutDefinition);
  registerChartType(sparklineDefinition);
  // v0.2
  registerStatisticalChartTypes(); //  bubble, histogram, boxplot, candlestick, ohlc, waterfall
  registerRadialChartTypes(); //       radar, gauge, funnel
  registerMatrixChartTypes(); //       heatmap, treemap, sunburst
  // v0.3
  registerIntervalChartTypes(); //     rangearea, bullet, dumbbell, lollipop, slope
  registerCompositionChartTypes(); //  streamgraph, marimekko, pyramid, calendar
  registerPolarChartTypes(); //        radialbar, rose
  registerDistributionChartTypes(); // violin, parallel
  registerHierarchyChartTypes(); //    icicle, circlepack, wordcloud
  registerFlowChartTypes(); //         sankey, gantt
  registerGeoChartTypes(); //          choropleth
  registerGraphChartTypes(); //        network

  // Placeholders throw a helpful error for any contract id that ever lands
  // without a registered definition; they never overwrite a real one.
  registerPlaceholders();
}

// NOTE: no eager top-level registerBuiltinChartTypes() call here. This module
// sits inside an import cycle (model.ts -> charts/index.ts -> type modules ->
// model.ts), so running registration during module evaluation would execute
// against partially-initialized modules. The pipeline (model.ts) invokes it
// lazily before every registry lookup, when all modules are fully evaluated.
