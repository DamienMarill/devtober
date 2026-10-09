import { density } from './atmosphere';
import { CONFIG, DEG, G0 } from './config';
import { Flight, gravity } from './flight';

/**
 * Le pilote automatique vole la parabole des manuels : palier, ressource à 1,8 g jusqu'à 45° d'assiette,
 * injection vers 47° (la portance tombe à zéro), apesanteur jusqu'à −42°, ressource de sortie à 1,8 g,
 * retour au palier, pause, et on recommence.
 *
 * Il ne triche pas : il ne touche qu'au manche, comme le pilote humain. Pour viser un facteur de charge, il
 * calcule l'incidence qui le donne à la vitesse du moment, et corrige l'écart restant (intégrale).
 */

export type ApPhase = 'level' | 'pullup' | 'injection' | 'zerog' | 'pullout' | 'recover';

const P = CONFIG.profile;

export class Autopilot {
  phase: ApPhase = 'level';
  /** Secondes passées dans la phase. */
  timer = 0;
  /** Facteur de charge visé (pour l'affichage). */
  target = 1;
  /** `false` : il ramène l'avion au palier puis s'arrête (le pilote de sécurité). */
  loop = true;
  private integ = 0;
  private from = 1;
  private settled = 0;

  constructor(phase: ApPhase = 'level') {
    this.go(phase, 1);
  }

  /** Commence par une ressource tout de suite (la démo n'attend pas la fin de la pause). */
  startParabola(f: Flight): void {
    this.go('pullup', f.nz);
  }

  /** L'avion vole presque à plat, à une vitesse raisonnable, depuis une seconde : on peut rendre la main. */
  get done(): boolean {
    return !this.loop && this.phase === 'level' && this.settled > 1;
  }

  /** Revenir au palier sans brusquer : une vitesse verticale bornée vers l'altitude de croisière. */
  private levelLoad(f: Flight): number {
    const vsWanted = Math.max(-22, Math.min(22, (CONFIG.cruise.altitude - f.h) * 0.06));
    return Math.max(0.55, Math.min(1.5, Math.cos(f.gamma) + (vsWanted - f.vs) * 0.035));
  }

  private go(phase: ApPhase, from: number): void {
    this.phase = phase;
    this.timer = 0;
    this.from = from;
    // La correction apprise pendant une phase ne vaut pas pour la suivante (autre vitesse, autre cible).
    this.integ = 0;
  }

  /** Une rampe douce de `from` à `to` en `dur` secondes. */
  private ramp(to: number, dur: number): number {
    const t = Math.min(1, this.timer / dur);
    const s = t * t * (3 - 2 * t);
    return this.from + (to - this.from) * s;
  }

  update(f: Flight, dt: number): void {
    this.timer += dt;
    const C = CONFIG.cruise;
    let n = 1;
    switch (this.phase) {
      case 'recover': {
        // Sortir d'abord d'une situation franche : redresser un piqué à 2,3 g, ou rendre la main sur un
        // cabré trop fort (presque en apesanteur, le nez retombe tout seul).
        const g = f.gamma / DEG;
        if (g < -4) n = this.ramp(2.3, 1.5);
        else if (g > 12) n = this.ramp(0.35, 1.5);
        else {
          n = this.levelLoad(f);
          if (this.timer > 1.5) this.go('level', n);
        }
        if ((g < -4 || g > 12) && this.timer > 1.5) this.from = n;
        break;
      }
      case 'level': {
        n = this.levelLoad(f);
        // « Calme » suffit pour rendre la main ; pour lancer la parabole suivante, il faut le vrai palier.
        const calm =
          f.V > 150 && f.V < 245 && Math.abs(f.gamma) < 8 * DEG && Math.abs(f.nz - 1) < 0.25;
        const steady = calm && Math.abs(f.V - C.speed) < 6 && Math.abs(f.h - C.altitude) < 120;
        this.settled = calm ? this.settled + dt : 0;
        if (this.loop && this.timer > P.pause && steady) this.go('pullup', n);
        break;
      }
      case 'pullup':
        n = this.ramp(P.pullUpG, 3.5);
        // L'injection se lance un peu avant l'angle visé : la trajectoire continue de se cabrer pendant
        // qu'on relâche, et la chute libre commence vers 47°.
        if (f.gamma >= P.injectAt) this.go('injection', f.nz);
        break;
      case 'injection':
        n = this.ramp(0, 2.2);
        if (this.timer >= 2.2) this.go('zerog', 0);
        break;
      case 'zerog':
        n = 0;
        if (f.theta <= P.pullOutAt) this.go('pullout', f.nz);
        break;
      case 'pullout':
        n = this.ramp(P.pullOutG, 2.5);
        if (f.gamma >= -2 * DEG) this.go('recover', f.nz);
        break;
    }
    this.target = n;

    // Incidence qui donne n (la poussée porte un peu, elle aussi), plus la correction de l'écart mesuré.
    const tLift = f.thrust * Math.sin(f.alpha);
    const alphaModel =
      CONFIG.aircraft.alpha0 +
      (n * G0 * CONFIG.aircraft.mass - tLift) / (f.q * CONFIG.aircraft.wingArea * f.clAlpha);
    const tight = this.phase === 'zerog' ? 0.15 : 0.02;
    this.integ = Math.max(-0.05, Math.min(0.05, this.integ + (n - f.nz) * tight * dt));
    const stick = f.stickForAlpha(alphaModel + this.integ);
    // Le manche bouge vite, mais pas instantanément.
    const rate = 2.5 * dt;
    f.stick = Math.max(-1, Math.min(1, f.stick + Math.max(-rate, Math.min(rate, stick - f.stick))));
  }
}

/**
 * Ce qui arriverait si le commandant prenait la main maintenant : il tire jusqu'à `recoveryG` (ou ce que
 * l'aile donne avant le décrochage), réacteurs au ralenti, et on intègre la trajectoire jusqu'à repasser à
 * l'horizontale. On retient l'altitude la plus basse et la vitesse la plus haute.
 */
export function recoveryOutlook(f: Flight): { hMin: number; vMax: number } {
  const A = CONFIG.aircraft;
  const E = CONFIG.envelope;
  let V = f.V;
  let gamma = f.gamma;
  let h = f.h;
  let n = f.nz;
  let hMin = h;
  let vMax = V;
  const dt = 0.05;
  for (let t = 0; t < 40 && (gamma < 0 || t < 0.5); t += dt) {
    const g = gravity(h);
    const q = 0.5 * density(h) * V * V;
    const nStall = (q * A.wingArea * f.clAlpha * (A.alphaStall - A.alpha0)) / (A.mass * g);
    // Le temps de réagir et de tirer : le facteur de charge rejoint la cible en une seconde et demie environ.
    n += (Math.min(E.recoveryG, nStall) - n) * Math.min(1, dt / 1.2);
    const cl = (n * A.mass * g) / (q * A.wingArea);
    const drag = q * A.wingArea * (A.cd0 + A.k * cl * cl);
    V = Math.max(30, V + (-g * Math.sin(gamma) - drag / A.mass) * dt);
    gamma += ((g * (n - Math.cos(gamma))) / V) * dt;
    h += V * Math.sin(gamma) * dt;
    hMin = Math.min(hMin, h);
    vMax = Math.max(vMax, V);
  }
  return { hMin, vMax };
}

/**
 * Le pilote de sécurité : il ne reprend la main qu'en dernier recours. Tant que sa propre ressource suffit
 * encore à rester au-dessus de 4 600 m et sous la vitesse maximale, on a le droit d'être en retard. Il
 * intervient aussi sur une assiette de voltige (un A310 ne fait pas de looping) ou une vitesse trop faible.
 */
export function needsRescue(f: Flight): boolean {
  const E = CONFIG.envelope;
  if (f.V < E.vMin || f.theta > E.pitchMax || f.theta < E.pitchMin) return true;
  if (f.gamma > -3 * DEG && f.V < E.vMax) return false;
  const { hMin, vMax } = recoveryOutlook(f);
  return hMin < E.hFloor || vMax > E.vMax;
}
