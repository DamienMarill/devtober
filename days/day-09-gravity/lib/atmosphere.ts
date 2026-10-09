/**
 * L'atmosphère type (ISA), dans la troposphère (jusqu'à 11 km) : la température baisse de 6,5 °C par
 * kilomètre, et la masse volumique de l'air avec elle. À 6 000 m, l'air est déjà moitié moins dense qu'au
 * sol : c'est elle qui fixe la portance et la traînée.
 */

const T0 = 288.15;
const P0 = 101_325;
const LAPSE = 0.0065;
const R = 287.05;
const EXP = 5.2559;

export const RHO0 = P0 / (R * T0);

/** Température (K) à l'altitude `h` (m). */
export const temperature = (h: number) => T0 - LAPSE * Math.min(h, 11_000);

/** Masse volumique de l'air (kg/m³) à l'altitude `h` (m). */
export function density(h: number): number {
  const t = temperature(h);
  const p = P0 * (t / T0) ** EXP;
  return p / (R * t);
}

/** Vitesse du son (m/s) à l'altitude `h` : elle baisse avec la température. */
export const soundSpeed = (h: number) => Math.sqrt(1.4 * R * temperature(h));
