import { OnsetDetector, risenShare, type OnsetOptions } from './onset-detector';

/** Une « famille d'instruments » : une bande de fréquences. */
export interface Band {
  name: string;
  loHz: number;
  hiHz: number;
}

export const BANDS: readonly Band[] = [
  { name: 'grave', loHz: 30, hiHz: 150 }, // grosse caisse, basse
  { name: 'bas-médium', loHz: 150, hiHz: 800 }, // corps des guitares, toms, voix grave
  { name: 'médium', loHz: 800, hiHz: 3000 }, // voix, guitares, claviers
  { name: 'aigu', loHz: 3000, hiHz: 10_000 }, // cymbales, brillance, souffle
];

/** Une attaque dans une bande, à une position stéréo. */
export interface BandBurst {
  /** Index dans `BANDS`. */
  band: number;
  /** -1 (tout à gauche) … 1 (tout à droite). */
  pan: number;
  /** 0..1, la force de l'attaque. */
  strength: number;
}

export const BAND_ONSET_OPTIONS: OnsetOptions = {
  minEnergy: 0.6,
  minRise: 0.35,
  avgMs: 400,
  refractoryMs: 200,
  decayMs: 50,
};

/**
 * Écart de niveau (dB) entre les deux canaux pour considérer un son « tout à gauche » ou « tout à droite ».
 * Les mixes sont le plus souvent centrés : une valeur basse répartit mieux les attaques sur l'écran.
 */
const FULL_PAN_DB = 4;
/** Échelle des octets d'un AnalyserNode réglé de −90 à −10 dB. */
const DB_PER_BYTE = 80 / 255;

/** Niveau moyen d'une bande, en octets (0..255) : sert à comparer gauche et droite. */
function meanBytes(bins: ArrayLike<number>, sampleRate: number, fftSize: number, loHz: number, hiHz: number): number {
  const hz = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(loHz / hz));
  const hi = Math.min(bins.length - 1, Math.floor(hiHz / hz));
  if (hi < lo) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += bins[i];
  return sum / (hi - lo + 1);
}

/**
 * Repère les attaques dans chaque bande, sur la moyenne des deux canaux, et
 * donne leur position stéréo d'après l'écart de niveau gauche/droite de la bande.
 */
export class BandOnsets {
  private readonly detectors: OnsetDetector[];
  private previous?: Uint8Array;
  private readonly mix: Uint8Array;

  constructor(binCount = 512, options: OnsetOptions = BAND_ONSET_OPTIONS, private readonly fullPanDb = FULL_PAN_DB) {
    this.mix = new Uint8Array(binCount);
    this.detectors = BANDS.map(() => new OnsetDetector(options));
  }

  next(left: Uint8Array, right: Uint8Array, sampleRate: number, fftSize: number, dtMs: number): BandBurst[] {
    for (let i = 0; i < this.mix.length; i++) this.mix[i] = (left[i] + right[i]) >> 1;
    const bursts: BandBurst[] = [];
    if (this.previous) {
      BANDS.forEach((band, index) => {
        const share = risenShare(this.previous!, this.mix, sampleRate, fftSize, band.loHz, band.hiHz);
        const flash = this.detectors[index].next(share, dtMs);
        if (!this.detectors[index].triggered) return;
        const diffDb =
          (meanBytes(right, sampleRate, fftSize, band.loHz, band.hiHz) -
            meanBytes(left, sampleRate, fftSize, band.loHz, band.hiHz)) *
          DB_PER_BYTE;
        bursts.push({ band: index, pan: Math.max(-1, Math.min(1, diffDb / this.fullPanDb)), strength: flash });
      });
    }
    (this.previous ??= new Uint8Array(this.mix.length)).set(this.mix);
    return bursts;
  }

  reset(): void {
    this.detectors.forEach((d) => d.reset());
    this.previous = undefined;
  }
}
