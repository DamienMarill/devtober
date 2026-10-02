/**
 * Tracé du circuit, vu du dessus : un huit fait comme les circuits jouets, avec deux boucles circulaires
 * identiques et deux lignes droites qui se croisent au centre (l'une passe sur un pont). Le tracé est
 * échantillonné en polyligne pour placer une voiture à une distance donnée le long du circuit.
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

/** Une boucle du huit : un cercle (le milieu de la route en fait le tour). */
export interface Loop {
  center: Point;
  radius: number;
}

/** Le pont : la partie surélevée autour du second passage au croisement. */
export interface Bridge {
  /** Distance (depuis le départ) du milieu du pont, au-dessus du croisement. */
  center: number;
  /** Demi-longueur du tablier à plat. */
  flat: number;
  /** Longueur de chaque rampe. */
  ramp: number;
}

export interface FigureEight {
  points: Point[];
  loops: [Loop, Loop];
  /** Distances (depuis le départ) des deux passages au croisement : le premier dessous, le second sur le pont. */
  crossings: [number, number];
}

/** Rayon des boucles (au milieu de la route), écart entre leurs centres, et place de la ligne de départ. */
export const LOOP_RADIUS = 150;
export const LOOP_SPACING = 240;
/** La ligne de départ est sur la ligne droite qui descend du croisement, à cette distance du croisement. */
export const START_AFTER_CROSSING = 110;

/**
 * Le huit, centré sur le croisement (0, 0), axe y vers le bas. On part du croisement vers le bas à droite,
 * on fait le tour de la boucle de droite (dans le sens anti-horaire à l'écran), on revient par le croisement
 * vers le bas à gauche, on fait le tour de celle de gauche (sens horaire), et on retombe sur le départ.
 * Les droites sont les tangentes communes intérieures des deux cercles, donc tout se raccorde sans angle.
 */
export function figureEight(
  radius = LOOP_RADIUS,
  spacing = LOOP_SPACING,
  start = START_AFTER_CROSSING,
  step = 3,
): FigureEight {
  const theta = Math.asin(radius / spacing); // pente des droites
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const half = spacing * cos; // longueur du croisement au point de tangence
  const sweep = Math.PI + 2 * theta; // angle parcouru sur chaque boucle
  const arc = radius * sweep;
  const right: Loop = { center: { x: spacing, y: 0 }, radius };
  const left: Loop = { center: { x: -spacing, y: 0 }, radius };
  // Angle (vu depuis le centre de sa boucle) du point où l'on entre dans chaque boucle.
  const enterRight = Math.PI / 2 + theta;
  const enterLeft = Math.PI / 2 - theta;

  // Les cinq morceaux, mis bout à bout depuis le croisement.
  const total = 4 * half + 2 * arc;
  const at = (s: number): Point => {
    s = ((s % total) + total) % total;
    if (s < half) return { x: s * cos, y: s * sin }; // croisement → boucle de droite
    s -= half;
    if (s < arc) {
      const a = enterRight - s / radius; // sens anti-horaire à l'écran (axe y vers le bas)
      return { x: right.center.x + radius * Math.cos(a), y: radius * Math.sin(a) };
    }
    s -= arc;
    if (s < 2 * half) {
      // De la boucle de droite (en haut) à la boucle de gauche (en bas), en passant par le croisement.
      const u = s - half;
      return { x: -u * cos, y: u * sin };
    }
    s -= 2 * half;
    if (s < arc) {
      const a = enterLeft + s / radius;
      return { x: left.center.x + radius * Math.cos(a), y: radius * Math.sin(a) };
    }
    s -= arc;
    return { x: (s - half) * cos, y: (s - half) * sin }; // boucle de gauche → croisement
  };

  const count = Math.round(total / step);
  const points = Array.from({ length: count }, (_, i) => at(start + (i * total) / count));
  const secondCrossing = 2 * half + arc;
  return {
    points,
    loops: [left, right],
    crossings: [total - start, secondCrossing - start],
  };
}

/** Hauteur du pont (0 au sol, 1 sur le tablier) à la distance `d`, avec des rampes adoucies. */
export function elevation(bridge: Bridge, length: number, d: number): number {
  let delta = Math.abs((((d - bridge.center) % length) + length) % length);
  delta = Math.min(delta, length - delta);
  if (delta <= bridge.flat) return 1;
  const t = (delta - bridge.flat) / bridge.ramp;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Un circuit fermé, défini par une polyligne. `length` est sa longueur totale ; `poseAt(d)` donne la
 * position à la distance `d` du départ (en boucle : `d` est pris modulo la longueur). `offsetAt(d, o)`
 * décale le point perpendiculairement à la piste, pour tracer les rails et y poser les voitures.
 */
export class Track {
  readonly points: Point[];
  /** Distance cumulée depuis le départ, pour chaque point (`cumulative[0] === 0`), plus la boucle complète. */
  readonly cumulative: number[] = [];
  readonly length: number;
  readonly box: Box;

  constructor(points: readonly Point[]) {
    this.points = [...points];
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

  /** Polyligne parallèle à la piste, de `from` à `to` (distances), un point tous les `step`. */
  lane(offset: number, from = 0, to = this.length, step = 4): Point[] {
    const points: Point[] = [];
    const count = Math.max(1, Math.ceil((to - from) / step));
    for (let i = 0; i <= count; i++)
      points.push(this.offsetAt(from + ((to - from) * i) / count, offset));
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

/** Agrandit une boîte de `margin` de chaque côté. */
export function grow(box: Box, margin: number): Box {
  return {
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  };
}
