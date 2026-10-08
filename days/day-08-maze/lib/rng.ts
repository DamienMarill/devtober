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

/** Mélange une graine et des entiers en une nouvelle graine (pour dériver des flux indépendants). */
export function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Un tirage à graine, avec les petits utilitaires dont le jeu a besoin. */
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

  /** Tirage pondéré : `weights[i]` est le poids de `list[i]`. */
  weighted<T>(list: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  }

  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Loi log-normale de médiane `median` et d'écart-type logarithmique `sigma` (Box-Muller). */
  lognormal(median: number, sigma: number): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(sigma * z);
  }
}
