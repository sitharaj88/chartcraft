/**
 * Canvas 2D renderer. devicePixelRatio-aware: the backing store is scaled by
 * dpr and a transform keeps all draw code in CSS pixels.
 */
import type { DrawOpts, PathCmd, Renderer, StrokeStyle, TextOpts } from './renderer';

export class CanvasRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('@chartcraft/core: could not acquire a 2d canvas context');
    this.ctx = ctx;
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  resize(width: number, height: number, dpr: number): void {
    this.w = Math.max(0, width);
    this.h = Math.max(0, height);
    this.dpr = dpr > 0 ? dpr : 1;
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear(fill: string): void {
    const c = this.ctx;
    c.save();
    c.fillStyle = fill;
    c.fillRect(0, 0, this.w, this.h);
    c.restore();
  }

  private applyStroke(s: StrokeStyle): void {
    const c = this.ctx;
    c.strokeStyle = s.color;
    c.lineWidth = s.width;
    c.lineCap = s.cap ?? 'butt';
    c.lineJoin = s.join ?? 'round';
    if (typeof c.setLineDash === 'function') c.setLineDash(s.dash ?? []);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: StrokeStyle, alpha = 1): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    this.applyStroke(stroke);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.restore();
  }

  private trace(cmds: readonly PathCmd[]): void {
    const c = this.ctx;
    c.beginPath();
    for (const cmd of cmds) {
      switch (cmd[0]) {
        case 'M':
          c.moveTo(cmd[1], cmd[2]);
          break;
        case 'L':
          c.lineTo(cmd[1], cmd[2]);
          break;
        case 'C':
          c.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
          break;
        case 'Z':
          c.closePath();
          break;
      }
    }
  }

  path(cmds: readonly PathCmd[], opts: DrawOpts): void {
    if (cmds.length === 0) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    this.trace(cmds);
    if (opts.fill) {
      c.fillStyle = opts.fill;
      c.fill();
    }
    if (opts.stroke) {
      this.applyStroke(opts.stroke);
      c.stroke();
    }
    c.restore();
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: DrawOpts & { radii?: readonly [number, number, number, number] },
  ): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    const radii = opts.radii;
    if (radii && (radii[0] > 0 || radii[1] > 0 || radii[2] > 0 || radii[3] > 0)) {
      const cl = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
      const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, cl))) as unknown as [
        number,
        number,
        number,
        number,
      ];
      c.beginPath();
      c.moveTo(x + tl, y);
      c.lineTo(x + w - tr, y);
      c.arcTo(x + w, y, x + w, y + tr, tr);
      c.lineTo(x + w, y + h - br);
      c.arcTo(x + w, y + h, x + w - br, y + h, br);
      c.lineTo(x + bl, y + h);
      c.arcTo(x, y + h, x, y + h - bl, bl);
      c.lineTo(x, y + tl);
      c.arcTo(x, y, x + tl, y, tl);
      c.closePath();
      if (opts.fill) {
        c.fillStyle = opts.fill;
        c.fill();
      }
      if (opts.stroke) {
        this.applyStroke(opts.stroke);
        c.stroke();
      }
    } else {
      if (opts.fill) {
        c.fillStyle = opts.fill;
        c.fillRect(x, y, w, h);
      }
      if (opts.stroke) {
        this.applyStroke(opts.stroke);
        c.strokeRect(x, y, w, h);
      }
    }
    c.restore();
  }

  circle(cx: number, cy: number, r: number, opts: DrawOpts): void {
    if (r <= 0) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    if (opts.fill) {
      c.fillStyle = opts.fill;
      c.fill();
    }
    if (opts.stroke) {
      this.applyStroke(opts.stroke);
      c.stroke();
    }
    c.restore();
  }

  sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, opts: DrawOpts): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    c.beginPath();
    c.arc(cx, cy, Math.max(0, r1), a0, a1);
    if (r0 > 0) {
      c.arc(cx, cy, r0, a1, a0, true);
    } else {
      c.lineTo(cx, cy);
    }
    c.closePath();
    if (opts.fill) {
      c.fillStyle = opts.fill;
      c.fill();
    }
    if (opts.stroke) {
      this.applyStroke(opts.stroke);
      c.stroke();
    }
    c.restore();
  }

  text(text: string, x: number, y: number, opts: TextOpts): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    c.font = opts.font;
    c.fillStyle = opts.color;
    c.textAlign = opts.align ?? 'left';
    c.textBaseline = opts.baseline ?? 'alphabetic';
    if (opts.rotate) {
      c.translate(x, y);
      c.rotate(opts.rotate);
      c.fillText(text, 0, 0);
    } else {
      c.fillText(text, x, y);
    }
    c.restore();
  }

  measure(text: string, font: string): number {
    const c = this.ctx;
    c.save();
    c.font = font;
    const m = c.measureText(text) as { width?: number } | undefined;
    c.restore();
    const w = m?.width;
    return typeof w === 'number' && Number.isFinite(w) ? w : text.length * 6;
  }

  clipRect(x: number, y: number, w: number, h: number, draw: () => void): void {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    try {
      draw();
    } finally {
      c.restore();
    }
  }

  destroy(): void {
    // Nothing retained beyond the context; the chart removes the canvas node.
  }
}
