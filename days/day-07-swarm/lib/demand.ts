import { CONFIG } from './config';
import { Network } from './network';

/** Générateur pseudo-aléatoire à graine (mulberry32) : une même graine rejoue la même journée. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Valeur d'une courbe horaire à une minute de la journée. `curve[h]` vaut pour le milieu de l'heure h (h:30),
 * entre deux milieux on interpole : la demande monte en pente douce, sans marche d'escalier à chaque heure pile.
 */
export function hourly(curve: readonly number[], minute: number): number {
  const t = (((minute / 60 - 0.5) % 24) + 24) % 24;
  const h0 = Math.floor(t);
  const f = t - h0;
  return curve[h0] * (1 - f) + curve[(h0 + 1) % 24] * f;
}

/**
 * La demande : combien de voyageurs partent de chaque station, et où ils vont. Le poids d'une station combine
 * son type (domicile, fac, centre…) et l'offre réelle des lignes qui la desservent (rames en ligne à 8 h par
 * station desservie) : là où la TaM met beaucoup de rames, c'est qu'il y a du monde.
 */
export class Demand {
  readonly weight: Float64Array;
  private readonly cdf: Float64Array;
  private cdfMinute = -1;
  private cdfVersion = -1;

  constructor(private readonly net: Network) {
    const density = new Map(net.lines.map((l) => [l.id, Math.max(...l.fleet) / l.stations.length]));
    const raw = net.stations.map(
      (s) => CONFIG.kindWeight[s.kind] * s.lines.reduce((sum, id) => sum + density.get(id)!, 0),
    );
    const mean = raw.reduce((s, w) => s + w, 0) / raw.length;
    this.weight = Float64Array.from(raw, (w) => w / mean);
    this.cdf = new Float64Array(net.stations.length);
  }

  /** Départs par minute (en points) d'une station, hors événements. */
  emission(station: number, minute: number): number {
    const kind = this.net.stations[station].kind;
    return CONFIG.riders.rate * this.weight[station] * hourly(CONFIG.emission[kind], minute);
  }

  /** Attractivité d'une station comme destination (sans unité). */
  attraction(station: number, minute: number): number {
    const kind = this.net.stations[station].kind;
    return this.weight[station] * hourly(CONFIG.attraction[kind], minute);
  }

  /**
   * Tire une destination au hasard, proportionnellement à l'attractivité (multipliée par `boost`, celui des
   * événements). La table cumulée est recalculée une fois par minute, ou quand `version` change.
   */
  pick(
    origin: number,
    minute: number,
    rng: () => number,
    boost: Float64Array,
    version = 0,
  ): number {
    const m = Math.floor(minute);
    if (m !== this.cdfMinute || version !== this.cdfVersion) {
      let sum = 0;
      for (let s = 0; s < this.cdf.length; s++) {
        sum += this.attraction(s, m) * boost[s];
        this.cdf[s] = sum;
      }
      this.cdfMinute = m;
      this.cdfVersion = version;
    }
    const total = this.cdf[this.cdf.length - 1];
    for (let tries = 0; tries < 8; tries++) {
      const r = rng() * total;
      let lo = 0;
      let hi = this.cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.cdf[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      if (lo !== origin) return lo;
    }
    return (origin + 1) % this.cdf.length;
  }
}
