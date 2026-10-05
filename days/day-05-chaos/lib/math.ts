/** Intervalle `[a, b]` : une valeur à density 0 et une à density 1, ou une fenêtre de density. */
export type Range = readonly [number, number];

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Valeur de `pair` pour `d` : linéaire sur [0, 1], ou lissée sur `window` si elle est donnée. */
export function ramp(pair: Range, d: number, window?: Range): number {
  const t = window ? smoothstep(window[0], window[1], d) : clamp01(d);
  return pair[0] + (pair[1] - pair[0]) * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** Rapproche `current` de `target` avec une constante de temps `tau` (s), indépendamment du pas. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Générateur pseudo-aléatoire à graine (mulberry32, comme aux jours 2 et 3). */
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

/** Hachage d'une cellule entière de grille vers [0, 1) : même cellule, même valeur, sans rien stocker. */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
