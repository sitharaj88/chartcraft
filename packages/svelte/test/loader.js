/**
 * Minimal in-memory loader for the package's `.svelte` sources.
 *
 * The repo intentionally ships no Svelte vite/vitest plugin (see DEVIATIONS
 * "@chartcraft/svelte ships source ..."), so the components used to be reachable
 * only through their extracted plain-JS helpers. This loader closes that gap
 * WITHOUT adding a dependency: it compiles a component with the installed
 * `svelte/compiler`, rewrites the handful of ESM `import`/`export default`
 * statements the compiler emits into calls on an injected resolver, and
 * evaluates it. Component imports (`./Chart.svelte`) resolve recursively, and
 * everything else resolves to the real module already loaded by vitest — so the
 * component shares one `svelte/internal` instance with the test process, which
 * is what makes lifecycle (onMount) and event dispatch work.
 *
 * The result is the ordinary Svelte 4 client component class:
 *   `new LineChart({ target, props: { options } })`, `$set`, `$on`, `$destroy`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
// The `svelte` export map only serves the DOM runtime under the "browser"
// condition, which vitest's node-side resolver does not set — bare `svelte`
// would hand us `ssr.js`, whose `onMount` is a no-op (components would mount
// but never create a chart). Address the DOM runtime by path instead.
import * as svelteDom from '../../../node_modules/svelte/src/runtime/index.js';
import * as svelteInternal from 'svelte/internal';
import * as core from '@chartcraft/core';
import * as options from '../src/options.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Svelte's DOM runtime (`tick` etc.) — use this, not the bare `svelte` import. */
export const svelte = svelteDom;
export const tick = svelteDom.tick;

/** Modules the compiled output may import, mapped to the live instances. */
const AMBIENT = {
  svelte,
  'svelte/internal': svelteInternal,
  '@chartcraft/core': core,
  './options.js': options,
};

/** name → evaluated component module ({ default: ComponentClass }). */
const cache = new Map();

/**
 * Rewrite the compiler's ESM prologue/epilogue into resolver calls.
 * The generated code only ever uses: side-effect imports, named imports,
 * default imports and a single `export default`.
 *
 * @param {string} code
 * @returns {string}
 */
function toRuntimeModule(code) {
  const body = code.replace(
    /import\s+(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"];?/g,
    (_match, clause, spec) => {
      if (!clause) return ''; // side-effect import (svelte/internal/disclose-version)
      const trimmed = clause.trim();
      if (trimmed.startsWith('{')) {
        // `{ a, b as c }` → `{ a, b: c }`
        return `const ${trimmed.replace(/\bas\b/g, ':')} = __req(${JSON.stringify(spec)});`;
      }
      if (trimmed.startsWith('*')) {
        return `const ${trimmed.replace(/^\*\s*as\s*/, '')} = __req(${JSON.stringify(spec)});`;
      }
      return `const ${trimmed} = __req(${JSON.stringify(spec)}).default;`;
    },
  );
  return body.replace(/export\s+default\s+(\w+);?/, '__exports.default = $1;');
}

/**
 * Compile + evaluate a component from `src/`, recursively resolving the
 * `./X.svelte` imports it makes.
 *
 * @param {string} name component file base name, e.g. 'SankeyChart'
 * @returns {any} the Svelte component class
 */
export function loadComponent(name) {
  const cached = cache.get(name);
  if (cached) return cached.default;

  const source = readFileSync(join(SRC, `${name}.svelte`), 'utf8');
  const { js, warnings } = compile(source, { filename: `${name}.svelte`, generate: 'dom' });
  if (warnings.length) {
    throw new Error(`${name}.svelte compiled with warnings: ${JSON.stringify(warnings)}`);
  }

  const module = { default: undefined };
  cache.set(name, module); // set before evaluating so cycles cannot spin
  const require = (spec) => {
    if (spec in AMBIENT) return AMBIENT[spec];
    if (spec.endsWith('.svelte')) {
      const dep = spec.replace(/^.*\//, '').replace(/\.svelte$/, '');
      loadComponent(dep);
      return cache.get(dep);
    }
    throw new Error(`svelte test loader: unexpected import ${spec} in ${name}.svelte`);
  };
  // eslint-disable-next-line no-new-func
  new Function('__req', '__exports', toRuntimeModule(js.code))(require, module);
  return module.default;
}

/** Mounts a component into a fresh host div appended to the document. */
export function mountComponent(name, props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const Component = loadComponent(name);
  const component = new Component({ target: host, props });
  return { component, host };
}
