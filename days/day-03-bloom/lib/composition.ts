import type { Point } from './projection';

/**
 * La composition, d'après le croquis de Damien : on lève les yeux. Les cerisiers des deux rives se
 * referment en tunnel (jusqu'en bas du cadre, où ils se rejoignent), leurs cimes se découpent sur le ciel,
 * les montagnes paraissent dans le creux entre les couronnes, et le pont (voir `bridge.ts`) flotte au
 * milieu, dans une trouée de fleurs. Coordonnées de composition (1600 × 1000), étendues jusqu'au débord.
 */

/** Croquis (1766 × 1104) -> composition (1600 × 1000). */
const K = 1600 / 1766;
const sketch = (points: [number, number][]): Point[] => points.map(([x, y]) => [x * K, y * K]);

/**
 * La masse de gauche : la cime en diagonale contre le ciel, puis le bord de la trouée autour du pont,
 * jusqu'au bas du cadre, et le débord.
 */
export const LEFT_MASS: Point[] = [
  [-260, 1250],
  [770 * K + 10, 1250],
  ...sketch([
    [850, 1104],
    [850, 1060],
    [760, 1020],
    [700, 995],
    [690, 960],
    [670, 915],
    [560, 920],
    [470, 910],
    [470, 870],
    [440, 800],
    [450, 760],
    [520, 700],
    [560, 650],
    [470, 620],
    [390, 580],
    [380, 545],
    [410, 490],
    [400, 460],
    [430, 410],
    [480, 375],
    [550, 375],
    [570, 335],
    [585, 290],
    [560, 250],
    [500, 235],
    [440, 245],
    [400, 260],
    [370, 215],
    [330, 190],
    [220, 160],
    [110, 130],
    [60, 85],
    [0, 40],
  ]),
  [-260, 36],
];

/** La masse de droite, en miroir : elle descend en grappe dans la trouée, au-dessus du bout du pont. */
export const RIGHT_MASS: Point[] = [
  ...sketch([
    [860, 1104],
    [870, 1075],
    [950, 1000],
    [1030, 930],
    [1050, 880],
    [1050, 830],
    [1090, 795],
    [1180, 745],
    [1180, 680],
    [1210, 640],
    [1260, 595],
    [1280, 555],
    [1250, 525],
    [1150, 512],
    [1100, 495],
    [1060, 465],
    [980, 420],
    [945, 370],
    [945, 330],
    [975, 305],
    [1030, 300],
    [1080, 315],
    [1120, 345],
    [1155, 358],
    [1205, 325],
    [1300, 270],
    [1340, 200],
    [1400, 170],
    [1500, 160],
    [1600, 175],
    [1766, 200],
  ]),
  [1860, 190],
  [1860, 1250],
  [860 * K - 10, 1250],
];

/** Repères du ciel : ligne d'horizon apparente (pied des montagnes) et échelle. */
export const SKY = { horizon: 340, focal: 900, x: 760 } as const;

/** Le point est-il dans le polygone ? (règle pair-impair) */
export function inside(polygon: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Le masque des cerisiers, en grille : 1 au cœur des masses, 0 dans le ciel et la trouée, et un dégradé
 * sur une bande de bord (les fleurs s'y raréfient : un contour déchiqueté, pas une découpe nette).
 */
export class Mask {
  private readonly cell = 8;
  private readonly x0 = -260;
  private readonly y0 = -200;
  private readonly cols: number;
  private readonly rows: number;
  private readonly values: Float32Array;

  constructor(polygons: readonly (readonly Point[])[], soft = 4) {
    this.cols = Math.ceil(2120 / this.cell);
    this.rows = Math.ceil(1450 / this.cell);
    const raw = new Float32Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.x0 + (c + 0.5) * this.cell;
        const y = this.y0 + (r + 0.5) * this.cell;
        raw[r * this.cols + c] = polygons.some((p) => inside(p, x, y)) ? 1 : 0;
      }
    }
    this.values = blur(raw, this.cols, this.rows, soft);
  }

  /**
   * Valeur du masque (0–1) au point (composition). Hors de la grille, on prolonge son bord : les arbres
   * proches ont leur tronc loin sur les côtés (dans les masses), et rien ne pousse au-dessus du ciel.
   */
  at(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)));
    return this.values[r * this.cols + c];
  }
}

/** Direction (radians, repère u-v : 0 = vers le haut, positif = vers la droite) où le masque augmente. */
export function maskGradient(mask: Mask, x: number, y: number): number | undefined {
  const d = 12;
  const gx = mask.at(x + d, y) - mask.at(x - d, y);
  const gy = mask.at(x, y - d) - mask.at(x, y + d);
  if (Math.abs(gx) + Math.abs(gy) < 1e-3) return undefined;
  return Math.atan2(gx, gy);
}

/** Flou de boîte séparable (rayon en cellules). */
function blur(src: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += src[r * cols + Math.min(cols - 1, Math.max(0, c + k))];
      tmp[r * cols + c] = sum / n;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += tmp[Math.min(rows - 1, Math.max(0, r + k)) * cols + c];
      out[r * cols + c] = sum / n;
    }
  }
  return out;
}
