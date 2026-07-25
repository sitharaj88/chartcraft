/**
 * Distribution chart types: violin, parallel.
 *
 * `registerDistributionChartTypes()` is idempotent and replaces the "not
 * implemented" placeholders for these ids (`registerChartType` replaces
 * placeholders silently, and `registerPlaceholders()` never overwrites a real
 * definition, so calling this before OR after the built-in registration is
 * safe). The integrator wires it into the built-ins; until then callers (and
 * tests) invoke it directly before creating charts.
 */
import { registerChartType } from '../registry';
import { violinDefinition } from './violin';
import { parallelDefinition } from './parallel';

let registered = false;

export function registerDistributionChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(violinDefinition);
  registerChartType(parallelDefinition);
}

export { violinDefinition, parallelDefinition };
