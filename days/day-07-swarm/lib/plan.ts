import { CONFIG } from './config';
import { DEVIATIONS, DeviationData } from './deviations';
import {
  Line,
  Network,
  Path,
  PathMeta,
  createPath,
  pathKey,
  sectionKey,
  segmentKey,
} from './network';

/** Le plan d'exploitation figé à un instant : ce que le joueur a décidé. */
export interface PlanSnapshot {
  readonly version: number;
  /** Déviations en service (identifiants de `deviations.ts`). */
  readonly deviations: ReadonlySet<string>;
  /** Stations non desservies : les rames passent sans s'arrêter. */
  readonly skipped: ReadonlySet<number>;
  /** Stations où la circulation est interrompue : aucune rame n'y passe, les lignes sont coupées autour. */
  readonly cut: ReadonlySet<number>;
  /** Tronçons interrompus (clé `segmentKey`). */
  readonly cutEdges: ReadonlySet<string>;
}

/**
 * Les décisions du joueur sur le réseau. Chaque setter dit si quelque chose a changé ; la simulation applique le
 * plan au pas suivant (on peut donc tout basculer pendant la pause).
 */
export class OperatingPlan {
  private ver = 0;
  private readonly deviations = new Set<string>();
  private readonly skipped = new Set<number>();
  private readonly cut = new Set<number>();
  private readonly cutEdges = new Set<string>();

  get version(): number {
    return this.ver;
  }

  hasDeviation(id: string): boolean {
    return this.deviations.has(id);
  }

  isSkipped(s: number): boolean {
    return this.skipped.has(s);
  }

  isCut(s: number): boolean {
    return this.cut.has(s);
  }

  isEdgeCut(a: number, b: number): boolean {
    return this.cutEdges.has(segmentKey(a, b));
  }

  setDeviation(id: string, on: boolean): boolean {
    return this.toggle(this.deviations, id, on);
  }

  setSkip(s: number, on: boolean): boolean {
    if (on && this.cut.has(s)) return false;
    return this.toggle(this.skipped, s, on);
  }

  /** Interrompre une station l'enlève aussi des stations non desservies (la coupure prime). */
  setCut(s: number, on: boolean): boolean {
    const changed = this.toggle(this.cut, s, on);
    if (on && this.skipped.delete(s)) this.ver++;
    return changed;
  }

  setCutEdge(a: number, b: number, on: boolean): boolean {
    return this.toggle(this.cutEdges, segmentKey(a, b), on);
  }

  snapshot(): PlanSnapshot {
    return {
      version: this.ver,
      deviations: new Set(this.deviations),
      skipped: new Set(this.skipped),
      cut: new Set(this.cut),
      cutEdges: new Set(this.cutEdges),
    };
  }

  private toggle<T>(set: Set<T>, value: T, on: boolean): boolean {
    if (set.has(value) === on) return false;
    if (on) set.add(value);
    else set.delete(value);
    this.ver++;
    return true;
  }
}

export const EMPTY_PLAN: PlanSnapshot = {
  version: 0,
  deviations: new Set(),
  skipped: new Set(),
  cut: new Set(),
  cutEdges: new Set(),
};

/** Un tronçon exploité : une ligne (ou un morceau de ligne) avec ses deux terminus, ou la boucle entière. */
export interface Section {
  key: string;
  line: number;
  /** Stations dans le sens du GTFS (la boucle : dans le sens 1). */
  stations: number[];
  loop: boolean;
  /** Branches de la ligne qui passent par ce tronçon (ligne 3 : les deux sur le tronc commun). */
  branches: number[];
  deviation: string | null;
  /** Terminus provisoires (créés par une coupure), dans le sens du GTFS : [début, fin]. */
  provisional: [boolean, boolean];
}

/** Le service d'une ligne selon le plan : ses tronçons, ses parcours, et où une rame peut repartir. */
export interface LineService {
  line: Line;
  sections: Section[];
  paths: Path[];
  /** Parcours qui partent d'une station (terminus, vrai ou provisoire), dans l'ordre d'alternance. */
  startsAt: Map<number, Path[]>;
  /** Durée d'un tour complet par groupe de régulation (aller, retour, battements). */
  cycle: Map<string, number>;
}

/**
 * Tous les parcours de la partie, partagés par clé : un même parcours est toujours le même objet, qu'il vienne
 * du GTFS ou du plan. Les maps indexées par parcours (régulation) restent donc valables d'un plan à l'autre.
 */
export class PathRegistry {
  private readonly paths = new Map<string, Path>();

  constructor(private readonly net: Network) {
    for (const line of net.lines) for (const p of line.paths) this.paths.set(p.key, p);
  }

  intern(
    line: number,
    stations: readonly number[],
    dir: 1 | -1,
    loop: boolean,
    meta: PathMeta = {},
  ): Path {
    const key = pathKey(line, dir, loop, stations, meta.oneOff);
    let path = this.paths.get(key);
    if (!path) {
      path = createPath(this.net, line, stations, dir, loop, meta);
      this.paths.set(key, path);
    }
    return path;
  }
}

/** Les tronçons parcourus par la déviation (de `from` à `to` par `via`), ralentis d'un facteur `slow`. */
export function deviationSlow(
  net: Network,
  dev: DeviationData,
): { edges: Set<string>; factor: number } {
  const ids = [dev.from, ...dev.via, dev.to].map((id) => net.byId.get(id)!);
  const edges = new Set<string>();
  for (let k = 0; k + 1 < ids.length; k++) edges.add(segmentKey(ids[k], ids[k + 1]));
  return { edges, factor: dev.slow };
}

/** Une suite de stations où l'on remplace le passage de `from` à `to` par la déviation (dans un sens ou l'autre). */
export function applyDeviation(
  net: Network,
  seq: readonly number[],
  dev: DeviationData,
): number[] | null {
  const from = net.byId.get(dev.from)!;
  const to = net.byId.get(dev.to)!;
  const via = dev.via.map((id) => net.byId.get(id)!);
  const i = seq.indexOf(from);
  const j = seq.indexOf(to);
  if (i < 0 || j < 0) return null;
  const out =
    i < j
      ? [...seq.slice(0, i + 1), ...via, ...seq.slice(j)]
      : [...seq.slice(0, j + 1), ...[...via].reverse(), ...seq.slice(i)];
  for (let k = 0; k + 1 < out.length; k++) {
    if (!net.hops.has(segmentKey(out[k], out[k + 1]))) return null;
  }
  return out;
}

/** Coupe une suite de stations aux stations et tronçons interrompus ; garde les morceaux d'au moins 2 stations. */
function split(seq: readonly number[], plan: PlanSnapshot): number[][] {
  const pieces: number[][] = [];
  let cur: number[] = [];
  for (const s of seq) {
    if (plan.cut.has(s)) {
      pieces.push(cur);
      cur = [];
      continue;
    }
    if (cur.length && plan.cutEdges.has(segmentKey(cur[cur.length - 1], s))) {
      pieces.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  pieces.push(cur);
  return pieces.filter((p) => p.length >= 2);
}

/** Les tronçons exploités d'une ligne selon le plan. */
export function sectionsOf(net: Network, line: Line, plan: PlanSnapshot): Section[] {
  const devs = DEVIATIONS.filter((d) => d.line === line.id && plan.deviations.has(d.id));
  if (line.loop) return loopSections(line, plan);
  const out = new Map<string, Section>();
  line.base.forEach((base, branch) => {
    let seq: readonly number[] = base;
    let deviation: DeviationData | null = null;
    for (const d of devs) {
      const next = applyDeviation(net, seq, d);
      if (next) {
        seq = next;
        deviation = d;
      }
    }
    const via = new Set(deviation?.via.map((id) => net.byId.get(id)!) ?? []);
    for (const piece of split(seq, plan)) {
      const key = sectionKey(line.id, piece);
      const known = out.get(key);
      if (known) {
        known.branches.push(branch);
        continue;
      }
      out.set(key, {
        key,
        line: line.id,
        stations: piece,
        loop: false,
        branches: [branch],
        deviation: deviation && piece.some((s) => via.has(s)) ? deviation.id : null,
        provisional: [piece[0] !== base[0], piece[piece.length - 1] !== base[base.length - 1]],
      });
    }
  });
  return [...out.values()];
}

/** La boucle (ligne 4) : entière sans coupure ; sinon, des navettes linéaires avec deux terminus provisoires. */
function loopSections(line: Line, plan: PlanSnapshot): Section[] {
  const seq = line.base[0];
  const n = seq.length;
  let r = -1;
  for (let i = 0; i < n && r < 0; i++) {
    if (plan.cut.has(seq[i]) || plan.cutEdges.has(segmentKey(seq[i], seq[(i + 1) % n])))
      r = (i + 1) % n;
  }
  if (r < 0) {
    return [
      {
        key: sectionKey(line.id, seq),
        line: line.id,
        stations: [...seq],
        loop: true,
        branches: [0],
        deviation: null,
        provisional: [false, false],
      },
    ];
  }
  const rotated = [...seq.slice(r), ...seq.slice(0, r)];
  return split(rotated, plan).map((piece) => ({
    key: sectionKey(line.id, piece),
    line: line.id,
    stations: piece,
    loop: false,
    branches: [0],
    deviation: null,
    provisional: [true, true],
  }));
}

/** Le service de chaque ligne selon le plan. Avec un plan vide, ce sont exactement les parcours du GTFS. */
export function deriveService(
  net: Network,
  plan: PlanSnapshot,
  reg: PathRegistry,
): Map<number, LineService> {
  const out = new Map<number, LineService>();
  for (const line of net.lines) {
    const sections = sectionsOf(net, line, plan);
    const paths: Path[] = [];
    const startsAt = new Map<number, Path[]>();
    const cycle = new Map<string, number>();
    const start = (p: Path) => {
      const list = startsAt.get(p.stations[0]);
      if (list) list.push(p);
      else startsAt.set(p.stations[0], [p]);
    };
    // Aller de chaque tronçon d'abord, puis les retours : l'alternance au terminus commun suit les branches.
    const backs: Path[] = [];
    for (const sec of sections) {
      if (sec.loop) {
        const [cw, ccw] = line.paths;
        paths.push(cw, ccw);
        start(cw);
        start(ccw);
        for (const p of [cw, ccw]) {
          cycle.set(p.group, p.minutes.reduce((s, m) => s + m, 0) + CONFIG.tram.loopStop);
        }
        continue;
      }
      const dev = DEVIATIONS.find((d) => d.id === sec.deviation);
      const meta = {
        group: sec.key,
        deviation: sec.deviation,
        borrow: dev?.borrow,
        slow: dev ? deviationSlow(net, dev) : undefined,
      };
      const fwd = reg.intern(line.id, sec.stations, 1, false, {
        ...meta,
        provisional: [sec.provisional[0], sec.provisional[1]],
      });
      const back = reg.intern(line.id, [...sec.stations].reverse(), -1, false, {
        ...meta,
        provisional: [sec.provisional[1], sec.provisional[0]],
      });
      paths.push(fwd);
      backs.push(back);
      start(fwd);
      const layover = (provisional: boolean) =>
        provisional ? CONFIG.plan.provisionalLayover : CONFIG.tram.layover;
      cycle.set(
        sec.key,
        fwd.minutes.reduce((s, m) => s + m, 0) * 2 +
          layover(sec.provisional[0]) +
          layover(sec.provisional[1]),
      );
    }
    for (const b of backs) {
      paths.push(b);
      start(b);
    }
    out.set(line.id, { line, sections, paths, startsAt, cycle });
  }
  return out;
}

/** Le parcours d'une rame déviée à la demande : le sien, avec la déviation entre `from` et `to`. */
export function deviatePath(
  net: Network,
  reg: PathRegistry,
  path: Path,
  dev: DeviationData,
): Path | null {
  if (path.loop || dev.line !== path.line) return null;
  const seq = applyDeviation(net, path.stations, dev);
  if (!seq) return null;
  return reg.intern(path.line, seq, path.dir, false, {
    oneOff: true,
    group: 'oneoff',
    deviation: dev.id,
    borrow: dev.borrow,
    slow: deviationSlow(net, dev),
    provisional: path.provisional,
  });
}

/** L'entrée de la déviation sur un parcours (la première de `from` et `to` dans le sens de marche), ou -1. */
export function deviationEntry(net: Network, path: Path, dev: DeviationData): number {
  if (path.line !== dev.line || path.loop) return -1;
  const a = path.rank[net.byId.get(dev.from)!];
  const b = path.rank[net.byId.get(dev.to)!];
  if (a < 0 || b < 0) return -1;
  return Math.min(a, b);
}
