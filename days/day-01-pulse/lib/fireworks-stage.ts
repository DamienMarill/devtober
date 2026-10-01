import type { BandBurst } from './band-onsets';
import { BurstSpec, FireworksSystem, drawFireworks } from './fireworks';

/**
 * Allure d'une gerbe selon sa bande (même ordre que `BANDS`) : les graves font
 * de grosses gerbes lentes, les aigus de petites gerbes vives qui scintillent.
 * `radius` est une fraction de la plus petite dimension de l'écran.
 */
export const BAND_LOOKS = [
  { radius: 0.28, count: 110, life: 1.6, size: 3.4 }, // grave
  { radius: 0.22, count: 120, life: 1.4, size: 2.8 }, // bas-médium
  { radius: 0.17, count: 130, life: 1.2, size: 2.4 }, // médium
  { radius: 0.11, count: 150, life: 0.9, size: 1.9 }, // aigu
] as const;

/** Zone verticale où explosent les gerbes (fraction de la hauteur) : ni collées au haut, ni aux contrôles du bas. */
const Y_MIN = 0.12;
const Y_RANGE = 0.58;
/** Part de la largeur que couvre la position stéréo (0,45 → de 5 % à 95 %). */
const X_SPREAD = 0.45;
/** Pas moins de 110 ms entre deux gerbes : ~9 par seconde au maximum, sinon l'écran n'est plus qu'une tache. */
const MIN_GAP_MS = 110;

/**
 * Transforme une attaque de bande en gerbe : X selon la position stéréo, Y
 * aléatoire, couleur aléatoire parmi celles du thème, taille selon la bande.
 */
export function burstSpec(
  burst: BandBurst,
  width: number,
  height: number,
  colors: readonly string[],
  random: () => number = Math.random,
): BurstSpec {
  const look = BAND_LOOKS[Math.min(burst.band, BAND_LOOKS.length - 1)];
  const scale = 0.7 + 0.3 * burst.strength;
  const jitter = (random() - 0.5) * 0.08; // évite d'empiler les gerbes d'un même instrument au pixel près
  const x = Math.min(0.96, Math.max(0.04, 0.5 + X_SPREAD * burst.pan + jitter));
  return {
    x: x * width,
    y: (Y_MIN + random() * Y_RANGE) * height,
    color: colors.length ? colors[Math.floor(random() * colors.length)] : '#ffffff',
    radius: look.radius * Math.min(width, height) * scale,
    count: Math.round(look.count * scale),
    life: look.life,
    size: look.size,
  };
}

/** Un canvas plein cadre qui dessine les gerbes ; la boucle ne tourne que tant qu'il reste des particules. */
export class FireworksStage {
  private readonly system = new FireworksSystem();
  private readonly ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private frame = 0;
  private last = 0;
  private lastBurst = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  get width(): number {
    return this.canvas.width / this.dpr;
  }

  get height(): number {
    return this.canvas.height / this.dpr;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  /** Lance une gerbe (ignorée si la précédente est trop proche). */
  burst(spec: BurstSpec, now = performance.now()): void {
    if (now - this.lastBurst < MIN_GAP_MS) return;
    this.lastBurst = now;
    this.system.burst(spec);
    this.start();
  }

  /** Pas de simulation + dessin, exposé pour pouvoir avancer à la main (tests, captures). */
  step(dt: number): void {
    this.system.update(dt);
    if (this.ctx) drawFireworks(this.ctx, this.system, this.dpr);
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.system.clear();
  }

  private start(): void {
    if (this.frame) return;
    this.last = 0;
    const tick = (now: number) => {
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
      this.last = now;
      this.step(dt);
      this.frame = this.system.active ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }
}
