import { Precip } from './weather';
import { project, unproject } from './projection';
import { ScreenWind } from './wind';

/**
 * La pluie (ou la bruine, ou la neige), en mètres comme les pétales : des gouttes qui tombent à leur vraie
 * vitesse, penchées par le vent, entre nous et le pont.
 */

export interface Drop {
  x: number;
  y: number;
  z: number;
  /** Vitesse de chute propre (m/s, positive) et oscillation (neige). */
  fall: number;
  wobble: number;
}

export interface RainEnv {
  precip: Precip;
  /** 0–1 */
  intensity: number;
  wind: ScreenWind;
  view: { x: number; y: number; w: number; h: number };
  time: number;
}

/** Vitesse de chute (m/s) : la pluie ~7, la bruine ~3, la neige ~1. */
const FALL: Record<Exclude<Precip, 'none'>, [number, number]> = {
  rain: [6, 3],
  drizzle: [2.6, 1],
  snow: [0.8, 0.5],
};
/** Gouttes à l'écran à pleine intensité. */
export const MAX_DROPS = 1100;
/** Profondeurs entre lesquelles il pleut (m) : au-delà, la pluie n'est plus qu'un voile. */
const Z_MIN = 1.6;
const Z_MAX = 45;

export class RainField {
  readonly drops: Drop[] = [];
  private precip: Precip = 'none';
  /** Multiplie le nombre de gouttes (moins sur mobile ou en mouvement réduit). */
  density = 1;

  constructor(private readonly random: () => number = Math.random) {}

  /** Combien de gouttes pour une intensité donnée. */
  target(intensity: number): number {
    if (this.precip === 'none') return 0;
    const k = this.precip === 'snow' ? 0.6 : this.precip === 'drizzle' ? 0.8 : 1;
    return Math.round(MAX_DROPS * intensity * k * this.density);
  }

  step(dt: number, env: RainEnv): void {
    if (env.precip !== this.precip) {
      this.precip = env.precip;
      this.drops.length = 0;
    }
    const target = this.target(env.intensity);
    // On complète progressivement (sinon une averse apparaîtrait d'un bloc).
    const add = Math.min(target - this.drops.length, Math.ceil(target * dt * 1.5) + 1);
    for (let i = 0; i < add; i++) this.drops.push(this.spawn(env, true));
    if (this.drops.length > target)
      this.drops.length = Math.max(target, this.drops.length - Math.ceil(dt * 400));

    const snow = this.precip === 'snow';
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const sway = snow ? Math.sin(env.time * 1.7 + d.wobble) * 0.5 : 0;
      // Une goutte n'a guère d'inertie : elle va à la vitesse du vent.
      d.x += (env.wind.x + sway) * dt;
      d.z += env.wind.z * dt;
      d.y -= d.fall * dt;
      // Sortie par le bas du cadre (on lève les yeux : le sol est hors champ), ou trop près, trop loin.
      if (
        project(d.x, d.y, d.z)[1] > env.view.y + env.view.h + 40 ||
        d.z < Z_MIN ||
        d.z > Z_MAX + 5
      ) {
        this.drops[i] = this.spawn(env, false);
      }
    }
  }

  /** Une goutte au hasard dans le volume visible ; `anywhere` : à n'importe quelle hauteur (démarrage). */
  private spawn(env: RainEnv, anywhere: boolean): Drop {
    const r = this.random;
    const z = Z_MIN + r() ** 1.3 * (Z_MAX - Z_MIN);
    const top = unproject(0, env.view.y - 30, z).y;
    const bottom = anywhere ? unproject(0, env.view.y + env.view.h, z).y : top;
    const x = unproject(env.view.x - 60 + r() * (env.view.w + 120), 0, z).x;
    const [fall, spread] = FALL[this.precip === 'none' ? 'rain' : this.precip];
    return {
      x,
      y: bottom + r() * (top - bottom) + (anywhere ? 0 : r() * 2),
      z,
      fall: fall + r() * spread,
      wobble: r() * 10,
    };
  }
}

/**
 * Le trait d'une goutte à l'écran (composition) : sa position et là où elle était `blur` secondes plus tôt,
 * comme le flou de bougé d'un œil (ou d'un appareil).
 */
export function streak(d: Drop, wind: ScreenWind, blur = 0.03): [number, number, number, number] {
  const [x0, y0] = project(d.x, d.y, d.z);
  const [x1, y1] = project(d.x - wind.x * blur, d.y + d.fall * blur, d.z - wind.z * blur);
  return [x0, y0, x1, y1];
}
