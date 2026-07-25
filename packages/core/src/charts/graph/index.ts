/**
 * Graph chart types: network (+ the deterministic force-simulation engine it
 * is built on).
 *
 * `registerGraphChartTypes()` is idempotent and safe to call in any order with
 * the built-in registration (`registerBuiltinChartTypes()`): a real definition
 * always replaces the "not implemented" placeholder for its id, and
 * placeholders never overwrite a real definition. The integrator wires this
 * call into `src/charts/index.ts`; tests call it directly.
 */
import { registerChartType } from '../registry';
import { networkDefinition } from './network';

let registered = false;

export function registerGraphChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(networkDefinition);
}

export { networkDefinition };
export {
  networkForceConfig,
  networkGraphOf,
  networkMaxRadius,
  NETWORK_LINK_ALPHA,
  NETWORK_LINK_WIDTH,
  NETWORK_NODE_MAX_R,
  NETWORK_NODE_MIN_R,
  type NetworkGeomExtra,
  type NetworkNodeGeom,
} from './network';
export {
  nodeColor,
  nodeRadii,
  parseNetworkGraph,
  type NetworkGraph,
  type NetworkLink,
  type NetworkNode,
} from './graph';
export {
  clearForceCache,
  fitPositions,
  forceCacheKey,
  linkDegrees,
  mulberry32,
  phyllotaxisPositions,
  simulateForce,
  simulateForceCached,
  FORCE_DEFAULTS,
  GOLDEN_ANGLE,
  type ForceConfig,
  type ForceLink,
  type ForcePositions,
} from './force';
export {
  barnesHutRepulsion,
  buildQuadtree,
  deterministicOffset,
  pairwiseRepulsion,
  MAX_QUAD_DEPTH,
  type QuadTreeNode,
} from './quadtree';
