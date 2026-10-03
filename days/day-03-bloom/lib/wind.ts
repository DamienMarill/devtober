import { CAMERA_HEADING } from './ogaki';
import { seeded } from './random';

/**
 * Le vent vu par l'observateur, en m/s : `x` vers la droite de l'écran, `z` en s'éloignant (vers le
 * pont). Avec le regard à l'ouest, la droite de l'écran est le nord.
 */
export interface ScreenWind {
  x: number;
  z: number;
}

/**
 * Projette un vent météo (`from` = d'où il vient, en degrés depuis le nord) dans le repère de l'écran
 * d'un observateur qui regarde vers `heading`.
 */
export function screenWind(speed: number, from: number, heading = CAMERA_HEADING): ScreenWind {
  // Le vent va vers `from + 180` ; on mesure cet angle depuis la direction du regard.
  const rel = ((from + 180 - heading) * Math.PI) / 180;
  return { x: clean(Math.sin(rel) * speed), z: clean(Math.cos(rel) * speed) };
}

const DIRECTIONS = [
  'du nord',
  'du nord-est',
  "d'est",
  'du sud-est',
  'du sud',
  'du sud-ouest',
  "d'ouest",
  'du nord-ouest',
];

/** « vent d'ouest », « vent du nord-est »… */
export function windLabel(from: number): string {
  return `vent ${DIRECTIONS[Math.round((((from % 360) + 360) % 360) / 45) % 8]}`;
}

/** Échelle de Beaufort simplifiée, pour l'`aria-label`. */
export function windStrength(speed: number): string {
  if (speed < 0.5) return 'calme';
  if (speed < 3.4) return 'faible';
  if (speed < 8) return 'modéré';
  if (speed < 13.9) return 'fort';
  return 'tempête';
}

/**
 * Enveloppe des rafales : 0 la plupart du temps, des bouffées qui montent vers 1 de temps en temps. Une
 * somme de sinus aux périodes sans rapport simple (20 à 50 s) : pas de motif qui se répète à l'œil, et
 * déterministe (même graine, mêmes rafales).
 */
export class Gusts {
  private readonly phases: number[];

  constructor(seed = 3) {
    const random = seeded(seed);
    this.phases = [0, 1, 2, 3].map(() => random() * Math.PI * 2);
  }

  /** Force de la rafale à l'instant `t` (secondes), entre 0 et 1. */
  at(t: number): number {
    const [a, b, c, d] = this.phases;
    const swell =
      0.55 * Math.sin(0.13 * t + a) + 0.3 * Math.sin(0.29 * t + b) + 0.25 * Math.sin(0.71 * t + c);
    const flutter = 0.12 * Math.sin(2.3 * t + d);
    return Math.min(1, Math.max(0, swell + flutter) ** 1.5);
  }

  /** Vent instantané : du vent moyen vers les rafales, selon l'enveloppe. */
  speed(t: number, mean: number, gusts: number): number {
    return mean + (Math.max(gusts, mean) - mean) * this.at(t);
  }
}

/** Évite les `-0` et les 1e-17 des sinus : plus lisible dans le debug et les tests. */
function clean(v: number): number {
  const r = Math.round(v * 1e9) / 1e9;
  return r === 0 ? 0 : r;
}
