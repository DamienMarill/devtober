/** Ce que fait le monde : il vit, il est mort, il est figé, ou il repasse par les mêmes états. */
export type Verdict =
  | { kind: 'alive' }
  | { kind: 'extinct' }
  | { kind: 'still' }
  | { kind: 'oscillator'; period: number };

/** Empreinte FNV-1a (32 bits) d'une grille. */
export function hashCells(cells: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cells.length; i++) {
    h ^= cells[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Repère les cycles : garde les empreintes des `window` dernières générations dans un anneau. Si l'empreinte du
 * jour y est déjà, à `p` générations d'écart, le monde est périodique de période `p` (1 = figé).
 * Sur le tore, un vaisseau finit lui aussi par revenir, mais bien au-delà de la fenêtre : il reste « vivant ».
 */
export class CycleWatch {
  private readonly ring: Uint32Array;
  private count = 0;
  private head = 0;

  constructor(readonly window = 64) {
    this.ring = new Uint32Array(window);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
  }

  /** Ajoute la génération qui vient d'être calculée et rend le verdict. */
  push(cells: Uint8Array, population: number): Verdict {
    const hash = hashCells(cells);
    let period = 0;
    for (let p = 1; p <= this.count; p++) {
      if (this.ring[(this.head - p + this.window) % this.window] === hash) {
        period = p;
        break;
      }
    }
    this.ring[this.head] = hash;
    this.head = (this.head + 1) % this.window;
    this.count = Math.min(this.count + 1, this.window);
    if (population === 0) return { kind: 'extinct' };
    if (period === 1) return { kind: 'still' };
    if (period > 1) return { kind: 'oscillator', period };
    return { kind: 'alive' };
  }
}
