/**
 * Renderer interface — chart code never touches the canvas API directly.
 * CanvasRenderer is the primary implementation; SVG/WebGL come later.
 */

export interface StrokeStyle {
  color: string;
  width: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

export interface DrawOpts {
  fill?: string;
  stroke?: StrokeStyle;
  /** 0..1 global alpha for this draw. */
  alpha?: number;
}

export interface TextOpts {
  font: string;
  color: string;
  align?: 'left' | 'right' | 'center' | 'start' | 'end';
  baseline?: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'bottom';
  /** Rotation (radians) around (x, y). */
  rotate?: number;
  alpha?: number;
}

export type PathCmd =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export interface Renderer {
  readonly width: number;
  readonly height: number;
  resize(width: number, height: number, dpr: number): void;
  clear(fill: string): void;
  line(x1: number, y1: number, x2: number, y2: number, stroke: StrokeStyle, alpha?: number): void;
  path(cmds: readonly PathCmd[], opts: DrawOpts): void;
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: DrawOpts & { radii?: readonly [number, number, number, number] },
  ): void;
  circle(cx: number, cy: number, r: number, opts: DrawOpts): void;
  /** Annular sector (pie/donut slice). Angles in radians; r0 = 0 for pie. */
  sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, opts: DrawOpts): void;
  text(text: string, x: number, y: number, opts: TextOpts): void;
  measure(text: string, font: string): number;
  /** Run draw calls clipped to a rectangle. */
  clipRect(x: number, y: number, w: number, h: number, draw: () => void): void;
  destroy(): void;
}
