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

/** Un trait 3D d'épaisseur `t` mètres le long d'une polyligne (bambou, corde). */
function stroke(p: Painter, m: string, points: readonly V3[], t: number): void {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0, z0] = points[i - 1];
    const [x1, y1, z1] = points[i];
    const a = bridgePoint(x0, y0, z0);
    const b = bridgePoint(x1, y1, z1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const wa = (t * BRIDGE_VIEW.focal) / z0 / 2;
    const wb = (t * BRIDGE_VIEW.focal) / z1 / 2;
    p.poly(m, [
      [a[0] + nx * wa, a[1] + ny * wa],
      [b[0] + nx * wb, b[1] + ny * wb],
      [b[0] - nx * wb, b[1] - ny * wb],
      [a[0] - nx * wa, a[1] - ny * wa],
    ]);
  }
}

/** Hauteur d'une lanterne (m), longueur de son attache, flèche de la corde entre deux mâts. */
const LANTERN_M = 0.45;
const CORD = 0.12;
const SAG = 0.3;
/** Les mâts de bambou dépassent du garde-corps de tant de mètres. */
const POLE = 1.45;

/** Une lanterne accrochée au pont : centre et hauteur (composition), et le point de la corde où elle pend. */
export interface BridgeLantern {
  x: number;
  y: number;
  h: number;
  /** Ordonnée du point d'attache sur la corde. */
  top: number;
}

/**
 * Le cordon de lanternes de la fête des cerisiers : des mâts de bambou ligaturés aux poteaux du garde-corps
 * avant (un sur deux) et aux coins du carré, une corde tendue de mât en mât, et une lanterne au creux de
 * chaque travée (deux devant le carré).
 */
function lanternLine(): { poles: V3[]; spans: { from: V3; to: V3; lanterns: number[] }[] } {
  const { z, rail, balcony } = BRIDGE;
  const a = balcony.x - balcony.half;
  const b = balcony.x + balcony.half;
  const front = z - balcony.depth;
  const y = rail + 0.1;
  const poles: V3[] = [
    [a - POST_EVERY * 6, y, z],
    [a - POST_EVERY * 4, y, z],
    [a - POST_EVERY * 2, y, z],
    [a, y, front],
    [b, y, front],
    [b + POST_EVERY * 2, y, z],
    [b + POST_EVERY * 4, y, z],
    [b + POST_EVERY * 6, y, z],
  ];
  const spans = poles.slice(1).map((to, i) => ({
    from: poles[i],
    to,
    lanterns: i === 3 ? [1 / 3, 2 / 3] : [0.5],
  }));
  return { poles, spans };
}

/** Point de la corde d'une travée, à `t` (0–1) : une parabole sous la ligne des sommets des mâts. */
function ropeAt(from: V3, to: V3, t: number): V3 {
  const top = POLE - 0.1;
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + top - SAG * 4 * t * (1 - t),
    from[2] + (to[2] - from[2]) * t,
  ];
}

/** Les lanternes du pont, de gauche à droite. */
export function bridgeLanterns(): BridgeLantern[] {
  const out: BridgeLantern[] = [];
  for (const span of lanternLine().spans) {
    for (const t of span.lanterns) {
      const [x, y, z] = ropeAt(span.from, span.to, t);
      const [, top] = bridgePoint(x, y, z);
      const [cx, cy] = bridgePoint(x, y - CORD - LANTERN_M / 2, z);
      out.push({ x: cx, y: cy, h: (LANTERN_M * BRIDGE_VIEW.focal) / z, top });
    }
  }
  return out;
}

/** Les mâts et les cordes (les lanternes elles-mêmes sont dessinées par `scenery.ts`). */
function lanternRigging(p: Painter): void {
  const { poles, spans } = lanternLine();
  for (const [x, y, z] of poles) {
    stroke(
      p,
      'lantern-pole',
      [
        [x, y - 0.6, z],
        [x, y + POLE, z],
      ],
      0.06,
    );
    // Ligatures sur le poteau.
    stroke(
      p,
      'lantern-cord',
      [
        [x - 0.05, y - 0.15, z],
        [x + 0.05, y - 0.15, z],
      ],
      0.04,
    );
    stroke(
      p,
      'lantern-cord',
      [
        [x - 0.05, y - 0.35, z],
        [x + 0.05, y - 0.35, z],
      ],
      0.04,
    );
  }
  for (const { from, to } of spans) {
    const rope: V3[] = [];
    for (let i = 0; i <= 16; i++) rope.push(ropeAt(from, to, i / 16));
    stroke(p, 'lantern-cord', rope, 0.02);
  }
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

  lanternRigging(p);
}
