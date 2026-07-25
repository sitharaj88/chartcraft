/**
 * Flow & schedule chart types: `sankey` and `gantt`.
 *
 * `registerFlowChartTypes()` is IDEMPOTENT and replaces the registry's
 * throwing "not implemented" placeholders for both ids. The integrator wires
 * this call into `src/charts/index.ts` (above `registerPlaceholders()`); until
 * then, importing this module and calling it registers the pair on its own —
 * which is exactly what the tests do.
 */
import { registerChartType } from '../registry';
import { sankeyDefinition } from './sankey';
import { ganttDefinition } from './gantt';

let registered = false;

export function registerFlowChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(sankeyDefinition);
  registerChartType(ganttDefinition);
}

export { sankeyDefinition } from './sankey';
export { ganttDefinition } from './gantt';
export * from './graph';
export * from './schedule';
export { fitText } from './shared';
