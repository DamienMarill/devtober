import { LogisticNoise, SineNoise } from './noise';
import type { Params } from './params';

/**
 * Le body : inertie, input lissé (viscosity), drag exponentiel et vitesse max. Le current pousse
 * perpendiculairement à la direction d'entrée, proportionnellement à la vitesse ; son signe et son
 * intensité suivent une suite logistique, son orientation un bruit lisse.
 */
export class Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Input lissé, tel que le body le ressent. */
  ix = 0;
  iy = 0;

  private t = 0;
  private readonly sign: LogisticNoise;
  private readonly angle: SineNoise;
  private readonly restX: SineNoise;
  private readonly restY: SineNoise;

  constructor(random: () => number) {
    this.sign = new LogisticNoise(random());
    this.angle = new SineNoise(random);
    this.restX = new SineNoise(random);
    this.restY = new SineNoise(random);
  }

  step(dt: number, inputX: number, inputY: number, p: Params): void {
    this.t += dt;
    const k = 1 - Math.exp(-dt / p.viscosity);
    this.ix += (inputX - this.ix) * k;
    this.iy += (inputY - this.iy) * k;

    this.vx += this.ix * p.thrust * dt;
    this.vy += this.iy * p.thrust * dt;

    this.sign.step(dt, p.currentRate);
    const effort = Math.hypot(this.ix, this.iy);
    if (effort > 1e-3 && p.currentGain > 0) {
      // Perpendiculaire à l'entrée, tournée d'un angle qui s'élargit avec density.
      const a = this.angle.at(this.t * p.currentRate * 0.7 + 100) * p.currentSpread;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = -this.iy / effort;
      const py = this.ix / effort;
      const speed = Math.hypot(this.vx, this.vy);
      const force = p.currentGain * this.sign.signed * speed;
      this.vx += (px * ca - py * sa) * force * dt;
      this.vy += (px * sa + py * ca) * force * dt;
    }
    if (p.residual > 0) {
      this.vx += this.restX.at(this.t * 0.31) * p.residual * dt;
      this.vy += this.restY.at(this.t * 0.27) * p.residual * dt;
    }

    const damp = Math.exp(-p.drag * dt);
    this.vx *= damp;
    this.vy *= damp;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > p.maxSpeed) {
      // Plafond souple : l'excès se résorbe en quelques centièmes de seconde au lieu d'être coupé net.
      const target = p.maxSpeed / speed;
      const f = target + (1 - target) * Math.exp(-dt / 0.06);
      this.vx *= f;
      this.vy *= f;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Signe et intensité du current (−1..1), pour le HUD. */
  get current(): number {
    return this.sign.signed;
  }
}
