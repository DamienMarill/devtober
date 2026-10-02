/**
 * Tracé du circuit : une spline fermée (Catmull-Rom) qui passe par des points de contrôle, échantillonnée
 * en polyligne pour pouvoir placer une voiture à une distance donnée le long du circuit.
 */

export interface Point {
  x: number;
  y: number;
}

/** Position sur le circuit : le point, et la direction de la piste à cet endroit (radians). */
export interface Pose extends Point {
  angle: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Le huit du circuit : une grande boucle en haut à gauche, une petite en bas à droite, et la piste qui se
 * croise entre les deux. Le croisement (`CROSSING`) est un point de contrôle des deux passages, donc la
 * spline y passe deux fois. Coordonnées dans un cadre de 1000 × 620, le départ est le premier point.
 */
export const CROSSING: Point = { x: 590, y: 372 };
export const FIGURE_EIGHT: readonly Point[] = [
  { x: 330, y: 452 }, // départ : ligne droite du bas de la grande boucle, qui file vers le croisement
  CROSSING,
  { x: 770, y: 318 },
  { x: 905, y: 390 },
  { x: 920, y: 520 },
  { x: 800, y: 585 },
  { x: 670, y: 540 },
  CROSSING,
  { x: 660, y: 215 },
  { x: 590, y: 95 },
  { x: 430, y: 60 },
  { x: 250, y: 110 },
  { x: 165, y: 260 },
  { x: 215, y: 400 },
];

/** Catmull-Rom (uniforme) entre p1 et p2, t dans [0, 1]. */
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/**
 * Un circuit fermé. `length` est sa longueur totale ; `poseAt(d)` donne la position à la distance `d` du
 * départ (en boucle : `d` est pris modulo la longueur). `offsetAt(d, o)` décale le point perpendiculairement
 * à la piste, pour tracer les deux rails parallèles et y poser les voitures.
 */
export class Track {
  readonly points: Point[] = [];
  /** Distance cumulée depuis le départ, pour chaque point échantillonné (`cumulative[0] === 0`). */
  readonly cumulative: number[] = [];
  readonly length: number;
  readonly box: Box;

  constructor(controls: readonly Point[], segments = 24) {
    const n = controls.length;
    for (let i = 0; i < n; i++) {
      const p0 = controls[(i - 1 + n) % n];
      const p1 = controls[i];
      const p2 = controls[(i + 1) % n];
      const p3 = controls[(i + 2) % n];
      for (let s = 0; s < segments; s++) {
        this.points.push(catmullRom(p0, p1, p2, p3, s / segments));
      }
    }

    let total = 0;
    this.cumulative.push(0);
    for (let i = 1; i <= this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i % this.points.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
      this.cumulative.push(total);
    }
    this.length = total;

    const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of this.points) {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
    this.box = box;
  }

  poseAt(distance: number): Pose {
    const d = ((distance % this.length) + this.length) % this.length;
    // Recherche dichotomique du segment contenant d.
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = this.points[lo % this.points.length];
    const b = this.points[(lo + 1) % this.points.length];
    const span = this.cumulative[lo + 1] - this.cumulative[lo];
    const t = span > 0 ? (d - this.cumulative[lo]) / span : 0;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  /** Point décalé de `offset` à droite de la piste (sens de la course), négatif pour la gauche. */
  offsetAt(distance: number, offset: number): Pose {
    const pose = this.poseAt(distance);
    return {
      x: pose.x - Math.sin(pose.angle) * offset,
      y: pose.y + Math.cos(pose.angle) * offset,
      angle: pose.angle,
    };
  }

  /** Polyligne d'un rail parallèle à la piste, un point tous les `step` de distance. */
  lane(offset: number, step = 6): Point[] {
    const points: Point[] = [];
    for (let d = 0; d < this.length; d += step) points.push(this.offsetAt(d, offset));
    return points;
  }
}

/** Transformation (échelle uniforme + translation) qui place `box` au centre d'une zone, avec une marge. */
export interface Fit {
  scale: number;
  tx: number;
  ty: number;
}

export function fitBox(box: Box, width: number, height: number, padding: number): Fit {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const scale = Math.max(0.0001, Math.min((width - 2 * padding) / w, (height - 2 * padding) / h));
  return {
    scale,
    tx: (width - w * scale) / 2 - box.minX * scale,
    ty: (height - h * scale) / 2 - box.minY * scale,
  };
}
