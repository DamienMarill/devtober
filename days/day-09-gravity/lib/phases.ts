import { CONFIG, DEG } from './config';
import { Flight } from './flight';

/**
 * La lecture du vol telle que l'annonce l'équipage : « Pull up » quand la ressource commence, « Injection »
 * quand l'apesanteur arrive, « Pull out » quand on sort du piqué. On compte aussi les paraboles et le temps
 * passé vraiment en apesanteur (|n| sous 0,05 g), que l'avion soit piloté à la main ou par l'automatique.
 */

export type Phase = 'cruise' | 'pullup' | 'zerog' | 'pullout';
export type Callout = 'pull-up' | 'injection' | 'pull-out' | 'parabola';

const S = CONFIG.phases;

export class PhaseWatch {
  phase: Phase = 'cruise';
  /** Paraboles terminées. */
  parabolas = 0;
  /** Apesanteur de la parabole en cours, de la dernière, et le record. */
  zero = 0;
  last = 0;
  best = 0;
  /** Les annonces à afficher (vidées par le composant). */
  readonly callouts: Callout[] = [];
  private calm = 0;

  update(f: Flight, dt: number): void {
    const n = f.nz;
    const floating = Math.abs(n) < S.zero && Math.abs(f.nx) < S.zero;
    switch (this.phase) {
      case 'cruise':
        if (n > S.hyper && f.theta > 4 * DEG) this.enter('pullup', 'pull-up');
        break;
      case 'pullup':
        if (n < S.injection) {
          this.zero = 0;
          this.enter('zerog', 'injection');
        } else if (f.theta < 2 * DEG && n < 1.2) this.phase = 'cruise';
        break;
      case 'zerog':
        if (floating) this.zero += dt;
        if (n > S.hyper) this.enter('pullout', 'pull-out');
        break;
      case 'pullout':
        if (n < 1.25 && f.gamma > -6 * DEG) this.finish();
        else if (n < S.injection) this.phase = 'zerog';
        break;
    }
    // Filet de sécurité : un vol calme et à plat pendant 3 s clôt la parabole, quoi qu'il se soit passé.
    this.calm = Math.abs(n - 1) < 0.15 && Math.abs(f.theta) < 8 * DEG ? this.calm + dt : 0;
    if (this.phase !== 'cruise' && this.calm > 3) {
      if (this.phase === 'zerog' || this.phase === 'pullout') this.finish();
      else this.phase = 'cruise';
    }
  }

  private enter(phase: Phase, callout: Callout): void {
    this.phase = phase;
    this.callouts.push(callout);
  }

  private finish(): void {
    this.phase = 'cruise';
    this.parabolas++;
    this.last = this.zero;
    this.best = Math.max(this.best, this.zero);
    this.callouts.push('parabola');
  }
}
