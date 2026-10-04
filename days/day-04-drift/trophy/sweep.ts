import { Vector3 } from 'three';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';

/** Une section du solide : où elle est, deux axes perpendiculaires, et ses demi-largeurs. */
export interface Ring {
  /** Centre de la section. */
  p: [number, number, number];
  /** Axe de la largeur. */
  b: [number, number, number];
  /** Axe de l'épaisseur. */
  n: [number, number, number];
  /** Demi-largeur (le long de `b`) et demi-épaisseur (le long de `n`). */
  a: number;
  c: number;
}

/**
 * Un solide « balayé » : une ellipse (ou un contour ondulé par `wobble`) qui glisse le long d'un chemin
 * en changeant de taille. Si `a` et `c` valent 0 aux deux bouts, le solide est fermé et arrondi.
 * C'est avec ça qu'on modèle la banane : le corps est une section ronde, les pelures des sections plates.
 */
export function sweep(
  ring: (s: number) => Ring,
  { slices = 64, stacks = 28, wobble }: { slices?: number; stacks?: number; wobble?: (phi: number) => number } = {},
) {
  return new ParametricGeometry(
    (u, v, target: Vector3) => {
      const r = ring(u);
      const phi = v * Math.PI * 2;
      const m = wobble ? wobble(phi) : 1;
      const w = r.a * Math.cos(phi) * m;
      const t = r.c * Math.sin(phi) * m;
      target.set(
        r.p[0] + r.b[0] * w + r.n[0] * t,
        r.p[1] + r.b[1] * w + r.n[1] * t,
        r.p[2] + r.b[2] * w + r.n[2] * t,
      );
    },
    slices,
    stacks,
  );
}

export const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
