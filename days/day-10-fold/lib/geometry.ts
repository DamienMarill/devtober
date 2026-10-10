/** Un point ou un vecteur du plan. */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const norm = (a: Vec2): Vec2 => scale(a, 1 / (len(a) || 1));
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const dist = (a: Vec2, b: Vec2) => len(sub(a, b));

/** Tolérance des tests géométriques (la feuille mesure 2 unités de côté). */
export const EPS = 1e-6;

/**
 * Une droite orientée : un point `p`, une direction unitaire `d`. Sa normale `n` (d tournée de -90°)
 * pointe vers le côté « positif », celui qui bouge quand on plie.
 */
export interface Line {
  p: Vec2;
  d: Vec2;
  n: Vec2;
}

/** La droite passant par `p` de direction `d`, orientée pour que `side` soit du côté positif. */
export function lineThrough(p: Vec2, d: Vec2, side?: Vec2): Line {
  const u = norm(d);
  let n = v(u.y, -u.x);
  if (side && dot(sub(side, p), n) < 0) n = scale(n, -1);
  return { p, d: u, n };
}

/** La médiatrice de [a, b] : plier selon elle amène `a` sur `b`. Le côté positif est celui de `a`. */
export function bisector(a: Vec2, b: Vec2): Line {
  const mid = lerp(a, b, 0.5);
  const ab = sub(b, a);
  return lineThrough(mid, v(-ab.y, ab.x), a);
}

/** Distance signée à la droite (positive du côté qui bouge). */
export const side = (l: Line, q: Vec2) => dot(sub(q, l.p), l.n);

/** Symétrique de `q` par rapport à la droite. */
export function reflect(l: Line, q: Vec2): Vec2 {
  return sub(q, scale(l.n, 2 * side(l, q)));
}

/** Aire signée d'un polygone (positive s'il tourne dans le sens trigonométrique). */
export function area(poly: readonly Vec2[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += cross(poly[i], poly[(i + 1) % poly.length]);
  return s / 2;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const c = cross(p, q);
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-12) {
    const s = poly.reduce((acc, p) => add(acc, p), v(0, 0));
    return scale(s, 1 / poly.length);
  }
  return v(cx / (3 * a), cy / (3 * a));
}

/**
 * Coupe un polygone convexe par une droite (ou par une fonction affine qui donne la distance signée) :
 * la partie du côté positif et celle du côté négatif, chacune vide si le polygone est entièrement de
 * l'autre côté. Les sommets posés sur la droite vont des deux côtés.
 */
export function clip(poly: readonly Vec2[], l: Line | ((q: Vec2) => number)): [Vec2[], Vec2[]] {
  const f = typeof l === 'function' ? l : (q: Vec2) => side(l, q);
  const pos: Vec2[] = [];
  const neg: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = f(a);
    const sb = f(b);
    if (sa >= -EPS) pos.push(a);
    if (sa <= EPS) neg.push(a);
    if ((sa > EPS && sb < -EPS) || (sa < -EPS && sb > EPS)) {
      const m = lerp(a, b, sa / (sa - sb));
      pos.push(m);
      neg.push(m);
    }
  }
  return [dedupe(pos), dedupe(neg)];
}

function dedupe(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > EPS) out.push(p);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= EPS) out.pop();
  return out.length >= 3 && Math.abs(area(out)) > 1e-9 ? out : [];
}

/**
 * Deux polygones convexes se recouvrent-ils vraiment (pas seulement par un bord ou un coin) ?
 * Théorème de l'axe séparateur : on cherche un axe sur lequel leurs projections ne se chevauchent pas.
 */
export function overlaps(a: readonly Vec2[], b: readonly Vec2[], margin = 1e-4): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm(v(-e.y, e.x));
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of a) {
        const s = dot(p, axis);
        minA = Math.min(minA, s);
        maxA = Math.max(maxA, s);
      }
      for (const p of b) {
        const s = dot(p, axis);
        minB = Math.min(minB, s);
        maxB = Math.max(maxB, s);
      }
      if (maxA - minB <= margin || maxB - minA <= margin) return false;
    }
  }
  return true;
}

/** Le point est-il dans le polygone convexe (bords compris) ? */
export function contains(poly: readonly Vec2[], q: Vec2, tol = 1e-5): boolean {
  const sign = Math.sign(area(poly));
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (sign * cross(sub(b, a), sub(q, a)) < -tol * dist(a, b)) return false;
  }
  return true;
}

/**
 * Une isométrie du plan : x' = a·x + b·y + tx, y' = c·x + d·y + ty. Rotation si le déterminant vaut 1,
 * symétrie s'il vaut -1 (la feuille montre alors son autre face).
 */
export interface Iso {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Iso = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export const apply = (m: Iso, q: Vec2): Vec2 =>
  v(m.a * q.x + m.b * q.y + m.tx, m.c * q.x + m.d * q.y + m.ty);
export const det = (m: Iso) => m.a * m.d - m.b * m.c;

/** `m` suivie de `n`. (Pas `then` : un module qui exporte `then` passe pour une promesse.) */
export function compose(m: Iso, n: Iso): Iso {
  return {
    a: n.a * m.a + n.b * m.c,
    b: n.a * m.b + n.b * m.d,
    c: n.c * m.a + n.d * m.c,
    d: n.c * m.b + n.d * m.d,
    tx: n.a * m.tx + n.b * m.ty + n.tx,
    ty: n.c * m.tx + n.d * m.ty + n.ty,
  };
}

export function invert(m: Iso): Iso {
  const k = 1 / det(m);
  const a = m.d * k;
  const b = -m.b * k;
  const c = -m.c * k;
  const d = m.a * k;
  return { a, b, c, d, tx: -(a * m.tx + b * m.ty), ty: -(c * m.tx + d * m.ty) };
}

/** La symétrie d'axe `l`. */
export function mirror(l: Line): Iso {
  const { x: nx, y: ny } = l.n;
  const k = 2 * dot(l.p, l.n);
  return {
    a: 1 - 2 * nx * nx,
    b: -2 * nx * ny,
    c: -2 * nx * ny,
    d: 1 - 2 * ny * ny,
    tx: k * nx,
    ty: k * ny,
  };
}
