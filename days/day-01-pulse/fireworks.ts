/** Une gerbe : un point d'explosion et ses réglages, en pixels CSS. */
export interface BurstSpec {
  x: number;
  y: number;
  color: string;
  /** Rayon visé de la gerbe (px). */
  radius: number;
  count: number;
  /** Durée de vie moyenne des particules (s). */
  life: number;
  /** Taille des particules (px). */
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  /** Phase du scintillement. */
  twinkle: number;
}

/** Éclat bref au point d'explosion. */
export interface Flash {
  x: number;
  y: number;
  radius: number;
  age: number;
  color: string;
}

const MAX_PARTICLES = 2500;
const FLASH_S = 0.18;
/**
 * Frottement (1/s) : la distance parcourue vaut v0 / DRAG, d'où v0 = rayon × DRAG. Plus il est élevé,
 * plus l'explosion est vive pour la même portée (90 % du rayon atteint en ≈ 2,3 / DRAG secondes).
 */
const DRAG = 4.5;
const GRAVITY = 70;

/**
 * Explosions seules, sans fusée : des particules lancées en étoile, freinées
 * par l'air, qui retombent et s'éteignent. Logique pure : le dessin est à part
 * (`drawFireworks`), ce qui permet de la tester sans canvas.
 */
export class FireworksSystem {
  readonly particles: Particle[] = [];
  readonly flashes: Flash[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  burst(spec: BurstSpec): void {
    this.flashes.push({ x: spec.x, y: spec.y, radius: spec.radius * 0.5, age: 0, color: spec.color });
    const room = MAX_PARTICLES - this.particles.length;
    const count = Math.min(spec.count, Math.max(0, room));
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      // Distribution en racine : les particules remplissent le disque au lieu de s'amasser au centre.
      const speed = spec.radius * DRAG * (0.25 + 0.75 * Math.sqrt(this.random()));
      this.particles.push({
        x: spec.x,
        y: spec.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: spec.life * (0.7 + 0.6 * this.random()),
        size: spec.size * (0.6 + 0.8 * this.random()),
        color: spec.color,
        twinkle: this.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-DRAG * dt);
    for (const p of this.particles) {
      p.age += dt;
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].age >= this.particles[i].life) this.particles.splice(i, 1);
    }
    for (const f of this.flashes) f.age += dt;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if (this.flashes[i].age >= FLASH_S) this.flashes.splice(i, 1);
    }
  }

  get active(): boolean {
    return this.particles.length > 0 || this.flashes.length > 0;
  }

  clear(): void {
    this.particles.length = 0;
    this.flashes.length = 0;
  }
}

/** Dessine l'état du système en mode additif : les gerbes qui se croisent s'éclairent. */
export function drawFireworks(ctx: CanvasRenderingContext2D, system: FireworksSystem, dpr: number): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.globalCompositeOperation = 'lighter';

  for (const f of system.flashes) {
    const t = f.age / FLASH_S;
    const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
    gradient.addColorStop(0, f.color);
    gradient.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.5 * (1 - t) * (1 - t);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of system.particles) {
    const t = p.age / p.life;
    // Plein feu puis extinction ; en fin de vie, la particule scintille.
    const fade = (1 - t) * (1 - t);
    const sparkle = t > 0.6 ? 0.55 + 0.45 * Math.sin(p.age * 38 + p.twinkle) : 1;
    const alpha = Math.max(0, fade * sparkle);
    const size = p.size * (1 - 0.5 * t);
    ctx.fillStyle = p.color;
    // Halo large et diffus, puis cœur net : sans halo, les particules ne sont que des points.
    ctx.globalAlpha = alpha * 0.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
