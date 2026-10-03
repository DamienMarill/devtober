import { SITE, project, unproject } from './projection';
import { ScreenWind } from './wind';

/**
 * Les pétales qui tombent, simulés en mètres dans le même espace que les cerisiers : ils partent des
 * bouquets, descendent en culbutant et suivent le vent réel, projeté dans notre regard.
 */

export interface Petal {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Rotation dans le plan de l'écran (radians) et culbute (la largeur apparente suit cos(tumble)). */
  angle: number;
  spin: number;
  tumble: number;
  tumbleSpeed: number;
  /** Taille (m), teinte (index de sprite), phase de turbulence. */
  size: number;
  tint: number;
  phase: number;
  /** Âge (s) ; un pétale meurt en s'effaçant (`fade` de 1 à 0). */
  age: number;
  fade: number;
}

/** Une grappe, telle qu'exportée par la canopée : centre (composition), rayon (unités), profondeur (m). */
export interface Source {
  x: number;
  y: number;
  r: number;
  z: number;
}

export interface PetalEnv {
  /** Vent instantané dans le repère de l'écran (m/s), rafales comprises. */
  wind: ScreenWind;
  /** Force de la rafale en cours (0–1) : elle arrache des pétales. */
  gust: number;
  /** Pluie (0–1) : les pétales mouillés tombent plus vite. */
  rain: number;
  /** Ce qu'on voit, en composition : on n'anime que ça. */
  view: { x: number; y: number; w: number; h: number };
  /** Temps écoulé (s), pour la turbulence. */
  time: number;
}

/** Vitesse de chute d'un pétale sec (m/s) : un pétale de cerisier tombe à ~1 m/s. */
export const FALL_SPEED = 1;
/** Temps de réponse au vent (s) : un pétale n'a presque pas d'inertie. */
const DRAG = 1.6;
const FADE_SECONDS = 1.2;
/** Un pétale qui traîne trop (pris dans un tourbillon hors champ) finit par s'effacer. */
const MAX_SECONDS = 40;

export class PetalField {
  readonly petals: Petal[] = [];
  /** Pétales émis par seconde à vent nul, et plafond de pétales vivants. */
  rate = 120;
  max = 1600;
  private debt = 0;

  constructor(
    /** Les grappes d'où partent les pétales (remplaçables : les arbres sont générés peu à peu). */
    public sources: readonly Source[],
    private readonly random: () => number = Math.random,
  ) {}

  step(dt: number, env: PetalEnv): void {
    const speed = Math.hypot(env.wind.x, env.wind.z);
    // Plus de vent, plus de pétales arrachés ; une rafale en arrache d'un coup.
    const rate =
      this.rate * (0.7 + Math.min(speed, 12) / 5) * (1 + 2 * env.gust) * (1 + env.rain * 0.5);
    this.debt += rate * dt;
    while (this.debt >= 1) {
      this.debt -= 1;
      if (this.petals.length < this.max) this.spawn(env);
    }

    const fall = FALL_SPEED * (1 + 1.6 * env.rain);
    const k = Math.min(1, dt * DRAG);
    for (const p of this.petals) {
      p.age += dt;
      // Turbulence propre à chaque pétale (deux sinus), par-dessus le vent.
      const t = env.time + p.phase;
      const tx = 0.55 * Math.sin(1.3 * t) + 0.3 * Math.sin(3.1 * t + 1.7);
      const tz = 0.4 * Math.sin(0.9 * t + 0.6);
      const ty = 0.35 * Math.sin(2.3 * t);
      p.vx += (env.wind.x + tx - p.vx) * k;
      p.vz += (env.wind.z + tz - p.vz) * k;
      p.vy += (-fall * (0.75 + 0.5 * Math.abs(Math.cos(p.tumble))) + ty - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.angle += p.spin * dt;
      p.tumble += p.tumbleSpeed * dt;
      this.land(p);
      if (p.age > MAX_SECONDS || this.outside(p, env.view)) p.fade -= dt / FADE_SECONDS;
    }
    for (let i = this.petals.length - 1; i >= 0; i--) {
      if (this.petals[i].fade <= 0) this.petals.splice(i, 1);
    }
  }

  /** Le pétale touche l'eau ou la berge (hors champ, sous le cadre) : il s'arrête et s'efface. */
  private land(p: Petal): void {
    const { river, path, bank } = SITE;
    const ground =
      p.x > river.left && p.x < river.right
        ? 0
        : p.x >= path.left && p.x <= path.right
          ? path.y
          : bank;
    if (p.y > ground) return;
    p.y = ground;
    p.vx = p.vy = p.vz = 0;
    p.spin = 0;
    p.tumbleSpeed = 0;
    p.fade = Math.min(p.fade, 0.3);
  }

  /** Sorti du champ (ou passé derrière le pont, ou derrière nous) : il s'efface. */
  private outside(p: Petal, view: PetalEnv['view']): boolean {
    if (p.z < 1.2 || p.z > SITE.petalFar + 1) return true;
    const [sx, sy] = project(p.x, p.y, p.z);
    const margin = 80;
    return sx < view.x - margin || sx > view.x + view.w + margin || sy > view.y + view.h + margin;
  }

  private spawn(env: PetalEnv): void {
    const r = this.random;
    const { view } = env;
    const inView = this.sources.filter(
      (s) => s.x > view.x && s.x < view.x + view.w && s.y > view.y - 50 && s.y < view.y + view.h,
    );
    let x: number;
    let y: number;
    let z: number;
    // Un quart naît dans les fleurs visibles ; les autres tombent d'au-dessus du cadre, sur toute sa
    // largeur : ce sont eux qu'on voit passer devant le ciel, le pont et les montagnes.
    if (inView.length && r() < 0.25) {
      const s = inView[Math.floor(r() * inView.length)];
      z = Math.max(2, s.z + (r() - 0.5) * 3);
      const p = unproject(s.x + (r() - 0.5) * s.r * 1.6, s.y + (r() - 0.5) * s.r, z);
      x = p.x;
      y = p.y;
    } else {
      // Une part tombe tout près de nous : de grands pétales qui passent devant les yeux.
      z = r() < 0.25 ? 2.2 + r() * 4 : 5 + r() ** 1.5 * 25;
      const p = unproject(view.x + r() * view.w, view.y - 20, z);
      x = p.x;
      y = p.y;
    }
    this.petals.push({
      x,
      y,
      z,
      vx: env.wind.x * 0.5,
      vy: -0.2,
      vz: env.wind.z * 0.5,
      angle: r() * Math.PI * 2,
      spin: (r() - 0.5) * 3,
      tumble: r() * Math.PI * 2,
      tumbleSpeed: 2 + r() * 5,
      // Un peu plus grands que nature (1,5 cm) : une pluie de pétales doit se voir, comme dans un anime.
      size: 0.05 + r() * 0.03,
      tint: Math.floor(r() * 4),
      phase: r() * 100,
      age: 0,
      fade: 1,
    });
  }
}
