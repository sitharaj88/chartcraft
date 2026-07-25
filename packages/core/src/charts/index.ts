/**
 * Chart-type registration. `registerBuiltinChartTypes()` populates the
 * registry with every built-in definition, then fills the remaining v0.2
 * contract ids with "not implemented" placeholders that throw a helpful
 * error. It is idempotent and is invoked both on import and lazily by the
 * pipeline (model.ts) before any registry lookup — the package ships with
 * `sideEffects: false`, so correctness must never depend on a side-effect
 * import surviving tree-shaking.
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
  registerStatisticalChartTypes(); // bubble, histogram, boxplot, candlestick, ohlc, waterfall
  registerRadialChartTypes(); //      radar, gauge, funnel
  registerMatrixChartTypes(); //      heatmap, treemap, sunburst

  // Placeholders throw a helpful error for any contract id that ever lands
  // without a registered definition; they never overwrite a real one.
  registerPlaceholders();
}

// NOTE: no eager top-level registerBuiltinChartTypes() call here. This module
// sits inside an import cycle (model.ts -> charts/index.ts -> type modules ->
// model.ts), so running registration during module evaluation would execute
// against partially-initialized modules. The pipeline (model.ts) invokes it
// lazily before every registry lookup, when all modules are fully evaluated.
