import { Painter } from './paint';
import { Point } from './projection';
import { seeded } from './random';

/**
 * Le pont Mitokoi, modélisé en mètres : il « flotte » dans la trouée des cerisiers et traverse tout le
 * cadre. Au milieu, comme dans le film, son tablier s'élargit des deux côtés en un carré (le balcon où
 * Shōko nourrit les carpes) : on en voit la face avant, qui avance vers nous.
 *
 * Il a sa propre caméra, presque à sa hauteur (un peu en dessous) et un peu sur la gauche : tout ce qui
 * court le long du pont reste parfaitement horizontal, et l'on voit fuir le côté droit du carré.
 */
export const BRIDGE_VIEW = { cx: 560, cy: 755, focal: 2400 } as const;

/** Repère du pont : X vers la droite, Y vers le haut depuis l'œil, Z vers le fond (mètres). */
export const BRIDGE = {
  /** Face avant du tablier, et sa profondeur. */
  z: 24,
  depth: 2.2,
  /** Les deux bouts : bien au-delà du cadre, ils se perdent derrière les fleurs. */
  left: -12,
  right: 15,
  /** Dessous de la poutre, dessus du tablier, haut de la main courante. */
  bottom: 1,
  deck: 1.55,
  rail: 2.55,
  /**
   * Le carré central : son milieu (placé au centre de la trouée), sa demi-largeur, et son débord de chaque
   * côté du tablier (2,2 + 2 × 1,2 = 4,6 m : aussi profond que large).
   */
  balcony: { x: 1.52, half: 2.3, depth: 1.2 },
} as const;

export type V3 = readonly [number, number, number];

/** Point du pont (mètres) -> composition. */
export function bridgePoint(x: number, y: number, z: number): Point {
  const { cx, cy, focal } = BRIDGE_VIEW;
  return [cx + (focal * x) / z, cy - (focal * y) / z];
}

/** Écartement des poteaux et des barreaux (m). */
const POST_EVERY = 1.75;
const BAR_EVERY = 0.13;

/**
 * Un garde-corps posé sur le tablier, de `a` à `b` (deux points au niveau du tablier) : lisse basse,
 * barreaux serrés, lisse intermédiaire, poteaux à chapeau (aux deux bouts et tous les 1,75 m depuis `a`),
 * main courante et son liseré de lumière.
 */
function railing(p: Painter, m: string, a: V3, b: V3, detail: boolean): void {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const { deck, rail } = BRIDGE;
  const at = (s: number, y: number): Point => {
    const t = s / length;
    return bridgePoint(a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t);
  };
  const quad = (s0: number, y0: number, s1: number, y1: number, material = m) =>
    p.poly(material, [at(s0, y0), at(s1, y0), at(s1, y1), at(s0, y1)]);

  quad(0, deck, length, deck + 0.07);
  quad(0, deck + 0.52, length, deck + 0.57);
  for (let s = 0.12; s < length - 0.06; s += detail ? BAR_EVERY : BAR_EVERY * 2) {
    quad(s, deck + 0.07, s + 0.045, rail - 0.08);
  }
  const posts = [0];
  for (let s = POST_EVERY; s < length - 0.4; s += POST_EVERY) posts.push(s);
  posts.push(length);
  for (const s of posts) {
    quad(s - 0.08, deck, s + 0.08, rail + 0.04);
    quad(s - 0.12, rail + 0.04, s + 0.12, rail + 0.1);
  }
  quad(-0.1, rail - 0.1, length + 0.1, rail + 0.01);
  quad(-0.1, rail - 0.01, length + 0.1, rail + 0.02, `${m}-hi`);
}

/** Une face verticale de la poutre (béton), dans le plan Z = `z`, de X = `x0` à `x1`. */
function beam(p: Painter, x0: number, x1: number, z: number, random: () => number): void {
  const { bottom, deck } = BRIDGE;
  const face = (m: string, y0: number, y1: number) =>
    p.poly(m, [
      bridgePoint(x0, y0, z),
      bridgePoint(x1, y0, z),
      bridgePoint(x1, y1, z),
      bridgePoint(x0, y1, z),
    ]);
  face('deck', bottom, deck);
  face('deck-shade', bottom, bottom + 0.05);
  face('deck-hi', deck - 0.025, deck);
  // Coulures sur le béton : un vieux pont.
  const stains = Math.round((x1 - x0) * 1.2);
  for (let i = 0; i < stains; i++) {
    const x = x0 + random() * (x1 - x0);
    const w = 0.03 + random() * 0.06;
    const drop = 0.08 + random() * 0.18;
    p.poly('deck-stain', [
      bridgePoint(x, deck - 0.05, z),
      bridgePoint(x + w, deck - 0.05, z),
      bridgePoint(x + w * 0.6, deck - 0.05 - drop, z),
      bridgePoint(x, deck - 0.08 - drop * 0.8, z),
    ]);
  }
}

/** Le dessous horizontal d'une dalle, à Y = `bottom`, entre deux profondeurs. */
function underside(p: Painter, x0: number, x1: number, z0: number, z1: number): void {
  const y = BRIDGE.bottom;
  p.poly('deck-under', [
    bridgePoint(x0, y, z0),
    bridgePoint(x1, y, z0),
    bridgePoint(x1, y, z1),
    bridgePoint(x0, y, z1),
  ]);
}

/** Dessine le pont, du fond vers l'avant (peintre). */
export function buildBridge(p: Painter): void {
  const random = seeded(7);
  const { z, depth, left: l, right: r, deck, balcony } = BRIDGE;
  const back = z + depth;
  const front = z - balcony.depth;
  const rear = back + balcony.depth;
  // Les deux côtés du carré.
  const a = balcony.x - balcony.half;
  const b = balcony.x + balcony.half;

  // Le garde-corps du fond : il recule au milieu, là où le carré déborde de l'autre côté.
  railing(p, 'rail-back', [a, deck, back], [l, deck, back], false);
  railing(p, 'rail-back', [b, deck, back], [r, deck, back], false);
  railing(p, 'rail-back', [a, deck, back], [a, deck, rear], false);
  railing(p, 'rail-back', [b, deck, back], [b, deck, rear], false);
  railing(p, 'rail-back', [a, deck, rear], [b, deck, rear], false);

  // Le tablier : son dessous, sa poutre de rive, son garde-corps de part et d'autre du carré.
  underside(p, l, r, z, back);
  beam(p, l, r, z, random);
  // Ombre de contact contre le carré, de part et d'autre : la marche se lit mieux.
  for (const [x0, x1] of [
    [a - 0.35, a],
    [b, b + 0.35],
  ]) {
    p.poly('deck-shade', [
      bridgePoint(x0, BRIDGE.bottom, z),
      bridgePoint(x1, BRIDGE.bottom, z),
      bridgePoint(x1, deck, z),
      bridgePoint(x0, deck, z),
    ]);
  }
  railing(p, 'rail', [a, deck, z], [l, deck, z], true);
  railing(p, 'rail', [b, deck, z], [r, deck, z], true);

  // Le carré, côté nous : ses côtés, son dessous, sa poutre, puis son garde-corps de face.
  railing(p, 'rail', [a, deck, z], [a, deck, front], true);
  railing(p, 'rail', [b, deck, z], [b, deck, front], true);
  underside(p, a, b, front, z);
  beam(p, a, b, front, random);
  railing(p, 'rail', [a, deck, front], [b, deck, front], true);
}
