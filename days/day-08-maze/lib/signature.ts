import { CONFIG } from './config';
import type { Pt } from './model';

/**
 * Reconnaissance de signature : l'algorithme $P+ (Vatavu, 2017), variante de $P. Les traits sont concaténés en
 * un nuage de points, rééchantillonné, normalisé en position et en taille (axe par axe, pour qu'une signature
 * tassée dans un cadre étroit reste la même) ; chaque point porte en plus l'angle
 * de virage du tracé à cet endroit, ce qui distingue une écriture souple d'un zigzag. Le nuage ignore l'ordre et
 * le sens des traits : une signature tracée de droite à gauche ressemble autant qu'une autre.
 */
interface CloudPoint {
  x: number;
  y: number;
  /** Angle de virage normalisé (0 : tout droit, 1 : demi-tour). */
  a: number;
}
type Cloud = CloudPoint[];

function pathLength(points: readonly Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++)
    d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return d;
}

/** Longueur totale des traits (px). */
export function strokesLength(strokes: readonly Pt[][]): number {
  return strokes.reduce((sum, s) => sum + pathLength(s), 0);
}

/** Rééchantillonne `n` points régulièrement espacés le long des traits, en notant le trait de chaque point. */
function resample(strokes: readonly Pt[][], n: number): { pts: Pt[]; ids: number[] } {
  const valid = strokes.filter((s) => s.length > 0);
  if (valid.length === 0) return { pts: [], ids: [] };
  const total = strokesLength(valid);
  const pts: Pt[] = [{ ...valid[0][0] }];
  const ids = [0];
  if (total > 0) {
    const interval = total / (n - 1);
    let acc = 0;
    valid.forEach((stroke, sid) => {
      for (let i = 1; i < stroke.length; i++) {
        let a = stroke[i - 1];
        const b = stroke[i];
        let d = Math.hypot(b.x - a.x, b.y - a.y);
        while (acc + d >= interval && d > 0) {
          const t = (interval - acc) / d;
          const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          pts.push(q);
          ids.push(sid);
          a = q;
          d = Math.hypot(b.x - a.x, b.y - a.y);
          acc = 0;
        }
        acc += d;
      }
    });
  }
  while (pts.length < n) {
    pts.push({ ...pts[pts.length - 1] });
    ids.push(ids[ids.length - 1]);
  }
  return { pts: pts.slice(0, n), ids: ids.slice(0, n) };
}

export function cloud(strokes: readonly Pt[][]): Cloud {
  const n = CONFIG.signature.points;
  const { pts, ids } = resample(strokes, n);
  if (pts.length === 0) return [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  // Axe par axe, mais sans gonfler un axe presque plat (un trait droit reste un trait).
  const sx = Math.max(w, 0.15 * h) || 1;
  const sy = Math.max(h, 0.15 * w) || 1;
  const scaled = pts.map((p) => ({ x: (p.x - minX) / sx, y: (p.y - minY) / sy }));
  const cx = scaled.reduce((s, p) => s + p.x, 0) / n;
  const cy = scaled.reduce((s, p) => s + p.y, 0) / n;
  const c = scaled.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  return c.map((p, i) => {
    let a = 0;
    if (i > 0 && i < n - 1 && ids[i - 1] === ids[i] && ids[i + 1] === ids[i]) {
      const ux = p.x - c[i - 1].x;
      const uy = p.y - c[i - 1].y;
      const vx = c[i + 1].x - p.x;
      const vy = c[i + 1].y - p.y;
      const nu = Math.hypot(ux, uy);
      const nv = Math.hypot(vx, vy);
      if (nu > 0 && nv > 0)
        a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv)))) / Math.PI;
    }
    return { x: p.x, y: p.y, a };
  });
}

/** Chaque point de `a` va au point de `b` le plus proche (position et angle). */
function oneWay(a: Cloud, b: Cloud): number {
  let sum = 0;
  for (const p of a) {
    let best = Infinity;
    for (const q of b) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y, p.a - q.a));
    sum += best;
  }
  return sum;
}

/** Distance $P+ entre deux nuages, moyennée par point et symétrique. */
export function distance(a: Cloud, b: Cloud): number {
  if (!a.length || !b.length) return Infinity;
  return (oneWay(a, b) + oneWay(b, a)) / a.length;
}

/** Ressemblance de 0 (rien à voir) à 1 (identique). */
export function similarity(a: readonly Pt[][], b: readonly Pt[][]): number {
  const d = distance(cloud(a), cloud(b));
  return Math.max(0, Math.min(1, 1 - d / CONFIG.signature.distanceNulle));
}

/** Le spécimen : les trois signatures déposées le lundi matin, la plus représentative en premier. */
export type Specimen = Pt[][][];

/** Ressemblance au spécimen : la meilleure des trois (on ne signe jamais deux fois pareil). */
export function resemblance(strokes: readonly Pt[][], specimen: Specimen): number {
  return Math.max(0, ...specimen.map((s) => similarity(strokes, s)));
}

/**
 * Le spécimen du lundi : trois signatures qui doivent se ressembler à `seuilSpecimen` au moins ; on retient la
 * plus proche des deux autres. Renvoie null si elles ne se ressemblent pas.
 */
export function chooseSpecimen(
  samples: readonly Pt[][][],
): { specimen: Specimen; scores: number[] } | null {
  const s01 = similarity(samples[0], samples[1]);
  const s02 = similarity(samples[0], samples[2]);
  const s12 = similarity(samples[1], samples[2]);
  if (Math.min(s01, s02, s12) < CONFIG.signature.seuilSpecimen) return null;
  const scores = [s01 + s02, s01 + s12, s02 + s12];
  const best = scores.indexOf(Math.max(...scores));
  const order = [best, ...[0, 1, 2].filter((i) => i !== best)];
  return { specimen: order.map((i) => samples[i].map((s) => s.map((p) => ({ ...p })))), scores };
}
