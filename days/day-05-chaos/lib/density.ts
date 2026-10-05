import { CONFIG } from './config';
import { clamp, clamp01, easeOutCubic, lerp, smoothstep } from './math';

export type Outcome = 'stable' | 'inert' | 'unstable';

/** Forme d'un épisode, figée au contact. */
export interface EpisodeShape {
  outcome: 'stable' | 'unstable';
  /** Profondeur du clearing sous le niveau de départ. */
  depth: number;
  /** Durée du palier (s). */
  hold: number;
  /** Décalage final, intégré au niveau en fin d'épisode (négatif si stable). */
  final: number;
}

const E = CONFIG.episode;

export function episodeDuration(s: EpisodeShape): number {
  return E.descend + s.hold + (s.outcome === 'unstable' ? E.surge : E.settle);
}

/** Temps après la fin du palier, ou une valeur ≤ 0 avant. */
function after(s: EpisodeShape, t: number): number {
  return t - E.descend - s.hold;
}

/** Décalage de density à l'instant `t` de l'épisode : continu de bout en bout. */
export function episodeOffset(s: EpisodeShape, t: number): number {
  if (t <= 0) return 0;
  if (t < E.descend) return -s.depth * easeOutCubic(t / E.descend);
  const u = after(s, t);
  if (u <= 0) return -s.depth;
  if (s.outcome === 'unstable') {
    return u >= E.surge ? s.final : lerp(-s.depth, s.final, (u / E.surge) ** E.surgeExponent);
  }
  return u >= E.settle ? s.final : lerp(-s.depth, s.final, smoothstep(0, 1, u / E.settle));
}

/** Enveloppe du clearing (0 → 1 → 0) à l'instant `t` de l'épisode. */
export function episodeClearing(s: EpisodeShape, t: number): number {
  if (t <= 0) return 0;
  if (t < E.descend) return easeOutCubic(t / E.descend);
  const u = after(s, t);
  if (u <= 0) return 1;
  if (s.outcome === 'unstable') return u >= E.surge ? 0 : 1 - (u / E.surge) ** E.surgeExponent;
  return u >= E.settle ? 0 : 1 - smoothstep(0, 1, u / E.settle);
}

/** L'audio lit la courbe en avance à partir du palier (le palier dure plus que l'avance : pas de saut). */
export function audioTime(t: number): number {
  return t < E.descend ? t : t + E.audioLead;
}

/** Forme du n-ième épisode (n = nombre d'épisodes déjà passés). */
export function shapeFor(outcome: 'stable' | 'unstable', n: number, hold: number): EpisodeShape {
  const D = CONFIG.density;
  const depth = Math.max(D.clearingDepthMin, D.clearingDepth * D.attenuation ** n);
  const final =
    outcome === 'stable'
      ? -D.stableDrop * D.attenuation ** n
      : D.unstableRise * D.amplification ** n;
  return { outcome, depth, hold, final };
}

/** Variation moyenne du niveau par glow coherent atteint, au n-ième épisode. */
export function expectedShift(n: number): number {
  const D = CONFIG.density;
  const O = CONFIG.outcomes;
  const unstable = 1 - O.stable - O.inert;
  return (
    O.stable * -D.stableDrop * D.attenuation ** n +
    O.inert * D.inertCost +
    unstable * D.unstableRise * D.amplification ** n
  );
}

/**
 * La variable qui pilote tout. Un niveau qui monte avec le temps et les ajouts (toujours lissés), plus
 * le décalage d'un éventuel épisode, fonction pure de son propre temps.
 */
export class DensityField {
  level = 0;
  rateFactor = 1;
  episodes = 0;
  frozen = false;

  /** Valeurs lues par le reste : visuel, audio (en avance), enveloppes de clearing. */
  value = 0;
  audio = 0;
  clearing = 0;
  clearingAudio = 0;

  private pending = 0;
  private shape: EpisodeShape | null = null;
  private t = 0;

  get episode(): EpisodeShape | null {
    return this.shape;
  }

  get episodeTime(): number {
    return this.t;
  }

  /** Phase de l'épisode en cours, pour le HUD. */
  get phase(): 'descend' | 'hold' | 'resolve' | null {
    if (!this.shape) return null;
    if (this.t < E.descend) return 'descend';
    return after(this.shape, this.t) <= 0 ? 'hold' : 'resolve';
  }

  update(dt: number, running: boolean): void {
    if (!this.frozen) {
      if (this.shape) {
        this.t += dt;
        if (this.t >= episodeDuration(this.shape)) this.finish();
      } else if (running) {
        this.level += CONFIG.density.rate * this.rateFactor * dt;
      }
      const released = this.pending * (1 - Math.exp(-dt / CONFIG.density.smoothing));
      this.pending -= released;
      this.level = clamp(this.level + released, 0, 1);
    }
    this.refresh();
  }

  /** Ajout lissé (jamais d'un coup). */
  add(amount: number): void {
    this.pending += amount;
  }

  begin(outcome: 'stable' | 'unstable', hold: number): void {
    if (this.shape) this.finish();
    this.shape = shapeFor(outcome, this.episodes, hold);
    this.episodes++;
    this.t = 0;
  }

  /** Debug : impose un niveau, annule l'épisode et les ajouts en attente. */
  force(level: number): void {
    this.level = clamp01(level);
    this.pending = 0;
    this.shape = null;
    this.refresh();
  }

  private finish(): void {
    const s = this.shape!;
    this.level = clamp(this.level + s.final, 0, 1);
    if (s.outcome === 'unstable') {
      this.rateFactor = Math.min(CONFIG.density.rateMax, this.rateFactor * CONFIG.density.rateGain);
    }
    this.shape = null;
    this.t = 0;
  }

  private refresh(): void {
    const s = this.shape;
    if (!s) {
      this.value = this.audio = this.level;
      this.clearing = this.clearingAudio = 0;
      return;
    }
    const ta = audioTime(this.t);
    this.value = clamp01(this.level + episodeOffset(s, this.t));
    this.audio = clamp01(this.level + episodeOffset(s, ta));
    this.clearing = episodeClearing(s, this.t);
    this.clearingAudio = episodeClearing(s, ta);
  }
}
