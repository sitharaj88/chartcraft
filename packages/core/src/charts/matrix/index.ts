/**
 * Matrix & hierarchy chart types: heatmap, treemap, sunburst.
 *
 * `registerMatrixChartTypes()` is idempotent and safe to call in any order
 * with the built-in registration (`registerBuiltinChartTypes()`): real
 * definitions always replace the "not implemented" placeholders and
 * placeholders never overwrite real definitions. The integrator wires this
 * into `src/charts/index.ts`; tests call it directly.
 */
import { registerChartType } from '../registry';
import { heatmapDefinition } from './heatmap';
import { treemapDefinition } from './treemap';
import { sunburstDefinition } from './sunburst';

let registered = false;

export function registerMatrixChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(heatmapDefinition);
  registerChartType(treemapDefinition);
  registerChartType(sunburstDefinition);
}

export { heatmapDefinition, treemapDefinition, sunburstDefinition };
