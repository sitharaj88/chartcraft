/**
 * Hierarchy & text-layout chart types (v0.3): icicle, circlepack, wordcloud.
 *
 * `registerHierarchyChartTypes()` is idempotent and safe to call in ANY order
 * relative to the built-in registration: `registerChartType` replaces the
 * "not implemented" placeholders silently and `registerPlaceholders()` never
 * overwrites a real definition. The integrator wires this into
 * `src/charts/index.ts`; until then callers (and tests) invoke it directly
 * before creating charts.
 */
import { registerChartType } from '../registry';
import { icicleDefinition } from './icicle';
import { circlepackDefinition } from './circlepack';
import { wordcloudDefinition } from './wordcloud';

let registered = false;

export function registerHierarchyChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(icicleDefinition);
  registerChartType(circlepackDefinition);
  registerChartType(wordcloudDefinition);
}

export { icicleDefinition, circlepackDefinition, wordcloudDefinition };
