import { MAX_STATES, MIN_STATES, Neighborhood, Rule, transitionTable } from './rule';

/**
 * Décalages des voisins, en `[dx, dy]`. L'hexagonal est celui de Golly : une grille carrée dont on ignore les
 * coins nord-est et sud-ouest, ce qui laisse 6 voisins (chaque ligne est vue décalée d'une demi-cellule).
 */
export const OFFSETS: Readonly<Record<Neighborhood, readonly (readonly [number, number])[]>> = {
  moore: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  vonNeumann: [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ],
  hex: [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
};

/**
 * Le monde : une grille torique (ce qui sort d'un bord revient par l'autre) de cellules à états. 0 = morte,
 * 1 = vivante, 2 à `states - 1` = agonie des règles Generations. Deux tampons qu'on échange à chaque
 * génération ; rien n'est alloué pendant la simulation.
 */
export class World {
  readonly size: number;
  /** États courants, ligne par ligne. */
  cells: Uint8Array;
  private next: Uint8Array;
  /** 1 là où la cellule est vivante (état 1) : ce qu'on compte comme voisin. */
  private readonly alive: Uint8Array;
  /** Indices des voisins de chaque cellule, `index * 8 + k`, pour le voisinage en cours. */
  private readonly neighbors: Int32Array;
  private neighborhood: Neighborhood | null = null;
  private degree = 0;

  generation = 0;
  population = 0;
  /** Bilan de la dernière génération (pour le son et les statistiques). */
  births = 0;
  deaths = 0;
  /** Barycentre des naissances de la dernière génération, de 0 à 1 (0,5 sans naissance). */
  birthX = 0.5;
  birthY = 0.5;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.cells = new Uint8Array(this.size);
    this.next = new Uint8Array(this.size);
    this.alive = new Uint8Array(this.size);
    this.neighbors = new Int32Array(this.size * 8);
  }

  index(x: number, y: number): number {
    const w = this.width;
    const h = this.height;
    return (((y % h) + h) % h) * w + (((x % w) + w) % w);
  }

  get(x: number, y: number): number {
    return this.cells[this.index(x, y)];
  }

  /** Pose un état (coordonnées repliées sur le tore). */
  set(x: number, y: number, state: number): void {
    const i = this.index(x, y);
    const before = this.cells[i] === 1;
    this.cells[i] = state;
    this.population += (state === 1 ? 1 : 0) - (before ? 1 : 0);
  }

  /** Vide le monde et remet le compteur de générations à zéro. */
  clear(): void {
    this.cells.fill(0);
    this.generation = 0;
    this.population = 0;
    this.births = 0;
    this.deaths = 0;
  }

  /** Recompte la population (après une écriture en bloc dans `cells`). */
  recount(): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.cells[i] === 1) n++;
    this.population = n;
  }

  /** Avance d'une génération. */
  step(rule: Rule, table = transitionTable(rule)): void {
    if (this.neighborhood !== rule.neighborhood) this.buildNeighbors(rule.neighborhood);
    const { cells, next, alive, neighbors, size, width } = this;
    const degree = this.degree;
    const states = Math.min(MAX_STATES, Math.max(MIN_STATES, rule.states));

    for (let i = 0; i < size; i++) alive[i] = cells[i] === 1 ? 1 : 0;

    let population = 0;
    let births = 0;
    let deaths = 0;
    let bx = 0;
    let by = 0;
    for (let i = 0; i < size; i++) {
      const s = cells[i];
      let out: number;
      if (s >= 2) {
        out = s + 1 >= states ? 0 : s + 1;
      } else {
        let n = 0;
        const base = i * 8;
        for (let k = 0; k < degree; k++) n += alive[neighbors[base + k]];
        if (s === 0) {
          out = table[n];
          if (out) {
            births++;
            bx += i % width;
            by += (i / width) | 0;
          }
        } else {
          out = table[9 + n] ? 1 : states > 2 ? 2 : 0;
          if (out !== 1) deaths++;
        }
      }
      next[i] = out;
      if (out === 1) population++;
    }

    this.next = cells;
    this.cells = next;
    this.generation++;
    this.population = population;
    this.births = births;
    this.deaths = deaths;
    this.birthX = births ? (bx / births + 0.5) / width : 0.5;
    this.birthY = births ? (by / births + 0.5) / this.height : 0.5;
  }

  private buildNeighbors(neighborhood: Neighborhood): void {
    const offsets = OFFSETS[neighborhood];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const base = (y * this.width + x) * 8;
        offsets.forEach(([dx, dy], k) => (this.neighbors[base + k] = this.index(x + dx, y + dy)));
      }
    }
    this.neighborhood = neighborhood;
    this.degree = offsets.length;
  }
}
