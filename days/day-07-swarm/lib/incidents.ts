import { CONFIG } from './config';
import { mulberry32 } from './demand';
import { DemandWindow } from './demand-stream';
import { Network, metres } from './network';
import { Evening } from './scenario';
import { IncidentHook, Sim, Tram } from './sim';

export type IncidentKind =
  'car' | 'scooter' | 'illness' | 'breakdown' | 'power' | 'package' | 'cortege' | 'rain' | 'strike';

/** Un imprévu tiré pour la partie : quoi, où, quand, et les textes du fil (ton du PC). */
export interface IncidentSpec {
  id: string;
  kind: IncidentKind;
  at: number;
  until: number;
  /** Annonce dans le fil `lead` minutes avant (0 : sans prévenir). */
  lead: number;
  title: string;
  announce?: string;
  text: string;
  done?: string;
  /** Ton sobre : pas de plaisanterie dans le fil tant qu'il dure. */
  sober?: boolean;
  /**
   * Lieux : les deux bouts du tronçon (voiture), la station (trottinette, colis, malaise, panne), les stations
   * privées de courant, le parcours du cortège, ou la station inondée (pluie).
   */
  stations: number[];
  line?: number;
  params: {
    /** Pluie : ralentissement des rames, demande et marche multipliées. */
    slow?: number;
    demand?: number;
    walk?: number;
    /** Grève : rames retenues au dépôt. */
    withhold?: number;
    /** Cortège : vitesse (m/min) et longueur (m). */
    speed?: number;
    length?: number;
  };
}

/** Le parcours du cortège : départ de la Comédie, tour de l'Écusson, dispersion à la Comédie. */
export const CORTEGE_ROUTE = [
  'comedie',
  'observatoire',
  'gambetta',
  'saint-guilhem-courreau',
  'peyrou-arc-de-triomphe',
  'albert-1er-jardin-des-plantes',
  'louis-blanc-agora-de-la-danse',
  'corum',
  'comedie',
] as const;

/** Stations basses près du Lez, candidates à l'inondation pendant un épisode de pluie. */
const LEZ_STATIONS = [
  'rives-du-lez',
  'moulares-hotel-de-ville',
  'port-marianne',
  'georges-freche-hotel-de-ville',
  'pompignane',
];

const POINT_KINDS: readonly [IncidentKind, number][] = [
  ['car', 0.28],
  ['scooter', 0.14],
  ['illness', 0.14],
  ['breakdown', 0.16],
  ['power', 0.1],
  ['package', 0.18],
];

const hhmm = (m: number) =>
  `${Math.floor(m / 60) % 24} h${String(Math.floor(m % 60)).padStart(2, '0')}`;

export interface DayDraw {
  evening: Evening;
  incidents: IncidentSpec[];
}

/**
 * Tire les imprévus d'une partie : grève (30 %), pluie (40 %), manif (50 %), et 3 à 5 incidents ponctuels
 * espacés d'au moins 40 minutes. `only` limite le tirage à certains types (tests, équilibrage).
 */
export function drawDay(
  net: Network,
  seed: number,
  opts: { only?: readonly IncidentKind[]; count?: readonly [number, number] } = {},
): DayDraw {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const allowed = (k: IncidentKind) => !opts.only || opts.only.includes(k);
  const name = (s: number) => net.stations[s].name;
  const at = (id: string) => net.byId.get(id)!;
  const out: IncidentSpec[] = [];
  const evening: Evening = rng() < 0.5 ? 'match' : 'concert';

  if (allowed('strike') && rng() < (opts.only ? 1 : 0.3)) {
    const n = Math.round(between(6, 12));
    out.push({
      id: 'strike',
      kind: 'strike',
      at: CONFIG.day.start,
      until: 10 * 60,
      lead: 0,
      title: 'Grève',
      text: `Préavis de grève : ${n} conducteurs en moins jusqu'à 10 h, le dépôt compte ${n} rames de moins.`,
      done: 'Fin du mouvement de grève : toutes les rames sont de nouveau disponibles.',
      stations: [],
      params: { withhold: n },
    });
  }

  if (allowed('rain') && rng() < (opts.only ? 1 : 0.4)) {
    const start = Math.round(between(7 * 60, 19 * 60));
    const until = start + Math.round(between(60, 120));
    const flooded = rng() < 0.5 ? [at(pick(LEZ_STATIONS))] : [];
    out.push({
      id: 'rain',
      kind: 'rain',
      at: start,
      until,
      lead: 20,
      title: 'Épisode méditerranéen',
      announce: `Vigilance orange pluie-inondation à partir de ${hhmm(start)} : vitesse réduite à prévoir sur tout le réseau.`,
      text: flooded.length
        ? `Fortes pluies : rames ralenties, affluence en hausse. ${name(flooded[0])} fermée, quais inondés.`
        : 'Fortes pluies : rames ralenties, affluence en hausse.',
      done: 'Fin de l’épisode pluvieux : vitesse normale rétablie.',
      sober: true,
      stations: flooded,
      params: { slow: 1.3, demand: 1.15, walk: 1.5 },
    });
  }

  if (allowed('cortege') && rng() < (opts.only ? 1 : 0.5)) {
    const start = Math.round(between(14 * 60, 16 * 60));
    const route = CORTEGE_ROUTE.map((id) => at(id));
    const speed = between(40, 55);
    const length = between(250, 400);
    const total = routeLength(net, route);
    out.push({
      id: 'cortege',
      kind: 'cortege',
      at: start,
      until: start + Math.ceil((total + length) / speed) + 2,
      lead: 60,
      title: 'Manifestation',
      announce: `Manifestation déclarée à ${hhmm(start)} : départ de la Comédie, tour de l'Écusson par l'Observatoire, Gambetta, le Peyrou, Louis Blanc et Corum.`,
      text: 'Le cortège quitte la Comédie : les stations sur son passage sont bloquées.',
      done: 'Fin de la manifestation : dispersion à la Comédie.',
      stations: route,
      params: { speed, length },
    });
  }

  // Incidents ponctuels.
  const kinds = POINT_KINDS.filter(([k]) => allowed(k));
  if (kinds.length) {
    const [lo, hi] = opts.count ?? [3, 5];
    const count = Math.round(between(lo, hi));
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
      let t = 0;
      for (let tries = 0; tries < 30; tries++) {
        t = Math.round(between(7 * 60, 21 * 60));
        if (times.every((u) => Math.abs(u - t) >= 40)) break;
      }
      times.push(t);
      const total = kinds.reduce((s, [, w]) => s + w, 0);
      let r = rng() * total;
      let kind = kinds[0][0];
      for (const [k, w] of kinds) {
        if ((r -= w) <= 0) {
          kind = k;
          break;
        }
      }
      out.push(pointIncident(net, kind, t, `${kind}-${i}`, rng));
    }
  }
  out.sort((a, b) => a.at - b.at);
  return { evening, incidents: out };
}

/** Longueur réelle d'un parcours à pied (en mètres). */
export function routeLength(net: Network, route: readonly number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < route.length; i++)
    total += metres(net.stations[route[i]], net.stations[route[i + 1]]);
  return total;
}

/** Plus une station est centrale et desservie, plus elle a de chances d'être touchée. */
function weightedStation(
  net: Network,
  rng: () => number,
  filter: (s: number) => boolean = () => true,
): number {
  const candidates = net.stations.filter((s) => filter(s.index));
  const w = candidates.map((s) => s.lines.length / (1 + Math.hypot(s.x, s.y)));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) if ((r -= w[i]) <= 0) return candidates[i].index;
  return candidates[candidates.length - 1].index;
}

function pointIncident(
  net: Network,
  kind: IncidentKind,
  at: number,
  id: string,
  rng: () => number,
): IncidentSpec {
  const name = (s: number) => net.stations[s].name;
  const between = (lo: number, hi: number) => Math.round(lo + rng() * (hi - lo));
  const lineOf = (s: number) =>
    net.stations[s].lines[Math.floor(rng() * net.stations[s].lines.length)];
  // L'estimation donnée au PC (arrondie à 5 minutes) : de quoi décider s'il vaut la peine de couper.
  const about = (minutes: number) => `environ ${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  switch (kind) {
    case 'car': {
      // Un tronçon, de préférence central et partagé.
      const edges = [...net.segments.entries()].map(([key, users]) => {
        const [a, b] = key.split('-').map(Number);
        const mid = Math.hypot(
          (net.stations[a].x + net.stations[b].x) / 2,
          (net.stations[a].y + net.stations[b].y) / 2,
        );
        return { a, b, w: users.length / (1 + mid) };
      });
      let r = rng() * edges.reduce((s, e) => s + e.w, 0);
      const e = edges.find((x) => (r -= x.w) <= 0) ?? edges[edges.length - 1];
      const dur = between(15, 25);
      return {
        id,
        kind,
        at,
        until: at + dur,
        lead: 0,
        title: 'Voiture sur la voie',
        text: `Voiture garée sur la voie entre ${name(e.a)} et ${name(e.b)} : dépanneuse attendue, ${about(dur)}.`,
        done: `Voie dégagée entre ${name(e.a)} et ${name(e.b)}.`,
        stations: [e.a, e.b],
        params: {},
      };
    }
    case 'scooter': {
      const s = weightedStation(net, rng);
      const dur = between(8, 12);
      return {
        id,
        kind,
        at,
        until: at + dur,
        lead: 0,
        title: 'Accrochage',
        text: `Accrochage avec une trottinette à ${name(s)} : circulation arrêtée le temps des secours, ${about(dur)}.`,
        done: `${name(s)} : circulation rétablie.`,
        stations: [s],
        params: {},
      };
    }
    case 'package': {
      const s = weightedStation(net, rng, (i) => net.stations[i].lines.length > 1);
      const dur = between(20, 35);
      return {
        id,
        kind,
        at,
        until: at + dur,
        lead: 0,
        title: 'Colis suspect',
        text: `Colis suspect à ${name(s)} : station fermée, quais évacués, levée de doute ${about(dur)}.`,
        done: `${name(s)} : levée de doute terminée, la circulation reprend.`,
        stations: [s],
        params: {},
      };
    }
    case 'illness': {
      const s = weightedStation(net, rng);
      const line = lineOf(s);
      const dur = between(6, 12);
      return {
        id,
        kind,
        at,
        until: at + dur,
        lead: 0,
        title: 'Malaise voyageur',
        text: `Malaise voyageur dans une rame de la ${line} à ${name(s)} : rame immobilisée le temps des secours, ${about(dur)}.`,
        done: `${name(s)} : la rame est repartie.`,
        stations: [s],
        line,
        params: {},
      };
    }
    case 'breakdown': {
      const s = weightedStation(net, rng);
      const line = lineOf(s);
      const dur = between(20, 35);
      return {
        id,
        kind,
        at,
        until: at + dur,
        lead: 0,
        title: 'Rame en panne',
        text: `Rame en panne sur la ${line} près de ${name(s)} : remorquage nécessaire, ${about(dur)}.`,
        done: `L${line} : la rame en panne a été dégagée.`,
        stations: [s],
        line,
        params: {},
      };
    }
    case 'power':
    default: {
      const lineId = 1 + Math.floor(rng() * net.lines.length);
      const line = net.lines.find((l) => l.id === lineId)!;
      const seq = line.base[0];
      const len = between(3, 5);
      const start = Math.floor(rng() * (seq.length - len));
      const run = seq.slice(start, start + len);
      const dur = between(15, 25);
      return {
        id,
        kind: 'power',
        at,
        until: at + dur,
        lead: 0,
        title: 'Coupure de courant',
        text: `Coupure de courant sur la ${lineId} entre ${name(run[0])} et ${name(run[run.length - 1])} : rames à l'arrêt, ${about(dur)}.`,
        done: `Courant rétabli entre ${name(run[0])} et ${name(run[run.length - 1])}.`,
        stations: run,
        line: lineId,
        params: {},
      };
    }
  }
}

/** Les périodes où la demande est renforcée (épisodes de pluie), pour le flux de demande. */
export function demandWindows(specs: readonly IncidentSpec[]): DemandWindow[] {
  return specs
    .filter((s) => s.kind === 'rain' && s.params.demand)
    .map((s) => ({ at: s.at, until: s.until, factor: s.params.demand! }));
}

export interface ActiveIncident {
  spec: IncidentSpec;
  stage: 'pending' | 'announced' | 'active' | 'over';
  /** Rame touchée (malaise, panne). */
  tram: number | null;
  /** Grève : rames réellement retenues. */
  withheld: number;
  /** Cortège : position de la tête et de la queue sur le parcours (mètres), stations couvertes. */
  head: number;
  tail: number;
  covered: number[];
}

/**
 * Fait vivre les imprévus dans une simulation : annonce, début, fin. Le joueur et le fantôme ont chacun leur
 * moteur, nourri des mêmes imprévus : ils subissent exactement les mêmes obstructions.
 */
export class IncidentEngine implements IncidentHook {
  readonly list: ActiveIncident[];
  private readonly arcs = new Map<string, number[]>();

  constructor(
    private readonly net: Network,
    specs: readonly IncidentSpec[],
  ) {
    this.list = specs.map((spec) => ({
      spec,
      stage: 'pending',
      tram: null,
      withheld: 0,
      head: 0,
      tail: 0,
      covered: [],
    }));
    for (const s of specs) {
      if (s.kind !== 'cortege') continue;
      const arc = [0];
      for (let i = 0; i + 1 < s.stations.length; i++) {
        arc.push(arc[i] + metres(net.stations[s.stations[i]], net.stations[s.stations[i + 1]]));
      }
      this.arcs.set(s.id, arc);
    }
  }

  /** Les imprévus en cours. */
  get active(): ActiveIncident[] {
    return this.list.filter((i) => i.stage === 'active');
  }

  /** Abscisses (mètres) des stations du parcours du cortège. */
  arc(id: string): readonly number[] {
    return this.arcs.get(id) ?? [];
  }

  tick(sim: Sim): void {
    for (const inc of this.list) {
      const s = inc.spec;
      if (inc.stage === 'pending' && s.lead > 0 && sim.time >= s.at - s.lead) {
        inc.stage = 'announced';
        this.notice(sim, inc, 'announce', s.announce ?? s.text);
      }
      if ((inc.stage === 'pending' || inc.stage === 'announced') && sim.time >= s.at) {
        inc.stage = 'active';
        this.start(sim, inc);
        this.notice(sim, inc, 'start', s.text);
      }
      if (inc.stage === 'active') {
        if (sim.time >= s.until) {
          inc.stage = 'over';
          this.end(sim, inc);
          if (s.done) this.notice(sim, inc, 'end', s.done);
        } else {
          this.update(sim, inc);
        }
      }
    }
  }

  private notice(
    sim: Sim,
    inc: ActiveIncident,
    stage: 'announce' | 'start' | 'end',
    text: string,
  ): void {
    const s = inc.spec;
    sim.pushNotice({
      kind: 'incident',
      stage,
      id: s.id,
      title: s.title,
      text,
      station: s.stations[0],
      line: s.line,
      sober: s.sober,
    });
  }

  private start(sim: Sim, inc: ActiveIncident): void {
    const s = inc.spec;
    const obs = sim.obstructions;
    switch (s.kind) {
      case 'car':
        obs.set(s.id, { edges: [[s.stations[0], s.stations[1]]] });
        break;
      case 'scooter':
        obs.set(s.id, { stations: s.stations });
        break;
      case 'package':
        obs.set(s.id, { stations: s.stations, close: true });
        break;
      case 'power':
        obs.set(s.id, { stations: s.stations, freeze: true });
        break;
      case 'rain':
        sim.setSlow(s.params.slow ?? 1);
        sim.setWalkFactor(s.params.walk ?? 1);
        if (s.stations.length) obs.set(s.id, { stations: s.stations, close: true });
        break;
      case 'strike':
        inc.withheld = sim.withhold(s.params.withhold ?? 0);
        break;
      case 'breakdown': {
        const tram = this.nearestTram(sim, s.line!, s.stations[0], (t) => t.state === 'run');
        if (tram) {
          sim.immobilize(tram, s.until - s.at, 'breakdown');
          inc.tram = tram.id;
        }
        break;
      }
      case 'cortege':
        inc.head = 0;
        this.update(sim, inc);
        break;
      case 'illness':
        this.update(sim, inc);
        break;
    }
  }

  private update(sim: Sim, inc: ActiveIncident): void {
    const s = inc.spec;
    if (s.kind === 'cortege') {
      const arc = this.arcs.get(s.id)!;
      inc.head = (sim.time - s.at) * (s.params.speed ?? 45);
      inc.tail = inc.head - (s.params.length ?? 300);
      const covered = s.stations.filter(
        (_, i) => arc[i] >= inc.tail - 60 && arc[i] <= inc.head + 60,
      );
      const unique = [...new Set(covered)];
      if (unique.join() !== inc.covered.join()) {
        inc.covered = unique;
        if (unique.length) sim.obstructions.set(s.id, { stations: unique, close: true });
        else sim.obstructions.clear(s.id);
      }
    }
    if (s.kind === 'illness' && inc.tram === null) {
      // La première rame qui s'arrête à cette station ; au bout de 10 minutes, la plus proche de la ligne.
      const station = s.stations[0];
      let tram = sim.trams.find(
        (t) => t.state === 'dwell' && t.path.stations[t.k] === station && t.immobile === 0,
      );
      if (!tram && sim.time - s.at > 10)
        tram = this.nearestTram(sim, s.line!, station, () => true) ?? undefined;
      if (tram) {
        sim.immobilize(tram, Math.max(1, s.until - sim.time), 'illness');
        inc.tram = tram.id;
      }
    }
  }

  private end(sim: Sim, inc: ActiveIncident): void {
    const s = inc.spec;
    sim.obstructions.clear(s.id);
    if (s.kind === 'rain') {
      sim.setSlow(1);
      sim.setWalkFactor(1);
    }
    if (s.kind === 'strike') sim.release(inc.withheld);
    inc.covered = [];
  }

  /** La rame de la ligne la plus proche d'une station (distance sur la carte), parmi celles qui conviennent. */
  private nearestTram(
    sim: Sim,
    line: number,
    station: number,
    ok: (t: Tram) => boolean,
  ): Tram | null {
    const target = this.net.stations[station];
    let best: Tram | null = null;
    let bestD = Infinity;
    for (const t of sim.trams) {
      if (t.line.id !== line || t.immobile > 0 || !ok(t)) continue;
      const here = this.net.stations[t.path.stations[t.k]];
      const d = Math.hypot(here.x - target.x, here.y - target.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }
}
