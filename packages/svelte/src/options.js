/**
 * Plain-JS helpers shared by the ChartCraft Svelte components.
 * Kept framework-free so wrapper logic is unit-testable without compiling
 * .svelte files.
 */

/** Core event names bridged (via createEventDispatcher) by every component. */
export const EVENTS = /** @type {const} */ (['pointclick', 'pointenter', 'pointleave', 'legendtoggle']);

/**
 * Merge a fixed chart type into type-less options (used by the per-type
 * convenience components). Never mutates the input; the injected type always
 * wins over any `type` already present.
 *
 * @param {object} options - chart options without `type`
 * @param {string} type - the chart type to inject
 * @returns {object} full ChartOptions
 */
export function withType(options, type) {
  return { ...options, type };
}
