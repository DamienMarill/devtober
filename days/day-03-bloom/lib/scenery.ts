import { BridgeLantern, bridgeLanterns, buildBridge } from './bridge';
import { buildMountains } from './mountains';
import { Painter, Shape } from './paint';

/**
 * Le décor vectoriel : le plan du FOND (les montagnes de l'ouest) et le plan du PONT (le pont qui flotte
 * dans la trouée des cerisiers, voir `bridge.ts`, et les lanternes pendues à la corde qui le longe). Chaque tracé porte le nom d'une
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

/** Une lanterne de papier (chōchin) pendue à la corde : attache, corps côtelé, chapeaux noirs, motif rose. */
function lantern(p: Painter, { x, y, h, top }: BridgeLantern): void {
  const w = h * 0.62;
  p.poly('lantern-cord', [
    [x - 0.6, top],
    [x + 0.6, top],
    [x + 0.6, y - h / 2],
    [x - 0.6, y - h / 2],
  ]);
  p.ellipse('lantern', x, y, w / 2, h / 2);
  // Côtes du papier.
  for (let k = 1; k < 6; k++) {
    const yy = y - h / 2 + (k * h) / 6;
    const half = (w / 2) * Math.sqrt(1 - ((yy - y) / (h / 2)) ** 2);
    p.poly('lantern-rib', [
      [x - half, yy - 0.4],
      [x + half, yy - 0.4],
      [x + half, yy + 0.4],
      [x - half, yy + 0.4],
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
  bridgeLanterns().forEach((l) => lantern(p, l));
  return p.shapes;
}

/** Halos des lanternes, en unités de composition. */
export function glows(): Glow[] {
  return bridgeLanterns().map(({ x, y, h }) => ({ x, y, r: h * 2.4 }));
}
