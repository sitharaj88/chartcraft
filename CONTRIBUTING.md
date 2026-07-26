# Contributing to ChartCraft

Thanks for helping build ChartCraft. This document explains how the repo is
laid out, how changes flow through it, and what we expect from a pull request.

## Dev setup

Requirements: Node 18+ and npm 9+ (workspaces).

```sh
git clone <repo-url> chartcraft && cd chartcraft
npm install        # installs all workspaces from the repo root
npm run build      # builds @chartcraft/core, then the wrappers (tsup)
npm test           # vitest across all packages
```

Useful extras:

```sh
npm run bench      # performance benchmarks (packages/core/bench/)
npx serve .        # serve the repo root to open examples/*.html
```

Do not run `npm install` inside individual packages — always install from the
root so the workspace graph stays consistent.

## Workspace layout

```
packages/
  core/      @chartcraft/core     — framework-agnostic engine (zero runtime deps)
  react/     @chartcraft/react    — React 18+ wrapper
  vue/       @chartcraft/vue     — Vue 3 wrapper
  svelte/    @chartcraft/svelte  — Svelte 4/5 wrapper
docs/        — guides, concepts, per-framework docs, API reference
  api-contract.md — THE public API contract (source of truth)
examples/    — self-contained vanilla HTML demos against the built core
ARCHITECTURE.md — architecture decisions and rationale
DEVIATIONS.md   — recorded deviations from the contract (should be empty)
```

## The contract-first workflow

`docs/api-contract.md` **is law**. Every public function, option, type, event,
and default lives there. The order of operations for any API change is:

1. **Change `docs/api-contract.md` first.** Propose the new surface in a PR (or
   the first commit of one). Get it reviewed as a contract change.
2. **Implement in `@chartcraft/core`.** Core implements exactly the contract —
   names, types, defaults, and behavior.
3. **Update the wrappers.** React, Vue, Svelte, and Angular stay at feature parity;
   wrappers remain thin (lifecycle, resize, event bridging only — no chart
   logic outside core).
4. **Update the docs and examples.** Guides, `docs/api/core.md`, and any
   affected `examples/*.html` must match the new contract in the same PR.

If an implementation is forced to deviate from the contract (browser
constraint, perf reality), record the deviation in `/DEVIATIONS.md` with the
reason, and open an issue to reconcile the contract. Silent divergence is a
bug.

## Testing expectations

- **Core:** vitest + jsdom. Canvas 2D is stubbed in `test/setup.ts`. Unit-test
  the pure stages — scale math, layout, data normalization, LTTB downsampling,
  a11y tree text, theme resolution — and assert renderer call logs against the
  stub. New option fields need tests for their default and at least one
  non-default value.
- **Wrappers:** mount / update / destroy tests against the real core. A prop
  change must call `chart.update`, unmount must call `chart.destroy`, and
  events must bridge with correct payload types.
- **Accessibility:** any change touching the DOM layer, keyboard handling, or
  announcements needs an a11y-tree assertion (roles, names, table content,
  live-region text).
- No PR may reduce coverage of the pure stages. Bug fixes come with a
  regression test.

## Palette and theme changes

The default palette is a **validated colorblind-safety mechanism**, not a
style choice. The 8-slot categorical order guarantees adjacent-pair CVD
ΔE ≥ 8 in both light and dark modes.

- Never re-sort the slots, alter the hexes, or cycle hues past slot 8.
- **Any change to palette values or order requires re-running the colorblind
  validator** for both `light` and `dark` modes against their surfaces, and
  the PR must include the validator output.

## PR checklist

- [ ] `docs/api-contract.md` updated first if the public surface changed
- [ ] Core, wrappers, docs, and examples all match the contract (no silent drift; deviations recorded in `DEVIATIONS.md`)
- [ ] `npm run build` and `npm test` pass from the repo root
- [ ] New/changed behavior covered by tests (pure stages, wrapper lifecycle, a11y tree as applicable)
- [ ] Every code sample added to docs compiles against the contract types
- [ ] Palette/order changes: colorblind validator re-run for light **and** dark; output attached to the PR
- [ ] No new runtime dependencies in `@chartcraft/core`
- [ ] Public types exported; ESM + CJS + `.d.ts` build clean
- [ ] Commit history squashed to one commit per delivered change

## Code style

- TypeScript strict mode everywhere; no `any` in public signatures.
- No per-frame allocation in render-loop code paths (see `ARCHITECTURE.md`,
  Performance principles).
- Chart code never touches the canvas API directly — always through the
  `Renderer` interface.
