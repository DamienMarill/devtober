/**
 * Couleurs : triplets RVB en 0–255, mélangés en lumière linéaire (un mélange en sRGB brut salit les
 * dégradés : le bleu nuit + orange donnerait du gris au lieu d'un mauve).
 */

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(clamp255(v)).toString(16).padStart(2, '0')).join('')}`;
}

export function rgba(c: Rgb, alpha: number): string {
  const [r, g, b] = c.map((v) => Math.round(clamp255(v)));
  return `rgb(${r} ${g} ${b} / ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
}

const toLinear = (v: number) => {
  const s = clamp255(v) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l: number) => {
  const v = Math.max(0, l);
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return clamp255(s * 255);
};

/** Mélange de `a` vers `b` (t = 0 : a, t = 1 : b), en lumière linéaire. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [0, 1, 2].map((i) =>
    fromLinear(toLinear(a[i]) * (1 - k) + toLinear(b[i]) * k),
  ) as unknown as Rgb;
}

/**
 * Éclaire une couleur (`albedo`) : chaque canal est multiplié par la lumière (`light`, 1 = blanc
 * neutre ; au-delà, ça éclaircit), en linéaire.
 */
export function light(albedo: Rgb, lightRgb: readonly [number, number, number]): Rgb {
  return [0, 1, 2].map((i) => fromLinear(toLinear(albedo[i]) * lightRgb[i])) as unknown as Rgb;
}

/** Ajoute une lumière colorée (lampes), en linéaire. `glow` est une couleur, `amount` son intensité. */
export function add(base: Rgb, glow: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) =>
    fromLinear(toLinear(base[i]) + toLinear(glow[i]) * Math.max(0, amount)),
  ) as unknown as Rgb;
}

/** Luminance relative (0–1). */
export function luminance(c: Rgb): number {
  return 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
}

/** Désature vers le gris de même luminance (t = 1 : gris). */
export function desaturate(c: Rgb, t: number): Rgb {
  const y = fromLinear(luminance(c));
  return mix(c, [y, y, y], t);
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, v));
}
