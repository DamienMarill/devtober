import { CONFIG } from './config';
import { Demand, mulberry32 } from './demand';
import { Line, Network, Path, cycleMinutes, realFleet } from './network';
import { Leg, Routes } from './routing';
import { ScenarioEvent } from './scenario';

/** Un point de la foule (10 voyageurs qui font le même trajet). */
export interface Rider {
  id: number;
  origin: number;
  dest: number;
  legs: readonly Leg[];
  /** Morceau d'itinéraire en cours. */
  leg: number;
  /** Station où il attend (ou la dernière où il était). */
  station: number;
  waitSince: number;
  patience: number;
  tram: Tram | null;
}

export interface Tram {
  id: number;
  line: Line;
  path: Path;
  /** Rang dans `path` de la dernière station atteinte. */
  k: number;
  state: 'run' | 'dwell';
  /** Avancement sur le tronçon (de 0 à 1) en `run`, temps passé à quai en `dwell`. */
  p: number;
  t: number;
  minDwell: number;
  riders: Rider[];
  /** Rentre au dépôt au prochain terminus. */
  retire: boolean;
  /** Minutes de panne restantes. */
  broken: number;
  /** Fraction de point en cours de montée ou de descente (débit continu). */
  flow: number;
  /** Quai occupé (`station:précédente`, ou `station:T` au terminus). */
  platform: string | null;
  /** Le demi-tour du terminus est fait (on embarque pour le sens suivant). */
  turned: boolean;
}

/** Ce qui arrive aux points, pour l'essaim (vidé par l'affichage à chaque image). */
export type SimEvent =
  | { kind: 'spawn'; rider: Rider }
  | { kind: 'board'; rider: Rider; tram: Tram }
  | { kind: 'alight'; rider: Rider; tram: Tram; transfer: boolean }
  | { kind: 'abandon'; rider: Rider }
  | { kind: 'evacuate'; rider: Rider };

/** Ce qui mérite une ligne dans le fil du PC. */
export type Notice =
  | { kind: 'announce' | 'start' | 'end'; event: ScenarioEvent; station?: number }
  | { kind: 'crowd'; station: number; count: number }
  | { kind: 'bunching'; line: number; count: number; station: number }
  | { kind: 'deploy' | 'retire' | 'cancel'; line: number }
  | { kind: 'depot-empty' };

export interface Stats {
  spawned: number;
  arrived: number;
  abandoned: number;
  evacuated: number;
  /** Somme et nombre des attentes à quai (minutes), pour l'attente moyenne. */
  waitSum: number;
  waits: number;
  abandonsBy: Int32Array;
  maxCrowd: number;
  maxCrowdStation: number;
  maxCrowdAt: number;
  /** Servis et perdus, heure par heure. */
  servedByHour: number[];
  lostByHour: number[];
}

export interface LineStatus {
  line: Line;
  /** Rames en ligne qui ne rentrent pas, plus celles qui sortent du dépôt. */
  active: number;
  incoming: number;
  retiring: number;
  waiting: number;
  riding: number;
  /** Attente moyenne des points à quai pour cette ligne (minutes). */
  wait: number;
}

export interface SimOptions {
  seed?: number;
  /** Minute de départ (6 h par défaut). */
  start?: number;
  scenario?: readonly ScenarioEvent[];
  /** Rames au total (83 : la flotte réelle de 8 h). */
  fleet?: number;
  /** Garder les événements des points (l'affichage les consomme ; inutile pour une simulation sans rendu). */
  track?: boolean;
  /** Faire naître des voyageurs selon la demande (false : seulement ceux qu'on ajoute, pour les tests). */
  demand?: boolean;
}

/**
 * La simulation : des rames qui roulent sur les vrais parcours, s'arrêtent à quai le temps de faire descendre et
 * monter les voyageurs, et des points qui naissent, attendent, changent de ligne ou abandonnent. Aucun DOM.
 */
export class Sim {
  time: number;
  readonly trams: Tram[] = [];
  /** Points à quai : `waiting[station][indice de ligne]`. */
  readonly waiting: Rider[][][];
  depot: number;
  readonly incoming: { line: number; eta: number }[] = [];
  readonly returning: number[] = [];
  readonly events: SimEvent[] = [];
  readonly notices: Notice[] = [];
  readonly stats: Stats;
  readonly blocked = new Set<number>();
  readonly fleet: number;

  private readonly rng: () => number;
  private readonly lineIndex = new Map<number, number>();
  private readonly acc: Float64Array;
  private readonly boost: Float64Array;
  private boostVersion = 0;
  private readonly surge: Float64Array;
  private readonly segments = new Map<string, Tram[]>();
  private readonly platforms = new Map<string, number>();
  private readonly scenario: { event: ScenarioEvent; stage: 0 | 1 | 2 | 3 }[];
  private readonly lastCrowd: Float64Array;
  private readonly lastBunch = new Map<number, number>();
  private nextId = 1;
  private patienceClock = 0;
  private watchClock = 0;
  private watchCount = 0;
  /** Garder les événements des points pour l'essaim (coupé pendant une avance rapide). */
  track: boolean;
  private readonly spontaneous: boolean;
  /** Dernier départ de terminus, par parcours (régulation). */
  private readonly lastStart = new Map<Path, number>();
  /** Prochaine branche à servir depuis le terminus commun (ligne 3). */
  private readonly nextBranch = new Map<number, number>();

  constructor(
    readonly net: Network,
    readonly routes: Routes,
    readonly demand: Demand,
    options: SimOptions = {},
  ) {
    this.rng = mulberry32(options.seed ?? 20261007);
    this.time = options.start ?? CONFIG.day.start;
    this.track = options.track ?? true;
    this.spontaneous = options.demand ?? true;
    net.lines.forEach((l, i) => this.lineIndex.set(l.id, i));
    const n = net.stations.length;
    this.waiting = net.stations.map(() => net.lines.map(() => []));
    this.acc = Float64Array.from({ length: n }, () => this.rng());
    this.boost = new Float64Array(n).fill(1);
    this.surge = new Float64Array(n);
    this.lastCrowd = new Float64Array(n).fill(-Infinity);
    this.stats = {
      spawned: 0,
      arrived: 0,
      abandoned: 0,
      evacuated: 0,
      waitSum: 0,
      waits: 0,
      abandonsBy: new Int32Array(n),
      maxCrowd: 0,
      maxCrowdStation: 0,
      maxCrowdAt: this.time,
      servedByHour: new Array(25).fill(0),
      lostByHour: new Array(25).fill(0),
    };
    this.scenario = (options.scenario ?? []).map((event) => ({ event, stage: 0 }));

    // La flotte : celle que la TaM fait rouler à 8 h ; à l'ouverture, la répartition réelle de l'heure.
    this.fleet = options.fleet ?? net.lines.reduce((s, l) => s + realFleet(l, 8 * 60 + 30), 0);
    let placed = 0;
    for (const line of net.lines) {
      const count = realFleet(line, this.time);
      this.placeEvenly(line, count);
      placed += count;
    }
    this.depot = Math.max(0, this.fleet - placed);
  }

  // ------------------------------------------------------------ commandes du joueur

  /** Sort une rame du dépôt pour cette ligne (elle arrive au terminus après `CONFIG.depot.deploy`). */
  addRame(lineId: number): boolean {
    if (this.depot <= 0) {
      this.notices.push({ kind: 'depot-empty' });
      return false;
    }
    this.depot--;
    this.incoming.push({ line: lineId, eta: this.time + CONFIG.depot.deploy });
    this.notices.push({ kind: 'deploy', line: lineId });
    return true;
  }

  /**
   * Retire une rame : d'abord une sortie de dépôt pas encore arrivée, sinon la rame la plus proche de son
   * terminus, qui finit sa course puis rentre.
   */
  removeRame(lineId: number): boolean {
    const pending = this.incoming.findIndex((i) => i.line === lineId);
    if (pending >= 0) {
      this.incoming.splice(pending, 1);
      this.depot++;
      this.notices.push({ kind: 'cancel', line: lineId });
      return true;
    }
    let best: Tram | null = null;
    let bestLeft = Infinity;
    for (const tram of this.trams) {
      if (tram.line.id !== lineId || tram.retire || tram.broken > 0) continue;
      const left = this.minutesToEnd(tram);
      if (left < bestLeft) {
        bestLeft = left;
        best = tram;
      }
    }
    if (!best) return false;
    best.retire = true;
    this.notices.push({ kind: 'retire', line: lineId });
    return true;
  }

  // ------------------------------------------------------------ lecture

  lineStatus(line: Line): LineStatus {
    const li = this.lineIndex.get(line.id)!;
    let active = 0;
    let retiring = 0;
    let riding = 0;
    for (const t of this.trams) {
      if (t.line !== line) continue;
      if (t.retire) retiring++;
      else active++;
      riding += t.riders.length;
    }
    let waiting = 0;
    let waitSum = 0;
    for (const lists of this.waiting) {
      for (const r of lists[li]) waitSum += this.time - r.waitSince;
      waiting += lists[li].length;
    }
    const incoming = this.incoming.filter((i) => i.line === line.id).length;
    return {
      line,
      active: active + incoming,
      incoming,
      retiring,
      waiting,
      riding,
      wait: waiting ? waitSum / waiting : 0,
    };
  }

  /** Points à quai dans une station, toutes lignes confondues. */
  crowdAt(station: number): number {
    let n = 0;
    for (const list of this.waiting[station]) n += list.length;
    return n;
  }

  waitingCount(): number {
    let n = 0;
    for (let s = 0; s < this.waiting.length; s++) n += this.crowdAt(s);
    return n;
  }

  // ------------------------------------------------------------ pas de simulation

  step(dt: number): void {
    this.time += dt;
    this.runScenario();
    if (this.spontaneous) this.spawn(dt);
    this.serveDepot();
    for (let i = this.trams.length - 1; i >= 0; i--) this.moveTram(this.trams[i], dt);

    this.patienceClock += dt;
    if (this.patienceClock >= CONFIG.riders.patienceEvery) {
      this.patienceClock = 0;
      this.checkPatience();
    }
    this.watchClock += dt;
    if (this.watchClock >= 1) {
      this.watchClock = 0;
      this.watch();
      if (++this.watchCount % 5 === 0) this.watchBunching();
    }
  }

  // ------------------------------------------------------------ voyageurs

  private spawn(dt: number): void {
    const n = this.net.stations.length;
    for (let s = 0; s < n; s++) {
      if (this.blocked.has(s)) continue;
      this.acc[s] += (this.demand.emission(s, this.time) + this.surge[s]) * dt;
      while (this.acc[s] >= 1) {
        this.acc[s] -= 1;
        // Une foule de sortie (match, concert) rentre chez elle : destinations du soir.
        const dest = this.demand.pick(s, this.time, this.rng, this.boost, this.boostVersion);
        this.addRider(s, dest);
      }
    }
  }

  /** Fait naître un point à `origin` pour `dest` (exposé pour les tests). */
  addRider(origin: number, dest: number): Rider | null {
    const legs = this.routes[origin][dest];
    if (!legs.length) return null;
    const [lo, hi] = CONFIG.riders.patience;
    const rider: Rider = {
      id: this.nextId++,
      origin,
      dest,
      legs,
      leg: 0,
      station: origin,
      waitSince: this.time,
      patience: lo + (hi - lo) * this.rng(),
      tram: null,
    };
    this.queue(rider, origin);
    this.stats.spawned++;
    if (this.track) this.events.push({ kind: 'spawn', rider });
    return rider;
  }

  private queue(rider: Rider, station: number): void {
    rider.station = station;
    rider.tram = null;
    rider.waitSince = this.time;
    this.waiting[station][this.lineIndex.get(rider.legs[rider.leg].line)!].push(rider);
  }

  private checkPatience(): void {
    const hour = Math.floor(this.time / 60);
    for (let s = 0; s < this.waiting.length; s++) {
      for (const list of this.waiting[s]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const r = list[i];
          if (this.time - r.waitSince < r.patience) continue;
          list.splice(i, 1);
          this.stats.abandoned++;
          this.stats.abandonsBy[s]++;
          this.stats.lostByHour[Math.min(24, hour)]++;
          if (this.track) this.events.push({ kind: 'abandon', rider: r });
        }
      }
    }
  }

  // ------------------------------------------------------------ rames

  /** Place `count` rames régulièrement espacées sur le tour de la ligne (ouverture de la journée). */
  private placeEvenly(line: Line, count: number): void {
    for (let j = 0; j < count; j++) {
      if (line.loop) {
        const path = line.paths[j % 2];
        const sameDir = Math.ceil((count - (j % 2)) / 2);
        const total = path.minutes.reduce((s, m) => s + m, 0);
        this.placeAt(line, path, ((Math.floor(j / 2) + 0.5) / sameDir) * total);
        continue;
      }
      const branch = j % line.branches;
      const go = line.paths[branch * 2];
      const back = line.paths[branch * 2 + 1];
      const goTime = go.minutes.reduce((s, m) => s + m, 0);
      const cycle = cycleMinutes(line, branch);
      const perBranch = Math.ceil((count - branch) / line.branches);
      // Les branches se partagent le tronc commun : on les décale d'une fraction d'intervalle.
      const o =
        ((Math.floor(j / line.branches) + (branch + 0.5) / line.branches) / perBranch) * cycle;
      if (o < goTime) this.placeAt(line, go, o);
      else if (o < goTime + CONFIG.tram.layover) this.spawnAtStart(line, back);
      else if (o < cycle - CONFIG.tram.layover)
        this.placeAt(line, back, o - goTime - CONFIG.tram.layover);
      else this.spawnAtStart(line, go);
    }
  }

  /** Une rame en route sur `path`, `offset` minutes après son départ. */
  private placeAt(line: Line, path: Path, offset: number): void {
    let k = 0;
    let left = offset;
    while (k < path.minutes.length - 1 && left >= path.minutes[k]) {
      left -= path.minutes[k];
      k++;
    }
    const tram = this.newTram(line, path, k);
    tram.state = 'run';
    tram.p = Math.min(0.95, left / path.minutes[k]);
    this.enterSegment(tram);
  }

  private newTram(line: Line, path: Path, k: number): Tram {
    const tram: Tram = {
      id: this.nextId++,
      line,
      path,
      k,
      state: 'dwell',
      p: 0,
      t: 0,
      minDwell: CONFIG.tram.dwell,
      riders: [],
      retire: false,
      broken: 0,
      flow: 0,
      platform: null,
      turned: true,
    };
    this.trams.push(tram);
    return tram;
  }

  /** Une rame à quai au départ de `path` (terminus), prête à embarquer. */
  private spawnAtStart(line: Line, path: Path): Tram {
    const tram = this.newTram(line, path, 0);
    tram.minDwell = CONFIG.tram.layover * 0.5;
    tram.platform = this.platformKey(path, 0, true);
    this.platforms.set(tram.platform, (this.platforms.get(tram.platform) ?? 0) + 1);
    return tram;
  }

  /** Les sorties de dépôt arrivées à échéance, et les rames retirées qui rentrent. */
  private serveDepot(): void {
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      if (this.incoming[i].eta > this.time) continue;
      const line = this.net.lines.find((l) => l.id === this.incoming[i].line)!;
      this.incoming.splice(i, 1);
      this.spawnAtStart(line, this.bestStart(line));
    }
    for (let i = this.returning.length - 1; i >= 0; i--) {
      if (this.returning[i] > this.time) continue;
      this.returning.splice(i, 1);
      this.depot++;
    }
  }

  /** Le terminus où une nouvelle rame est la plus utile : là où il y a le plus de monde pour cette ligne. */
  private bestStart(line: Line): Path {
    const li = this.lineIndex.get(line.id)!;
    let best = line.paths[0];
    let score = -Infinity;
    for (const path of line.paths) {
      // Sur la 3, les deux branches partent de Juvignac : on choisit celle qui a le moins de rames.
      const sameStart = line.paths.filter((p) => p.stations[0] === path.stations[0]).length > 1;
      const onPath = this.trams.filter((t) => t.path === path).length;
      const s =
        (sameStart ? 0 : this.waiting[path.stations[0]][li].length) - onPath * 2 - this.rng() * 0.1;
      if (s > score) {
        score = s;
        best = path;
      }
    }
    return best;
  }

  private platformKey(path: Path, k: number, terminal: boolean): string {
    const s = path.stations[k];
    if (terminal) return `${s}:T`;
    const prev = path.stations[(k - 1 + path.stations.length) % path.stations.length];
    return `${s}:${prev}`;
  }

  private segmentOf(tram: Tram): string {
    const ids = tram.path.stations;
    return `${ids[tram.k]}>${ids[(tram.k + 1) % ids.length]}`;
  }

  private enterSegment(tram: Tram): void {
    const key = this.segmentOf(tram);
    const list = this.segments.get(key);
    if (list) list.push(tram);
    else this.segments.set(key, [tram]);
  }

  private leaveSegment(tram: Tram): void {
    const list = this.segments.get(this.segmentOf(tram));
    if (!list) return;
    const i = list.indexOf(tram);
    if (i >= 0) list.splice(i, 1);
  }

  private moveTram(tram: Tram, dt: number): void {
    if (tram.broken > 0) {
      tram.broken = Math.max(0, tram.broken - dt);
      return;
    }
    if (tram.state === 'dwell') this.dwell(tram, dt);
    else this.run(tram, dt);
  }

  private run(tram: Tram, dt: number): void {
    const path = tram.path;
    const travel = Math.max(0.3, path.minutes[tram.k] - CONFIG.tram.dwell);
    let p = tram.p + dt / travel;
    // Pas de dépassement : on reste à distance de la rame de devant sur le même tronçon.
    const list = this.segments.get(this.segmentOf(tram));
    if (list) {
      for (const other of list) {
        if (other !== tram && other.p > tram.p)
          p = Math.min(p, other.p - CONFIG.tram.spacing / travel);
      }
    }
    tram.p = Math.max(tram.p, Math.min(1, p));
    if (tram.p < 1) return;

    const n = path.stations.length;
    const next = path.loop ? (tram.k + 1) % n : tram.k + 1;
    const station = path.stations[next];
    if (this.blocked.has(station)) return;
    const terminal = !path.loop && next === n - 1;
    const key = this.platformKey(path, next, terminal);
    const room = terminal ? CONFIG.tram.terminusPlatforms : 1;
    if ((this.platforms.get(key) ?? 0) >= room) return;

    this.leaveSegment(tram);
    this.platforms.set(key, (this.platforms.get(key) ?? 0) + 1);
    tram.platform = key;
    tram.k = next;
    tram.state = 'dwell';
    tram.t = 0;
    tram.p = 0;
    tram.flow = 0;
    tram.turned = !terminal;
    tram.minDwell = terminal
      ? CONFIG.tram.layover
      : path.loop && next === 0
        ? CONFIG.tram.loopStop
        : CONFIG.tram.dwell;
  }

  private dwell(tram: Tram, dt: number): void {
    tram.t += dt;
    const station = tram.path.stations[tram.k];
    const terminal = !tram.turned;

    // Descentes d'abord, au débit des portes (au terminus, tout le monde descend).
    let leaving = 0;
    for (const r of tram.riders) if (terminal || r.legs[r.leg].to === station) leaving++;
    if (leaving) {
      tram.flow = Math.min(tram.flow + dt * CONFIG.tram.alightRate, leaving);
      for (let i = tram.riders.length - 1; i >= 0 && tram.flow >= 1; i--) {
        const r = tram.riders[i];
        if (!terminal && r.legs[r.leg].to !== station) continue;
        tram.flow -= 1;
        leaving--;
        tram.riders.splice(i, 1);
        this.alight(r, tram, station);
      }
      if (leaving) return;
    }

    // Terminus : demi-tour (ou rentrée au dépôt).
    const loopEnd = tram.path.loop && tram.k === 0;
    if (!tram.turned || (loopEnd && tram.retire)) {
      if (tram.retire) {
        // Ceux qui restent (sur la boucle) descendent et attendent la suivante.
        for (const r of tram.riders) {
          this.queue(r, station);
          if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: true });
        }
        tram.riders.length = 0;
        this.removeTram(tram);
        this.returning.push(this.time + CONFIG.depot.back);
        return;
      }
      tram.path = this.nextPath(tram);
      tram.k = 0;
      tram.turned = true;
    }

    if (this.blocked.has(station)) return;

    // Montées, au débit des portes, tant qu'il reste de la place.
    tram.flow = Math.min(tram.flow + dt * CONFIG.tram.boardRate, 3);
    let canBoard = false;
    if (tram.riders.length < tram.line.capacity) {
      const list = this.waiting[station][this.lineIndex.get(tram.line.id)!];
      for (let i = 0; i < list.length && tram.riders.length < tram.line.capacity; i++) {
        const r = list[i];
        if (!this.serves(tram, r.legs[r.leg])) continue;
        canBoard = true;
        if (tram.flow < 1) break;
        tram.flow -= 1;
        list.splice(i--, 1);
        this.board(r, tram);
      }
    }
    if (tram.t < tram.minDwell || (canBoard && tram.t < CONFIG.tram.maxDwell)) return;
    if (tram.k === 0 && !this.regulated(tram)) return;
    this.depart(tram);
  }

  /**
   * Régulation au départ du terminus : on laisse au moins une fraction de l'intervalle prévu depuis la
   * dernière rame partie sur ce parcours, sinon les rames finissent collées (bunching).
   */
  private regulated(tram: Tram): boolean {
    const path = tram.path;
    const line = tram.line;
    const last = this.lastStart.get(path);
    if (last === undefined) return true;
    let n = 0;
    for (const t of this.trams) {
      if (
        t.line === line &&
        !t.retire &&
        (line.loop ? t.path === path : t.path.branch === path.branch)
      )
        n++;
    }
    const cycle = line.loop
      ? path.minutes.reduce((s, m) => s + m, 0) + CONFIG.tram.loopStop
      : cycleMinutes(line, path.branch);
    return this.time - last >= (CONFIG.tram.regulation * cycle) / Math.max(1, n);
  }

  private depart(tram: Tram): void {
    if (tram.k === 0) this.lastStart.set(tram.path, this.time);
    if (tram.platform) {
      this.platforms.set(tram.platform, (this.platforms.get(tram.platform) ?? 1) - 1);
      tram.platform = null;
    }
    tram.state = 'run';
    tram.p = 0;
    tram.t = 0;
    this.enterSegment(tram);
  }

  private nextPath(tram: Tram): Path {
    const line = tram.line;
    if (line.loop) return tram.path;
    const forward = tram.path.dir === 1;
    if (forward) return line.paths[tram.path.index + 1];
    // Retour au terminus commun : on alterne les branches (ligne 3).
    const branch = this.nextBranch.get(line.id) ?? 0;
    this.nextBranch.set(line.id, (branch + 1) % line.branches);
    return line.paths[branch * 2];
  }

  private removeTram(tram: Tram): void {
    if (tram.platform)
      this.platforms.set(tram.platform, (this.platforms.get(tram.platform) ?? 1) - 1);
    if (tram.state === 'run') this.leaveSegment(tram);
    this.trams.splice(this.trams.indexOf(tram), 1);
  }

  /** La rame va-t-elle là où ce morceau d'itinéraire veut aller ? */
  serves(tram: Tram, leg: Leg): boolean {
    if (leg.line !== tram.line.id) return false;
    if (tram.path.loop) return leg.dir === tram.path.dir;
    return tram.path.rank[leg.to] > tram.k;
  }

  private board(r: Rider, tram: Tram): void {
    r.tram = tram;
    this.stats.waitSum += this.time - r.waitSince;
    this.stats.waits++;
    tram.riders.push(r);
    if (this.track) this.events.push({ kind: 'board', rider: r, tram });
  }

  private alight(r: Rider, tram: Tram, station: number): void {
    const arrived = r.legs[r.leg].to === station;
    if (arrived && r.leg === r.legs.length - 1) {
      r.tram = null;
      r.station = station;
      this.stats.arrived++;
      this.stats.servedByHour[Math.min(24, Math.floor(this.time / 60))]++;
      if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: false });
      return;
    }
    if (arrived) r.leg++;
    this.queue(r, station);
    if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: true });
  }

  /** Minutes avant le prochain terminus (ou Garcia Lorca pour la boucle). */
  private minutesToEnd(tram: Tram): number {
    const m = tram.path.minutes;
    let left = tram.state === 'run' ? m[tram.k] * (1 - tram.p) : 0;
    for (let k = tram.k + (tram.state === 'run' ? 1 : 0); k < m.length; k++) left += m[k];
    return left;
  }

  // ------------------------------------------------------------ scénario

  private runScenario(): void {
    for (const s of this.scenario) {
      const e = s.event;
      if (s.stage === 0 && this.time >= e.at - e.lead) {
        s.stage = 1;
        if (e.lead > 0) this.notices.push({ kind: 'announce', event: e });
      }
      if (s.stage === 1 && this.time >= e.at) {
        s.stage = 2;
        this.applyEffect(e, true);
      }
      if (s.stage === 2 && this.time >= e.until) {
        s.stage = 3;
        this.applyEffect(e, false);
      }
    }
  }

  private applyEffect(e: ScenarioEvent, on: boolean): void {
    const fx = e.effect;
    const at = (id: string) => this.net.byId.get(id)!;
    let station: number | undefined;
    switch (fx.kind) {
      case 'attract':
        for (const [id, factor] of Object.entries(fx.boost)) {
          this.boost[at(id)] *= on ? factor : 1 / factor;
        }
        this.boostVersion++;
        break;
      case 'surge': {
        const perMinute = fx.riders / (e.until - e.at);
        for (const [id, share] of Object.entries(fx.from)) {
          this.surge[at(id)] += (on ? 1 : -1) * perMinute * share;
          if (!on) this.surge[at(id)] = Math.max(0, this.surge[at(id)]);
        }
        station = at(Object.keys(fx.from)[0]);
        break;
      }
      case 'block':
        station = at(fx.station);
        if (on) {
          this.blocked.add(station);
          this.evacuate(station);
        } else {
          this.blocked.delete(station);
        }
        break;
      case 'breakdown':
        if (on) station = this.breakDown(fx.line, fx.minutes);
        break;
    }
    if (on) this.notices.push({ kind: 'start', event: e, station });
    else if (e.done) this.notices.push({ kind: 'end', event: e, station });
  }

  /** Quais évacués : les points repartent (sans compter comme des abandons). */
  private evacuate(station: number): void {
    for (const list of this.waiting[station]) {
      for (const r of list) {
        this.stats.evacuated++;
        if (this.track) this.events.push({ kind: 'evacuate', rider: r });
      }
      list.length = 0;
    }
  }

  /** Immobilise la rame la plus chargée de la ligne entre deux stations ; renvoie la station suivante. */
  private breakDown(lineId: number, minutes: number): number | undefined {
    let victim: Tram | null = null;
    for (const t of this.trams) {
      if (t.line.id !== lineId || t.state !== 'run' || t.retire) continue;
      if (!victim || t.riders.length > victim.riders.length) victim = t;
    }
    if (!victim) return undefined;
    victim.broken = minutes;
    const ids = victim.path.stations;
    return ids[(victim.k + 1) % ids.length];
  }

  // ------------------------------------------------------------ surveillance (alertes du fil)

  private watch(): void {
    for (let s = 0; s < this.waiting.length; s++) {
      const crowd = this.crowdAt(s);
      if (crowd > this.stats.maxCrowd) {
        this.stats.maxCrowd = crowd;
        this.stats.maxCrowdStation = s;
        this.stats.maxCrowdAt = this.time;
      }
      if (crowd >= CONFIG.crowd.alert && this.time - this.lastCrowd[s] > 45) {
        this.lastCrowd[s] = this.time;
        this.notices.push({ kind: 'crowd', station: s, count: crowd });
      }
    }
  }

  /** Trois rames ou plus de la même ligne et du même sens en moins de 3 minutes de parcours : un « train ». */
  private watchBunching(): void {
    for (const line of this.net.lines) {
      if (this.time - (this.lastBunch.get(line.id) ?? -Infinity) < 60) continue;
      for (const path of line.paths) {
        const cum: number[] = [0];
        for (const m of path.minutes) cum.push(cum.at(-1)! + m);
        const pos = this.trams
          .filter((t) => t.path === path && t.broken === 0)
          .map((t) => ({
            t,
            at: cum[t.k] + (t.state === 'run' ? t.p * path.minutes[t.k] : 0),
          }))
          .sort((a, b) => a.at - b.at);
        for (let i = 0; i + 2 < pos.length; i++) {
          if (pos[i + 2].at - pos[i].at > 3) continue;
          let j = i + 2;
          while (j + 1 < pos.length && pos[j + 1].at - pos[i].at <= 4) j++;
          this.lastBunch.set(line.id, this.time);
          this.notices.push({
            kind: 'bunching',
            line: line.id,
            count: j - i + 1,
            station: path.stations[pos[j].t.k],
          });
          return;
        }
      }
    }
  }
}
