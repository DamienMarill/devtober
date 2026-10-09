/**
 * Les formes du plateau, en millimètres, origine au centre du cercle des rails, y vers le bas.
 * Tout ce qui arrête une bille est un « obstacle » : un clou (cercle), un mur (segment épais, une capsule)
 * ou un rail (arc de cercle épais). Les angles sont en radians, comptés depuis +x vers +y : avec y vers le
 * bas, un angle qui augmente tourne dans le sens des aiguilles d'une montre à l'écran.
 */

/** Ce que l'obstacle fait d'un choc : restitution normale et frottement (Coulomb). */
export interface Material {
  e: number;
  mu: number;
}

interface Base {
  mat: Material;
  /** Le sol de la scène sous l'écran : une bille qui le touche est « sur la scène ». */
  stage?: boolean;
  /** Le clapet de l'アタッカー : actif seulement quand il est fermé. */
  door?: boolean;
}

export interface Pin extends Base {
  kind: 'pin';
  x: number;
  y: number;
  r: number;
}

export interface Seg extends Base {
  kind: 'seg';
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Demi-épaisseur. */
  r: number;
}

export interface Arc extends Base {
  kind: 'arc';
  cx: number;
  cy: number;
  R: number;
  /** De `a0` à `a1` (a0 < a1, a1 peut dépasser 2π). */
  a0: number;
  a1: number;
  r: number;
}

export type Shape = Pin | Seg | Arc;

/** Point le plus proche d'une forme : écrit dans `out` ([x, y]) pour ne rien allouer dans la boucle. */
export function closest(s: Shape, px: number, py: number, out: Float64Array): void {
  switch (s.kind) {
    case 'pin':
      out[0] = s.x;
      out[1] = s.y;
      return;
    case 'seg': {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - s.ax) * dx + (py - s.ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      out[0] = s.ax + dx * t;
      out[1] = s.ay + dy * t;
      return;
    }
    case 'arc': {
      let a = Math.atan2(py - s.cy, px - s.cx);
      while (a < s.a0) a += Math.PI * 2;
      if (a <= s.a1) {
        out[0] = s.cx + Math.cos(a) * s.R;
        out[1] = s.cy + Math.sin(a) * s.R;
        return;
      }
      // Hors de l'arc : l'extrémité la plus proche (le bout du rail est arrondi).
      const x0 = s.cx + Math.cos(s.a0) * s.R;
      const y0 = s.cy + Math.sin(s.a0) * s.R;
      const x1 = s.cx + Math.cos(s.a1) * s.R;
      const y1 = s.cy + Math.sin(s.a1) * s.R;
      const d0 = (px - x0) ** 2 + (py - y0) ** 2;
      const d1 = (px - x1) ** 2 + (py - y1) ** 2;
      out[0] = d0 < d1 ? x0 : x1;
      out[1] = d0 < d1 ? y0 : y1;
      return;
    }
  }
}

/** Demi-épaisseur de la forme (le rayon d'un clou). */
export const thickness = (s: Shape) => s.r;

/** Boîte englobante [x0, y0, x1, y1]. */
export function bounds(s: Shape): [number, number, number, number] {
  switch (s.kind) {
    case 'pin':
      return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
    case 'seg':
      return [
        Math.min(s.ax, s.bx) - s.r,
        Math.min(s.ay, s.by) - s.r,
        Math.max(s.ax, s.bx) + s.r,
        Math.max(s.ay, s.by) + s.r,
      ];
    case 'arc': {
      // Large mais juste : on échantillonne l'arc (il y en a peu).
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const n = Math.max(2, Math.ceil(((s.a1 - s.a0) * s.R) / 4));
      for (let i = 0; i <= n; i++) {
        const a = s.a0 + ((s.a1 - s.a0) * i) / n;
        const x = s.cx + Math.cos(a) * s.R;
        const y = s.cy + Math.sin(a) * s.R;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return [x0 - s.r - 1, y0 - s.r - 1, x1 + s.r + 1, y1 + s.r + 1];
    }
  }
}

export const deg = (d: number) => (d * Math.PI) / 180;

/** Point d'un cercle centré à l'origine, angle en degrés. */
export const polar = (R: number, d: number): [number, number] => [
  Math.cos(deg(d)) * R,
  Math.sin(deg(d)) * R,
];

/** Un rectangle aligné sur les axes. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
