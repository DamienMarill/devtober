import { buildBridge } from './bridge';
import { LANTERN_SPOTS } from './composition';
import { buildMountains } from './mountains';
import { Painter, Shape } from './paint';
import { Point } from './projection';

/**
 * Le décor vectoriel : le plan du FOND (les montagnes de l'ouest) et le plan du PONT (le pont qui flotte
 * dans la trouée des cerisiers, voir `bridge.ts`, et les lanternes pendues aux branches). Chaque tracé porte le nom d'une
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
  buildBridge(p);
  LANTERN_SPOTS.forEach((spot, i) => lantern(p, spot, i));
  return p.shapes;
}

/** Halos des lanternes, en unités de composition. */
export function glows(): Glow[] {
  return LANTERN_SPOTS.map(([x, y]) => ({ x, y, r: LANTERN * 2.4 }));
}
