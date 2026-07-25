/**
 * Word-cloud chart-type definition (v0.3 contract).
 *
 * One series of `{x: term, y: weight}` (`weight` is an accepted alias of `y`
 * and the normalizer already folds it into `y`). Terms are ranked by weight
 * DESCENDING (ties keep data order) and laid out largest-first on an
 * Archimedean spiral with box collision avoidance; a term that cannot be
 * placed inside the plot is dropped from the picture but never from the a11y
 * table.
 *
 * Contract specifics honored here:
 *
 * - font size is interpolated linearly between `wordcloud.minFontSize` and
 *   `wordcloud.maxFontSize` by weight;
 * - optional 90° rotation per `wordcloud.rotate`;
 * - colors cycle the categorical slots **IN ORDER BY RANK** — `theme.series[
 *   rank % 8]`. This is the ONE sanctioned place where text wears a series
 *   color: here the text IS the mark, so the usual "text in ink colors" rule
 *   does not apply (every other label in this folder is ink-colored);
 * - the layout is deterministic: the spiral is analytic and its only
 *   pseudo-random ingredient (a per-word start phase) comes from a
 *   fixed-seed generator. No `Math.random()`, so the same data renders
 *   identically every time.
 *
 * Text metrics: collision detection needs real widths, so the layout takes a
 * `measure` callback which the definition wires to the renderer's
 * `measureText` path. When metrics are unavailable (a non-finite or zero
 * width — e.g. a headless canvas stub) the layout falls back to the documented
 * estimate `term.length * fontSize * FALLBACK_WIDTH_RATIO`. Height has no
 * metrics API in the `Renderer` contract at all, so a line box is always
 * estimated as `fontSize * LINE_HEIGHT_RATIO`.
 *
 * Keyboard navigation walks terms BY RANK (pi = rank), and the a11y table is
 * ordered the same way: term, weight, rank.
 */
import type { TooltipPoint } from '../../types';
import type { PointPos, Rect, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { DataModel } from '../../model';
import type { ChartTypeDefinition } from '../registry';
import type { LegendItem } from '../../components/legend';
import { formatValue } from '../../util';
import { seededRandom } from './shared';

/** Fixed seed for the per-word spiral phase (determinism, not secrecy). */
export const WORDCLOUD_SEED = 0x577d_c10d;
/** `wordcloud.minFontSize` default. */
export const DEFAULT_MIN_FONT_SIZE = 12;
/** `wordcloud.maxFontSize` default. */
export const DEFAULT_MAX_FONT_SIZE = 48;
/** Line box height as a multiple of font size (no height metrics exist). */
export const LINE_HEIGHT_RATIO = 1.2;
/** Fallback per-character width ratio when text metrics are unavailable. */
export const FALLBACK_WIDTH_RATIO = 0.6;
/** Radians advanced per spiral probe. */
export const SPIRAL_STEP = 0.15;
/** Spiral growth in px per radian. */
export const SPIRAL_TIGHTNESS = 1.1;
/** Probes per word before it is given up on. */
export const SPIRAL_MAX_PROBES = 1600;
/** Gap kept between neighboring word boxes, px. */
export const WORD_GAP = 2;

export interface WordTerm {
  term: string;
  weight: number;
  /** Index of the backing datum in the series. */
  pi: number;
  /** Per-datum color override (`DataPoint.color`). */
  color?: string;
}

export interface WordPlacement extends WordTerm {
  /** 0 = heaviest term. */
  rank: number;
  fontSize: number;
  rotated: boolean;
  /** Resolved fill: the datum override, else the rank's categorical slot. */
  fill: string;
  /** Text anchor (center of the word box). */
  x: number;
  y: number;
  /** Occupied box size, AFTER rotation. */
  w: number;
  h: number;
  placed: boolean;
}

export interface WordcloudGeomExtra {
  /** Indexed by rank. */
  words: WordPlacement[];
  /** MODEL index of the (single) visible series. */
  si: number;
}

/**
 * Linear interpolation of font size by weight. A degenerate weight range
 * (one term, or every term equal) puts every word at `maxFontSize` — they are
 * all equally important, so none should read as smaller.
 */
export function wordFontSize(
  weight: number,
  minWeight: number,
  maxWeight: number,
  minFontSize: number,
  maxFontSize: number,
): number {
  if (!(maxWeight > minWeight)) return maxFontSize;
  const t = (weight - minWeight) / (maxWeight - minWeight);
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  return minFontSize + tt * (maxFontSize - minFontSize);
}

/** Terms in RANK order: weight descending, ties in data order. */
export function rankTerms(terms: readonly WordTerm[]): WordTerm[] {
  return [...terms].sort((a, b) => b.weight - a.weight || a.pi - b.pi);
}

/** Extract the word terms of the first visible series from the model. */
export function wordTermsOf(model: DataModel): { terms: WordTerm[]; si: number } {
  const si = model.series.findIndex((s) => s.visible);
  if (si < 0) return { terms: [], si: -1 };
  const series = model.series[si];
  const terms: WordTerm[] = (series?.points ?? []).map((p, pi) => {
    const cat = model.categories?.[pi];
    const term =
      p.label ??
      (typeof p.x === 'string' ? p.x : cat !== undefined ? formatValue(cat) : String(pi + 1));
    // `weight` is the contract's alias of y; the normalizer already mirrors it
    // into y, but an explicit weight always wins if both were supplied.
    const raw = p.weight ?? p.y ?? 0;
    const t: WordTerm = { term, weight: raw > 0 ? raw : 0, pi };
    if (p.color !== undefined) t.color = p.color;
    return t;
  });
  return { terms, si };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

export interface WordcloudLayoutArgs {
  terms: readonly WordTerm[];
  plot: Rect;
  minFontSize: number;
  maxFontSize: number;
  rotate: boolean;
  /** Categorical slots, cycled by rank. */
  palette: readonly string[];
  /** Text width at a given font size (renderer-backed). */
  measure(term: string, fontSize: number): number;
  seed?: number;
}

/**
 * Deterministic spiral layout with collision avoidance. Returns one placement
 * per term, INDEXED BY RANK (index 0 = heaviest term).
 *
 * The heaviest word always lands dead center (its first probe is at spiral
 * radius 0); each subsequent word walks outward until its box clears every
 * already-placed box and sits fully inside the plot. The spiral is stretched
 * horizontally by the plot's aspect ratio so a wide plot fills out sideways
 * instead of leaving vertical slack.
 */
export function layoutWordCloud(args: WordcloudLayoutArgs): WordPlacement[] {
  const { plot, palette } = args;
  const ranked = rankTerms(args.terms);
  if (ranked.length === 0) return [];

  const weights = ranked.map((t) => t.weight);
  const maxWeight = Math.max(...weights);
  const minWeight = Math.min(...weights);

  const rand = seededRandom(args.seed ?? WORDCLOUD_SEED);
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const aspect = plot.h > 0 ? Math.max(1, plot.w / plot.h) : 1;

  const placedBoxes: Box[] = [];
  const out: WordPlacement[] = [];

  ranked.forEach((t, rank) => {
    const fontSize = wordFontSize(t.weight, minWeight, maxWeight, args.minFontSize, args.maxFontSize);
    const rotated = args.rotate && rank % 2 === 1;
    const measured = args.measure(t.term, fontSize);
    const textW =
      Number.isFinite(measured) && measured > 0 ? measured : t.term.length * fontSize * FALLBACK_WIDTH_RATIO;
    const textH = fontSize * LINE_HEIGHT_RATIO;
    const w = rotated ? textH : textW;
    const h = rotated ? textW : textH;
    const fill = t.color ?? palette[rank % Math.max(1, palette.length)] ?? '#888888';

    // Deterministic per-word start phase (seeded, never Math.random).
    const phase = rand() * Math.PI * 2;

    const placement: WordPlacement = {
      ...t,
      rank,
      fontSize,
      rotated,
      fill,
      x: cx,
      y: cy,
      w,
      h,
      placed: false,
    };

    if (w <= plot.w && h <= plot.h && t.weight >= 0) {
      for (let probe = 0; probe <= SPIRAL_MAX_PROBES; probe++) {
        const theta = probe * SPIRAL_STEP;
        const radius = SPIRAL_TIGHTNESS * theta;
        const px = cx + Math.cos(theta + phase) * radius * aspect;
        const py = cy + Math.sin(theta + phase) * radius;
        const box: Box = { x: px - w / 2, y: py - h / 2, w, h };
        if (box.x < plot.x || box.y < plot.y || box.x + box.w > plot.x + plot.w || box.y + box.h > plot.y + plot.h) {
          continue;
        }
        if (placedBoxes.some((b) => boxesOverlap(box, b, WORD_GAP))) continue;
        placement.x = px;
        placement.y = py;
        placement.placed = true;
        placedBoxes.push(box);
        break;
      }
    }

    out.push(placement);
  });

  return out;
}

function extraOf(geom: TypeGeom): WordcloudGeomExtra | null {
  return (geom.extra as WordcloudGeomExtra | undefined) ?? null;
}

function wordFont(w: WordPlacement, fontFamily: string): string {
  return `600 ${w.fontSize}px ${fontFamily}`;
}

export const wordcloudDefinition: ChartTypeDefinition = {
  id: 'wordcloud',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    // Legend hidden by default: the terms ARE the marks and are self-labeled.
    // An explicit `legend: true` still lists them (color swatch + term).
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = false;
  },

  layout(ctx): TypeGeom {
    const { terms, si } = wordTermsOf(ctx.model);
    const pos: (PointPos | null)[][] = ctx.model.series.map(() => []);
    if (si < 0 || terms.length === 0) {
      return { pos, slices: null, bars: null, extra: { words: [], si } };
    }

    const cfg = ctx.opts.wordcloud ?? {};
    const minFontSize = cfg.minFontSize ?? DEFAULT_MIN_FONT_SIZE;
    const maxFontSize = cfg.maxFontSize ?? DEFAULT_MAX_FONT_SIZE;

    const words = layoutWordCloud({
      terms,
      plot: ctx.layout.plot,
      minFontSize: Math.max(1, Math.min(minFontSize, maxFontSize)),
      maxFontSize: Math.max(1, Math.max(minFontSize, maxFontSize)),
      rotate: cfg.rotate ?? false,
      palette: ctx.theme.series,
      measure: (term, fontSize) => ctx.measure(term, `600 ${fontSize}px ${ctx.theme.fontFamily}`),
    });

    // Anchors are indexed by RANK, matching the keyboard reading order.
    pos[si] = words.map((w) => (w.placed ? { x: w.x, y: w.y, y0: w.y } : null));

    return { pos, slices: null, bars: null, extra: { words, si } };
  },

  render(ctx) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;

    extra.words.forEach((w) => {
      if (!w.placed) return;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === w.rank;
      const dimmed = hover !== null && hover.si === extra.si && !hovered;
      r.text(w.term, w.x, w.y, {
        font: wordFont(w, theme.fontFamily),
        // The one sanctioned place text wears a series color: text is the mark.
        color: w.fill,
        align: 'center',
        baseline: 'middle',
        ...(w.rotated ? { rotate: -Math.PI / 2 } : {}),
        ...(dimmed ? { alpha: 0.35 } : {}),
      });
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    // Boxes never overlap, so the first containing box is the answer.
    for (const w of extra.words) {
      if (!w.placed) continue;
      if (px >= w.x - w.w / 2 && px <= w.x + w.w / 2 && py >= w.y - w.h / 2 && py <= w.y + w.h / 2) {
        return { si: extra.si, pi: w.rank };
      }
    }
    return null;
  },

  legendItems(ctx): LegendItem[] {
    const { terms } = wordTermsOf(ctx.model);
    const palette = ctx.theme.series;
    // Rank order, non-toggleable: identity is carried by the term itself.
    return rankTerms(terms).map((t, rank) => ({
      id: `term:${t.pi}`,
      name: t.term,
      color: t.color ?? palette[rank % Math.max(1, palette.length)] ?? '#888888',
      visible: true,
      toggleable: false,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const { terms } = wordTermsOf(ctx.model);
    return {
      columns: ['Term', 'Weight', 'Rank'],
      rows: rankTerms(terms).map((t, rank) => ({
        header: t.term,
        cells: [formatValue(t.weight), String(rank + 1)],
      })),
    };
  },

  keyboardNav(model) {
    // Terms by rank: pi = rank (weight-descending reading order).
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const word = extra?.words[pos.pi];
    if (!extra || !word) return null;
    return `${word.term}: ${formatValue(word.weight)}. Rank ${word.rank + 1} of ${extra.words.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const word = extra?.words[hit.pi];
    const series = ctx.model.series[hit.si];
    if (!extra || !word || !series) return [];
    // Built manually: the tooltip must describe the RANKED term, and pi is a
    // rank rather than a data index.
    return [
      {
        seriesId: series.id,
        seriesName: series.name,
        color: word.fill,
        x: word.term,
        y: word.weight,
        formattedX: word.term,
        formattedY: formatValue(word.weight),
      },
    ];
  },
};
