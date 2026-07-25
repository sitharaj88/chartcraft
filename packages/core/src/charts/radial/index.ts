/**
 * Radial chart types: radar, gauge, funnel.
 *
 * `registerRadialChartTypes()` is idempotent and replaces the "not
 * implemented" placeholders for these ids (registerChartType replaces
 * placeholders silently; `registerPlaceholders()` never overwrites a real
 * definition, so calling this before OR after the built-in registration is
 * safe). The integrator wires it into the built-ins; until then, callers
 * (and tests) invoke it directly before creating charts.
 */
import { registerChartType } from '../registry';
import { radarDefinition } from './radar';
import { gaugeDefinition } from './gauge';
import { funnelDefinition } from './funnel';

let registered = false;

export function registerRadialChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(radarDefinition);
  registerChartType(gaugeDefinition);
  registerChartType(funnelDefinition);
}

export { radarDefinition, gaugeDefinition, funnelDefinition };
