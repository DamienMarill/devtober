import { autopilot } from './autopilot';
import { CONFIG } from './config';
import { Demand } from './demand';
import { DemandStream, Spawn } from './demand-stream';
import { DayDraw, IncidentEngine, IncidentSpec, demandWindows, drawDay } from './incidents';
import { Network } from './network';
import { dayEvents } from './scenario';
import { Sim } from './sim';

export interface DuelOptions {
  seed: number;
  /** Minute de départ (6 h par défaut) : avant, les deux simulations avancent au pilote automatique. */
  start?: number;
  /** Les imprévus (sinon tirés avec la graine). */
  day?: DayDraw;
  fleet?: number;
  /** Le joueur garde les événements des points pour l'essaim. */
  track?: boolean;
}

/** Ce que chaque camp a perdu pendant un imprévu (abandons ×3 + retards, en voyageurs). */
export interface IncidentDelta {
  spec: IncidentSpec;
  player: number;
  ghost: number;
}

/**
 * Le duel : le joueur et le fantôme jouent la même journée, au même pas, avec les mêmes voyageurs (un seul flux
 * de demande) et les mêmes imprévus (un moteur chacun, mêmes tirages). Le fantôme ne fait que répartir les rames
 * au pilote automatique ; le joueur, lui, a tous les outils du PC.
 */
export class Duel {
  readonly day: DayDraw;
  readonly stream: DemandStream;
  readonly player: Sim;
  readonly ghost: Sim;
  private readonly spawns: Spawn[] = [];
  private ghostClock = 0;
  /** Pertes cumulées (abandons ×3 + retards, en points de foule) à chaque minute écoulée. */
  private readonly losses: { time: number; player: number; ghost: number }[] = [];

  constructor(net: Network, demand: Demand, opts: DuelOptions) {
    this.day = opts.day ?? drawDay(net, opts.seed);
    const scenario = dayEvents(this.day.evening);
    this.stream = new DemandStream(net, demand, {
      seed: opts.seed,
      scenario,
      windows: demandWindows(this.day.incidents),
    });
    const make = (track: boolean) =>
      new Sim(net, demand, {
        seed: opts.seed,
        scenario,
        incidents: new IncidentEngine(net, this.day.incidents),
        fleet: opts.fleet,
        track,
        demand: false,
      });
    this.player = make(opts.track ?? false);
    this.ghost = make(false);
    if (opts.start !== undefined) this.fastForward(opts.start);
  }

  get time(): number {
    return this.player.time;
  }

  /** Un pas pour les deux camps (le fantôme décide au pilote automatique). */
  step(dt: number, playerAutopilot = false): void {
    this.spawns.length = 0;
    this.stream.advance(this.player.time + dt, dt, this.spawns);
    this.player.step(dt, this.spawns);
    this.ghost.step(dt, this.spawns);
    // Le fil du fantôme n'est lu par personne.
    this.ghost.notices.length = 0;
    this.ghostClock += dt;
    if (this.ghostClock >= CONFIG.autopilot.every) {
      this.ghostClock = 0;
      autopilot(this.ghost);
      if (playerAutopilot) autopilot(this.player);
    }
    const minute = Math.floor(this.player.time);
    if (!this.losses.length || this.losses[this.losses.length - 1].time < minute) {
      this.losses.push({ time: minute, player: lossOf(this.player), ghost: lossOf(this.ghost) });
    }
  }

  /** Avance sans rendu jusqu'à `to`, les deux camps au pilote automatique (états identiques). */
  fastForward(to: number): void {
    const track = this.player.track;
    this.player.track = false;
    while (this.player.time < to) this.step(CONFIG.step, true);
    this.player.notices.length = 0;
    this.ghost.notices.length = 0;
    this.player.track = track;
  }

  /** Pertes de chaque camp pendant chaque imprévu (de son début à 30 min après sa fin). */
  incidentDeltas(): IncidentDelta[] {
    const at = (t: number) => {
      let best = this.losses[0];
      for (const l of this.losses) if (l.time <= t) best = l;
      return best ?? { time: t, player: 0, ghost: 0 };
    };
    return this.day.incidents
      .filter((spec) => spec.at <= this.time)
      .map((spec) => {
        const a = at(spec.at);
        const b = at(Math.min(this.time, spec.until + 30));
        return {
          spec,
          player: (b.player - a.player) * CONFIG.riderSize,
          ghost: (b.ghost - a.ghost) * CONFIG.riderSize,
        };
      });
  }
}

/** Pertes cumulées d'une simulation, en points de foule : abandons ×3 + retards. */
function lossOf(sim: Sim): number {
  return sim.stats.abandoned * -CONFIG.points.gaveUp + sim.stats.late * -CONFIG.points.late;
}
