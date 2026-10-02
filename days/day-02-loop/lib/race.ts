/**
 * Simulation de la course, sans rien de visuel : deux voitures sur un circuit d'une longueur donnée,
 * chaque pression sur la touche d'un joueur donne une impulsion à sa voiture, qui ralentit d'elle-même
 * (traînée). On compte les tours et on chronomètre chacun. Les temps sont en secondes.
 */

export const LAPS = 3;
/** Vitesse gagnée à chaque pression (unités de circuit par seconde). */
export const IMPULSE = 76;
/** Part de la vitesse perdue par seconde (décroissance exponentielle). */
export const DRAG = 2.2;
/** Vitesse plafond, pour qu'un auto-clicker ne finisse pas la course en trois secondes. */
export const MAX_SPEED = 340;
/** Durée du décompte avant le départ : trois feux rouges, un par seconde, puis le vert. */
export const COUNTDOWN = 3;

export type Phase = 'idle' | 'countdown' | 'racing' | 'finished';

export interface Player {
  /** Distance parcourue depuis le départ, tours compris (ne revient jamais en arrière). */
  distance: number;
  speed: number;
  /** Tours bouclés. */
  laps: number;
  /** Temps de course au début du tour en cours. */
  lapStart: number;
  /** Durée de chaque tour bouclé. */
  lapTimes: number[];
  /** Temps de course à l'arrivée, une fois les `LAPS` tours bouclés. */
  finishedAt: number | null;
}

const newPlayer = (): Player => ({
  distance: 0,
  speed: 0,
  laps: 0,
  lapStart: 0,
  lapTimes: [],
  finishedAt: null,
});

export class Race {
  phase: Phase = 'idle';
  /** Temps de course écoulé depuis le feu vert. */
  elapsed = 0;
  /** Temps restant du décompte (pendant `countdown`). */
  countdown = 0;
  readonly players: [Player, Player] = [newPlayer(), newPlayer()];
  /** Index du vainqueur, une fois la course finie. */
  winner: number | null = null;

  constructor(readonly trackLength: number) {}

  /** Lance le décompte ; les voitures repartent de la ligne. */
  start(): void {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.winner = null;
    this.players[0] = newPlayer();
    this.players[1] = newPlayer();
  }

  reset(): void {
    this.start();
    this.phase = 'idle';
    this.countdown = 0;
  }

  /** Nombre de feux allumés pendant le décompte (0 à 3), pour l'affichage. */
  get lights(): number {
    return this.phase === 'countdown' ? Math.min(3, COUNTDOWN - Math.ceil(this.countdown) + 1) : 0;
  }

  /** Une pression sur la touche du joueur : sa voiture accélère. Ignorée hors course. */
  press(player: 0 | 1): boolean {
    if (this.phase !== 'racing') return false;
    const p = this.players[player];
    if (p.finishedAt !== null) return false;
    p.speed = Math.min(MAX_SPEED, p.speed + IMPULSE);
    return true;
  }

  /** Avance la simulation de `dt` secondes. */
  update(dt: number): void {
    if (this.phase === 'idle') return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown > 0) return;
      // Feu vert au milieu de l'image : le reste du pas de temps est déjà de la course.
      dt = -this.countdown;
      this.countdown = 0;
      this.phase = 'racing';
    }

    if (this.phase === 'racing') this.elapsed += dt;

    const decay = Math.exp(-DRAG * dt);
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      // Pas de freinage total : on laisse la voiture finir sa glissade, mais sans traîner sous 1 unité/s.
      p.speed *= decay;
      if (p.speed < 1) p.speed = 0;
      if (p.speed === 0) continue;
      p.distance += p.speed * dt;

      if (this.phase !== 'racing' || p.finishedAt !== null) continue;
      const laps = Math.floor(p.distance / this.trackLength);
      while (p.laps < laps && p.finishedAt === null) {
        // Instant exact du passage de la ligne, pour ne pas dépendre de la cadence des images.
        const overshoot = p.distance - (p.laps + 1) * this.trackLength;
        const crossedAt = this.elapsed - overshoot / p.speed;
        p.lapTimes.push(crossedAt - p.lapStart);
        p.lapStart = crossedAt;
        p.laps++;
        if (p.laps >= LAPS) {
          p.finishedAt = crossedAt;
          this.phase = 'finished';
          this.winner = i;
        }
      }
    }
  }

  /** Durée du tour en cours pour un joueur (0 une fois arrivé). */
  currentLap(player: 0 | 1): number {
    const p = this.players[player];
    if (this.phase === 'idle' || this.phase === 'countdown' || p.finishedAt !== null) return 0;
    return this.elapsed - p.lapStart;
  }

  bestLap(player: 0 | 1): number | null {
    const times = this.players[player].lapTimes;
    return times.length ? Math.min(...times) : null;
  }
}

/** `m:ss.cc` ; `0:00.00` pour 0. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const c = Math.floor((total * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
