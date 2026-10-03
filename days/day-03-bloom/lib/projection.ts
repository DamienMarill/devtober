import { SKY } from './composition';

/**
 * La perspective de la scène. Les cerisiers, les gouttes et les pétales sont placés en mètres, puis
 * projetés dans le repère de la composition (1600 × 1000 unités) : un pétale part bien d'une fleur, et
 * il est d'autant plus grand et rapide à l'écran qu'il passe près de nous.
 *
 * Repère : X vers la droite (le nord), Y vers le haut (0 = surface de l'eau), Z droit devant (l'ouest).
 * L'œil est en (0, EYE, 0), au-dessus du canal, et lève les yeux : l'horizon est sous le cadre, l'eau et
 * les berges hors champ, et les couronnes se referment en tunnel.
 */

/**
 * Focale, en unités de composition par mètre à 1 m (≈ 37° de champ horizontal) : un regard « au
 * téléobjectif », comme sur la photo, qui tasse la profondeur et fait des cerisiers des deux rives un tunnel.
 */
export const FOCAL = 2400;
/** Point de fuite du canal (plein ouest), au bas du cadre : on lève les yeux vers les cerisiers. */
export const VANISH_X = 790;
/** Ligne d'horizon (hauteur de l'œil), sous le cadre : le regard est tourné vers le haut. */
export const HORIZON = 1080;
/** Hauteur de l'œil au-dessus de l'eau, en mètres. */
export const EYE = 3.6;
/**
 * Les montagnes, le soleil et la lune ont leur propre repère, celui du ciel qu'on voit entre les cimes :
 * resserrés en largeur (le mont Ibuki, à 290°, et le massif de Yōrō, à 240°, tiennent dans le cadre), posés
 * sur une ligne d'horizon apparente au pied des montagnes. Licence de décorateur.
 */
export const SKY_SQUEEZE = 0.6;

export type Point = readonly [number, number];

/** Point 3D (mètres) -> point de la composition. Z doit être > 0. */
export function project(x: number, y: number, z: number): Point {
  return [VANISH_X + (FOCAL * x) / z, HORIZON + (FOCAL * (EYE - y)) / z];
}

/** Point de la composition vu à la profondeur `z` -> position 3D (X, Y). */
export function unproject(px: number, py: number, z: number): { x: number; y: number } {
  return { x: ((px - VANISH_X) * z) / FOCAL, y: EYE - ((py - HORIZON) * z) / FOCAL };
}

/** Direction du ciel (azimut, élévation en degrés) -> point de la composition (repère du ciel, voir `SKY`). */
export function skyPoint(azimuth: number, elevation: number, heading = 270): Point {
  const da = ((((azimuth - heading + 180) % 360) + 360) % 360) - 180;
  const rad = Math.PI / 180;
  return [
    SKY.x + SKY.focal * Math.tan(Math.max(-80, Math.min(80, da * SKY_SQUEEZE)) * rad),
    SKY.horizon - SKY.focal * Math.tan(Math.max(-80, Math.min(80, elevation)) * rad),
  ];
}

/** Les mesures du lieu, en mètres (les arbres et les pétales s'y placent ; le sol est sous le cadre). */
export const SITE = {
  /** Le canal : mur sud (gauche) et bord du quai nord (droite). */
  river: { left: -8.5, right: 2.5 },
  /** Le quai pavé de la rive nord : dalles à 0,9 m au-dessus de l'eau, mur à droite. */
  path: { y: 0.9, left: 2.5, right: 5.2 },
  /** Haut des berges (rue, pieds des cerisiers). */
  bank: 2.3,
  /** Au-delà de cette profondeur, un pétale est trop petit pour compter. */
  petalFar: 42,
} as const;
