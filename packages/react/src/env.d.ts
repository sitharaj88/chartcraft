/**
 * Ambient declaration for the ONE build-time flag this package reads:
 * `process.env.NODE_ENV`, used to fence off the development-only diagnostics in
 * ./dev.ts (see the comment at the top of that file).
 *
 * Declared here rather than by depending on `@types/node`, which would pull all
 * of Node's globals into a browser package's type-check. Nothing imports this
 * file, so it is not part of the published `dist/index.d.ts` and cannot collide
 * with a consumer's own `process` typings.
 */
declare var process: { env: { NODE_ENV?: string } };
