import { CONFIG } from './config';
import { lerp, smoothstep } from './math';

export interface Drifter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seuil de density au-delà duquel ce drifter s'estompe. */
  threshold: number;
  seed: number;
  alpha: number;
}

const D = CONFIG.drifters;

/**
 * Quelques formes au loin. Elles errent lentement ; quand le body approche, elles s'éloignent un peu
 * plus vite que sa vitesse max, sans à-coup (la vitesse rejoint sa cible avec un retard).
 */
export class DrifterField {
  readonly pool: Drifter[];
  private t = 0;

  constructor(private readonly random: () => number) {
    this.pool = Array.from({ length: D.count }, (_, i) => {
      const d: Drifter = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        threshold: lerp(D.thresholds[0], D.thresholds[1], i / Math.max(1, D.count - 1)),
        seed: random() * 100,
        alpha: 0,
      };
      this.place(d, 0, 0);
      return d;
    });
  }

  step(dt: number, bodyX: number, bodyY: number, maxSpeed: number, density: number): void {
    this.t += dt;
    for (const d of this.pool) {
      let dx = d.x - bodyX;
      let dy = d.y - bodyY;
      let dist = Math.hypot(dx, dy);
      if (dist > D.respawn) {
        this.place(d, bodyX, bodyY);
        dx = d.x - bodyX;
        dy = d.y - bodyY;
        dist = Math.hypot(dx, dy);
      }
      const away = smoothstep(D.repel, D.repel * 0.4, dist) * maxSpeed * D.speedShare;
      const s = this.t * 0.13 + d.seed;
      const inv = 1 / Math.max(dist, 1e-4);
      const tx = dx * inv * away + Math.sin(s) * D.wander;
      const ty = dy * inv * away + Math.cos(s * 0.83) * D.wander;
      const k = 1 - Math.exp(-dt / 0.8);
      d.vx += (tx - d.vx) * k;
      d.vy += (ty - d.vy) * k;
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      const presence = 1 - smoothstep(d.threshold - 0.08, d.threshold + 0.08, density);
      d.alpha += (presence - d.alpha) * (1 - Math.exp(-dt / 1.5));
    }
  }

  private place(d: Drifter, cx: number, cy: number): void {
    const a = this.random() * Math.PI * 2;
    const r = lerp(D.distance[0], D.distance[1], this.random());
    d.x = cx + Math.cos(a) * r;
    d.y = cy + Math.sin(a) * r;
    d.vx = d.vy = 0;
    d.alpha = 0;
  }
}
