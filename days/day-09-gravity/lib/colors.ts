/** La couleur d'un facteur de charge, partout la même : trace, cadran, courbe. */

export const COLORS = {
  /** Apesanteur : rose sakura. */
  zero: '#ff8fd8',
  /** Vol normal, autour de 1 g : périwinkle. */
  one: '#c9c6ff',
  /** Hypergravité (la ressource, 1,8 g) : pêche. */
  hyper: '#ffb35c',
  /** Négatif ou trop fort : rouge. */
  danger: '#ff5a6e',
  ink: '#0e0a35',
};

/** Couleur d'un facteur de charge, en mélangeant les repères ci-dessus. */
export function loadColor(n: number): string {
  if (n < -0.12 || n > 2.3) return COLORS.danger;
  if (Math.abs(n) < 0.06) return COLORS.zero;
  if (n < 0.6) return mix(COLORS.zero, COLORS.one, (Math.abs(n) - 0.06) / 0.54);
  if (n <= 1.15) return COLORS.one;
  if (n < 1.5) return mix(COLORS.one, COLORS.hyper, (n - 1.15) / 0.35);
  return COLORS.hyper;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => {
    const x = (pa >> s) & 255;
    const y = (pb >> s) & 255;
    return Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  });
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}
