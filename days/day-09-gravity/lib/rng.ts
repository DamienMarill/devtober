/** Générateur pseudo-aléatoire à graine (mulberry32, comme aux jours précédents). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un tirage à graine, avec les petits utilitaires dont la machine a besoin. */
export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = seeded(seed);
  }

  float(): number {
    return this.next();
  }

  /** Réel dans [min, max[. */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [min, max] (bornes comprises). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Loi normale centrée réduite (Box-Muller). */
  gauss(): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
