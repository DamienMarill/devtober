/**
 * Énergie moyenne (0..1) des bins compris entre `loHz` et `hiHz`.
 * Les bornes sont arrondies vers l'intérieur : un bin n'est compté que s'il
 * tombe entièrement dans la bande.
 */
export function bandEnergy(
  bins: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  loHz: number,
  hiHz: number,
): number {
  const hzPerBin = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(loHz / hzPerBin));
  const hi = Math.min(bins.length - 1, Math.floor(hiHz / hzPerBin));
  if (hi < lo) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += bins[i];
  return sum / ((hi - lo + 1) * 255);
}

export interface OnsetOptions {
  /** Force minimale (0..1) pour parler d'une attaque marquée. */
  minEnergy: number;
  /** De combien la force doit dépasser son niveau récent pour être une attaque, et non un son tenu. */
  minRise: number;
  /** Constante de temps du niveau récent (ms). */
  avgMs: number;
  /** Délai minimal entre deux flashs (ms) : borne aussi la fréquence de clignotement. */
  refractoryMs: number;
  /** Constante de décroissance du flash (ms). */
  decayMs: number;
}

/** Grosse caisse : énergie des graves (0..1). */
export const KICK_OPTIONS: OnsetOptions = {
  minEnergy: 0.8,
  minRise: 0.2,
  avgMs: 400,
  refractoryMs: 200,
  decayMs: 70,
};

/** Percussions : force de l'attaque (voir `percussionStrength`). */
export const PERCUSSION_OPTIONS: OnsetOptions = {
  minEnergy: 0.6,
  minRise: 0.25,
  avgMs: 400,
  refractoryMs: 150,
  decayMs: 50,
};

/** Les percussions flashent moins fort que les grosses caisses : plus de relief, moins de clignotement. */
export const PERCUSSION_WEIGHT = 0.6;

/** En dessous de 150 Hz, c'est le domaine de la grosse caisse. Au-delà de 10 kHz, il n'y a plus rien d'utile. */
const PERCUSSION_LO_HZ = 150;
const PERCUSSION_SPLIT_HZ = 2000;
const PERCUSSION_HI_HZ = 10_000;
/** Hausse minimale d'un bin entre deux images pour compter (≈ 2 dB : l'échelle est de 255 pour 80 dB). */
const MIN_RISE_BYTES = 6;

/**
 * Part (0..1) des bins de [loHz, hiHz] qui montent d'au moins `minRiseBytes`
 * entre deux spectres successifs.
 */
export function risenShare(
  prev: ArrayLike<number>,
  cur: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  loHz: number,
  hiHz: number,
  minRiseBytes = MIN_RISE_BYTES,
): number {
  const hzPerBin = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(loHz / hzPerBin));
  const hi = Math.min(cur.length - 1, prev.length - 1, Math.floor(hiHz / hzPerBin));
  if (hi < lo) return 0;
  let risen = 0;
  for (let i = lo; i <= hi; i++) if (cur[i] - prev[i] >= minRiseBytes) risen++;
  return risen / (hi - lo + 1);
}

/**
 * Force d'une attaque percussive (0..1). Un son percussif (peu d'harmoniques,
 * peu de résonance) fait monter large : le bas-médium (le « corps » d'une caisse
 * claire, d'un tom) ET l'aigu (le claquement) en même temps. On prend le plus
 * faible des deux : une note de piano ou de guitare ne lève que ses harmoniques
 * médiums, un charley que l'aigu, et la grosse caisse est hors bande.
 */
export function percussionStrength(
  prev: ArrayLike<number>,
  cur: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): number {
  return Math.min(
    risenShare(prev, cur, sampleRate, fftSize, PERCUSSION_LO_HZ, PERCUSSION_SPLIT_HZ),
    risenShare(prev, cur, sampleRate, fftSize, PERCUSSION_SPLIT_HZ, PERCUSSION_HI_HZ),
  );
}

/**
 * Détecte une attaque : une force (énergie des graves, largeur d'attaque…)
 * à la fois élevée ET soudaine par rapport à son niveau récent. Un son tenu
 * (basse 808, nappe) fait monter ce niveau et ne déclenche donc rien ; seul un
 * pic bref au-dessus de lui allume le flash.
 */
export class OnsetDetector {
  private avg = 0;
  private flash = 0;
  private sinceTrigger = Infinity;
  private primed = false;

  constructor(private readonly opts: OnsetOptions = KICK_OPTIONS) {}

  /** Renvoie l'intensité du flash (0..1) après prise en compte de cette mesure. */
  next(energy: number, dtMs: number): number {
    const { minEnergy, minRise, avgMs, refractoryMs, decayMs } = this.opts;
    if (!this.primed) {
      this.avg = energy;
      this.primed = true;
    }
    this.sinceTrigger += dtMs;
    this.flash *= Math.exp(-dtMs / decayMs);

    const rise = energy - this.avg;
    if (energy >= minEnergy && rise >= minRise && this.sinceTrigger >= refractoryMs) {
      this.flash = Math.max(this.flash, Math.min(1, 0.5 + rise));
      this.sinceTrigger = 0;
    }
    // Le niveau récent se met à jour après la détection, sinon le coup s'annulerait lui-même.
    this.avg += (energy - this.avg) * (1 - Math.exp(-dtMs / avgMs));
    return this.flash;
  }

  reset(): void {
    this.primed = false;
    this.flash = 0;
    this.sinceTrigger = Infinity;
  }
}
