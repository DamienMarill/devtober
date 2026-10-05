/**
 * Somme de trois sinus aux fréquences sans rapport rationnel (1, φ, e) : un signal lisse dans [-1, 1]
 * qui ne repasse jamais par le même motif. Les phases viennent d'une graine.
 */
export class SineNoise {
  private readonly p0: number;
  private readonly p1: number;
  private readonly p2: number;

  constructor(random: () => number) {
    this.p0 = random() * Math.PI * 2;
    this.p1 = random() * Math.PI * 2;
    this.p2 = random() * Math.PI * 2;
  }

  at(t: number): number {
    return (
      Math.sin(t + this.p0) * 0.5 +
      Math.sin(t * 1.618034 + this.p1) * 0.3 +
      Math.sin(t * 2.718282 + this.p2) * 0.2
    );
  }
}

/**
 * Application logistique `x ← r·x·(1 − x)` itérée à fréquence variable, avec une interpolation cosinus
 * entre deux itérés : le signal est continu, mais sa suite est chaotique (deux graines voisines
 * divergent en quelques itérations). Avec r = 3,9, x reste dans [r(4 − r)/16, r/4] ≈ [0,095 ; 0,975] et
 * passe beaucoup de temps près des bords : des bouffées plutôt qu'une oscillation régulière.
 */
export class LogisticNoise {
  private prev: number;
  private next: number;
  private phase = 0;
  private readonly low: number;
  private readonly high: number;

  constructor(
    seed01: number,
    private readonly r = 3.9,
  ) {
    this.prev = 0.1 + seed01 * 0.8;
    this.next = this.iterate(this.prev);
    this.low = (r * (4 - r)) / 16;
    this.high = r / 4;
  }

  /** Avance de `dt` secondes à `rate` itérations par seconde. */
  step(dt: number, rate: number): void {
    this.phase += dt * rate;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.prev = this.next;
      this.next = this.iterate(this.next);
    }
  }

  /** Valeur courante dans [0, 1]. */
  get value(): number {
    const t = (1 - Math.cos(Math.PI * this.phase)) / 2;
    const x = this.prev + (this.next - this.prev) * t;
    const v = (x - this.low) / (this.high - this.low);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /** Valeur courante dans [-1, 1]. */
  get signed(): number {
    return this.value * 2 - 1;
  }

  private iterate(x: number): number {
    const y = this.r * x * (1 - x);
    // Garde-fou numérique : on ne laisse jamais la suite s'écraser sur un point fixe.
    return y < 1e-4 || y > 1 - 1e-4 ? 0.5 + (x - 0.5) * 0.37 : y;
  }
}
