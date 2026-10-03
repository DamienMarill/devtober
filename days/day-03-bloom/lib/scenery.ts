import { BRIDGE_FACE, LANTERN_SPOTS, TUNNEL_VANISH, homography } from './composition';
import { buildMountains } from './mountains';
import { Painter, Shape } from './paint';
import { Point } from './projection';
import { seeded } from './random';

/**
 * Le décor vectoriel : le plan du FOND (les montagnes de l'ouest) et le plan du PONT (le pont qui flotte
 * dans la trouée des cerisiers, et les lanternes pendues aux branches). Chaque tracé porte le nom d'une
 * couleur (variable CSS) que la lumière du moment recalcule ; la géométrie est construite une fois.
 */

/** Une source de lumière du décor, pour les halos de nuit (unités de composition). */
export interface Glow {
  x: number;
  y: number;
  r: number;
}

export function buildFond(): Shape[] {
  const p = new Painter();
  buildMountains(p);
  return p.shapes;
}

// ---------------------------------------------------------------- PONT

/** Élévation du pont (unités relatives au carré unité de sa face avant, v = 0 en haut). */
const SPAN = 14;
/** Hauteurs, depuis le haut de la main courante (0) jusqu'au bas de la poutre (1). */
const RAIL_TOP = 0;
const RAIL_BOTTOM = 0.06;
const MID_RAIL = [0.42, 0.46] as const;
const DECK_TOP = 0.8;
const DECK_BOTTOM = 1;
/** Écartement des poteaux et des barreaux (m, le long de la portée). */
const POST_EVERY = 1.75;
const BAR_EVERY = 0.14;

/** Le pont recule vers le fond du tunnel : la face arrière est la face avant resserrée vers le point de fuite. */
function shrink(
  quad: readonly [Point, Point, Point, Point],
  k: number,
): [Point, Point, Point, Point] {
  const [vx, vy] = TUNNEL_VANISH;
  const at = ([x, y]: Point): Point => [vx + (x - vx) * k, vy + (y - vy) * k];
  return [at(quad[0]), at(quad[1]), at(quad[2]), at(quad[3])];
}

/** Un garde-corps (poteaux, lisses, barreaux) sur une face du pont. */
function railing(
  p: Painter,
  face: (u: number, v: number) => Point,
  m: string,
  detail: boolean,
): void {
  const quad = (u0: number, v0: number, u1: number, v1: number) =>
    p.poly(m, [face(u0, v0), face(u1, v0), face(u1, v1), face(u0, v1)]);
  const u = (meters: number) => meters / SPAN;
  // Lisse basse, lisse intermédiaire, barreaux, poteaux à chapeau, main courante.
  quad(0, DECK_TOP - 0.06, 1, DECK_TOP);
  quad(0, MID_RAIL[0], 1, MID_RAIL[1]);
  for (let x = 0.1; x < SPAN; x += detail ? BAR_EVERY : BAR_EVERY * 2) {
    quad(u(x), RAIL_BOTTOM, u(x + 0.045), DECK_TOP - 0.05);
  }
  for (let x = 0; x <= SPAN + 0.01; x += POST_EVERY) {
    quad(u(x - 0.09), RAIL_TOP - 0.03, u(x + 0.09), DECK_TOP);
    quad(u(x - 0.12), RAIL_TOP - 0.07, u(x + 0.12), RAIL_TOP - 0.02);
  }
  quad(-0.01, RAIL_TOP, 1.01, RAIL_BOTTOM);
}

function bridge(p: Painter): void {
  const front = homography(BRIDGE_FACE);
  const back = homography(shrink(BRIDGE_FACE, 0.975));
  // Le garde-corps du fond, vu à travers celui de devant.
  railing(p, back, 'rail-back', false);
  // Le dessous du tablier : vu d'en bas, il se montre entre la poutre de devant et celle de derrière.
  p.poly('deck-under', [
    front(0, DECK_BOTTOM),
    front(1, DECK_BOTTOM),
    back(1, DECK_BOTTOM),
    back(0, DECK_BOTTOM),
  ]);
  // Les poutres sous le tablier.
  for (const k of [0.25, 0.5, 0.75]) {
    p.poly('deck-shade', [
      front(k - 0.004, DECK_BOTTOM),
      front(k + 0.004, DECK_BOTTOM),
      back(k + 0.004, DECK_BOTTOM),
      back(k - 0.004, DECK_BOTTOM),
    ]);
  }
  // La poutre de rive : béton clair, une ligne d'ombre dessous, un liseré de lumière dessus.
  p.poly('deck', [
    front(0, DECK_TOP),
    front(1, DECK_TOP),
    front(1, DECK_BOTTOM),
    front(0, DECK_BOTTOM),
  ]);
  p.poly('deck-shade', [
    front(0, DECK_BOTTOM - 0.06),
    front(1, DECK_BOTTOM - 0.06),
    front(1, DECK_BOTTOM),
    front(0, DECK_BOTTOM),
  ]);
  p.poly('deck-hi', [
    front(0, DECK_TOP),
    front(1, DECK_TOP),
    front(1, DECK_TOP + 0.03),
    front(0, DECK_TOP + 0.03),
  ]);
  // Taches et coulures sur le béton (un vieux pont).
  const random = seeded(7);
  for (let i = 0; i < 26; i++) {
    const u0 = random();
    const w = 0.004 + random() * 0.01;
    p.poly('deck-stain', [
      front(u0, DECK_TOP + 0.05),
      front(u0 + w, DECK_TOP + 0.05),
      front(u0 + w * 0.6, DECK_BOTTOM - 0.08 - random() * 0.15),
      front(u0, DECK_BOTTOM - 0.08),
    ]);
  }
  railing(p, front, 'rail', true);
  // Lumière sur le dessus de la main courante.
  p.poly('rail-hi', [
    front(-0.01, RAIL_TOP - 0.005),
    front(1.01, RAIL_TOP - 0.005),
    front(1.01, RAIL_TOP + 0.015),
    front(-0.01, RAIL_TOP + 0.015),
  ]);
}

/** Taille d'une lanterne (unités) : sa hauteur. */
const LANTERN = 46;

/** Une lanterne de papier (chōchin) pendue à son fil : corps côtelé, chapeaux noirs, motif rose. */
function lantern(p: Painter, [x, y]: Point, i: number): void {
  const h = LANTERN * (0.8 + ((i * 37) % 10) / 25);
  const w = h * 0.62;
  p.poly('lantern-cord', [
    [x - 0.8, y - h * 1.6],
    [x + 0.8, y - h * 1.6],
    [x + 0.8, y - h / 2],
    [x - 0.8, y - h / 2],
  ]);
  p.ellipse('lantern', x, y, w / 2, h / 2);
  // Côtes du papier.
  for (let k = 1; k < 6; k++) {
    const yy = y - h / 2 + (k * h) / 6;
    const half = (w / 2) * Math.sqrt(1 - ((yy - y) / (h / 2)) ** 2);
    p.poly('lantern-rib', [
      [x - half, yy - 0.5],
      [x + half, yy - 0.5],
      [x + half, yy + 0.5],
      [x - half, yy + 0.5],
    ]);
  }
  p.ellipse('lantern-mark', x, y + h * 0.04, w * 0.16, h * 0.14);
  for (const dy of [-1, 1]) {
    const cy = y + (dy * h) / 2;
    p.poly('lantern-cap', [
      [x - w * 0.22, cy - h * 0.05],
      [x + w * 0.22, cy - h * 0.05],
      [x + w * 0.22, cy + h * 0.05],
      [x - w * 0.22, cy + h * 0.05],
    ]);
  }
}

export function buildPont(): Shape[] {
  const p = new Painter();
  bridge(p);
  LANTERN_SPOTS.forEach((spot, i) => lantern(p, spot, i));
  return p.shapes;
}

/** Halos des lanternes, en unités de composition. */
export function glows(): Glow[] {
  return LANTERN_SPOTS.map(([x, y]) => ({ x, y, r: LANTERN * 2.4 }));
}
