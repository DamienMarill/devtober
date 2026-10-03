import { Point } from './projection';

/** Un tracé du décor : une couleur (nom de variable CSS, sans `--`) et ses données SVG. */
export interface Shape {
  m: string;
  d: string;
}

/** Arrondi au dixième : le dessin reste net et les chemins restent légers. */
export function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * Accumule les tracés dans l'ordre de dessin. Deux tracés consécutifs de même couleur sont fusionnés :
 * des centaines de balustres font un seul `<path>`.
 */
export class Painter {
  readonly shapes: Shape[] = [];

  add(m: string, d: string): void {
    if (!d) return;
    const last = this.shapes.at(-1);
    if (last && last.m === m) last.d += d;
    else this.shapes.push({ m, d });
  }

  /** Polygone (points de composition). */
  poly(m: string, points: readonly Point[]): void {
    this.add(m, polygon(points));
  }

  /** Disque (centre et rayon en unités de composition). */
  circle(m: string, cx: number, cy: number, r: number): void {
    this.add(m, circle(cx, cy, r));
  }

  /** Ellipse (lanternes). */
  ellipse(m: string, cx: number, cy: number, rx: number, ry: number): void {
    this.add(
      m,
      `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`,
    );
  }
}

export function polygon(points: readonly Point[]): string {
  if (points.length < 2) return '';
  return `M${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
}

export function circle(cx: number, cy: number, r: number): string {
  if (r <= 0.05) return '';
  return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`;
}
