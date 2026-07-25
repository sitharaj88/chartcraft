/**
 * Ambient declarations for the benchmark host.
 *
 * The bench runs on Node and uses jsdom, but core ships ZERO runtime
 * dependencies and the workspace carries no `@types/node` / `@types/jsdom`.
 * Rather than add type-only dev dependencies for a script, the two surfaces the
 * bench actually touches are declared here — narrowly, so a typo is still a
 * compile error.
 */

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { pretendToBeVisual?: boolean; url?: string });
    readonly window: Window & typeof globalThis;
  }
}

declare const process: {
  readonly version: string;
  readonly platform: string;
  readonly arch: string;
  memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
};
