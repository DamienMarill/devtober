import { CONFIG } from './config';
import { Demand, mulberry32 } from './demand';
import { Network } from './network';
import { ScenarioEvent } from './scenario';

/** Un groupe de 10 voyageurs qui apparaît : le même, au même instant, chez le joueur et chez le fantôme. */
export interface Spawn {
  /** Numéro d'ordre (sert d'identifiant au voyageur dans les deux simulations). */
  seq: number;
  time: number;
  origin: number;
  dest: number;
  patience: number;
}

/** Une période où la demande est multipliée (épisode de pluie : tout le monde laisse le vélo au garage). */
export interface DemandWindow {
  at: number;
  until: number;
  factor: number;
}

/**
 * Le flux de demande : qui part d'où, pour aller où, et avec combien de patience. Il a son propre générateur
 * aléatoire et ne lit jamais l'état d'une simulation : ce que fait le joueur (ou le pilote automatique) ne change
 * pas les voyageurs qui arrivent. C'est ce qui rend la comparaison avec le fantôme honnête.
 */
export class DemandStream {
  private readonly rng: () => number;
  private readonly acc: Float64Array;
  private readonly boost: Float64Array;
  private boostVersion = 0;
  private readonly surge: Float64Array;
  private readonly events: { event: ScenarioEvent; stage: 0 | 1 | 2 }[];
  private seq = 0;

  constructor(
    private readonly net: Network,
    private readonly demand: Demand,
    opts: { seed: number; scenario?: readonly ScenarioEvent[]; windows?: readonly DemandWindow[] },
  ) {
    this.rng = mulberry32(opts.seed);
    const n = net.stations.length;
    this.acc = Float64Array.from({ length: n }, () => this.rng());
    this.boost = new Float64Array(n).fill(1);
    this.surge = new Float64Array(n);
    this.events = (opts.scenario ?? []).map((event) => ({ event, stage: 0 }));
    this.windows = opts.windows ?? [];
  }

  private readonly windows: readonly DemandWindow[];

  /** Multiplicateur de la demande à cet instant (épisodes de pluie). */
  factor(time: number): number {
    let f = 1;
    for (const w of this.windows) if (time >= w.at && time < w.until) f *= w.factor;
    return f;
  }

  /** Les apparitions du pas `[time - dt, time]`, ajoutées à `out`. */
  advance(time: number, dt: number, out: Spawn[]): void {
    this.runEvents(time);
    const factor = this.factor(time);
    const [lo, hi] = CONFIG.riders.patience;
    for (let s = 0; s < this.acc.length; s++) {
      this.acc[s] += (this.demand.emission(s, time) * factor + this.surge[s]) * dt;
      while (this.acc[s] >= 1) {
        this.acc[s] -= 1;
        const dest = this.demand.pick(s, time, this.rng, this.boost, this.boostVersion);
        out.push({ seq: ++this.seq, time, origin: s, dest, patience: lo + (hi - lo) * this.rng() });
      }
    }
  }

  /** Les événements de la journée qui jouent sur la demande : destinations plus courues, foules de sortie. */
  private runEvents(time: number): void {
    const at = (id: string) => this.net.byId.get(id)!;
    for (const s of this.events) {
      const e = s.event;
      const on = s.stage === 0 && time >= e.at;
      const off = s.stage === 1 && time >= e.until;
      if (!on && !off) continue;
      s.stage = on ? 1 : 2;
      const fx = e.effect;
      if (fx.kind === 'attract') {
        for (const [id, factor] of Object.entries(fx.boost))
          this.boost[at(id)] *= on ? factor : 1 / factor;
        this.boostVersion++;
      } else if (fx.kind === 'surge') {
        const perMinute = fx.riders / (e.until - e.at);
        for (const [id, share] of Object.entries(fx.from)) {
          this.surge[at(id)] = Math.max(0, this.surge[at(id)] + (on ? 1 : -1) * perMinute * share);
        }
      }
    }
  }
}
