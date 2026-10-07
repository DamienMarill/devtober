import { CONFIG } from './config';
import { Demand, mulberry32 } from './demand';
import { DemandStream, DemandWindow, Spawn } from './demand-stream';
import { DEVIATIONS } from './deviations';
import { Line, Network, Path, cycleMinutes, realFleet } from './network';
import { Obstructions } from './obstruction';
import {
  LineService,
  OperatingPlan,
  PathRegistry,
  PlanSnapshot,
  deriveService,
  deviatePath,
  deviationEntry,
} from './plan';
import { resnap } from './resnap';
import { Leg, Router } from './router';
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
  state: 'wait' | 'ride' | 'walk' | 'stranded';
  /** Début de l'attente en cours, et minutes d'attente déjà faites (attentes terminées). */
  waitSince: number;
  waited: number;
  patience: number;
  /** A déjà attendu plus de `CONFIG.points.lateAfter` minutes (compté une fois). */
  late: boolean;
  /** Version du réseau pour laquelle son itinéraire a été calculé. */
  version: number;
  /** Marche en cours : de `walkFrom` vers la fin du morceau, entre `walkStart` et `walkUntil`. */
  walkFrom: number;
  walkStart: number;
  walkUntil: number;
  tram: Tram | null;
}

export type TramOrderKind = 'hold' | 'turnBack' | 'deadhead' | 'deviate' | 'depot';

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
  /** Rentre au dépôt au prochain terminus (rame retirée de la ligne). */
  retire: boolean;
  /** Minutes d'immobilisation restantes (panne, malaise) et leur cause. */
  immobile: number;
  cause: 'breakdown' | 'illness' | null;
  /** Fraction de point en cours de montée ou de descente (débit continu). */
  flow: number;
  /** Quai occupé (`station:précédente`, ou `station:T` au terminus). */
  platform: string | null;
  /** Tronçon orienté occupé (`a>b`) en `run`. */
  seg: string | null;
  /** Le demi-tour du terminus est fait (on embarque pour le sens suivant). */
  turned: boolean;
  /** Hors du service courant (ancien parcours, déviation à la demande, repli) : on la recale à chaque arrêt. */
  stale: boolean;
  /** `deadhead` : haut-le-pied, à vide et sans arrêt jusqu'au terminus. */
  mode: 'service' | 'deadhead';
  order: { kind: TramOrderKind; at: number } | null;
  holdUntil: number;
  /** Tout le monde descend au prochain arrêt (demi-tour, haut-le-pied, dépôt, station coupée). */
  alightAll: boolean;
  /** Dernier instant où la rame a bougé (pour le chien de garde). */
  lastMove: number;
}

/** Ce qui arrive aux points, pour l'essaim (vidé par l'affichage à chaque image). */
export type SimEvent =
  | { kind: 'spawn'; rider: Rider }
  | { kind: 'board'; rider: Rider; tram: Tram }
  | { kind: 'alight'; rider: Rider; tram: Tram; transfer: boolean }
  | { kind: 'walk'; rider: Rider; from: number; to: number; start: number; until: number }
  | { kind: 'walked'; rider: Rider; done: boolean }
  | { kind: 'reroute'; rider: Rider }
  | { kind: 'abandon'; rider: Rider };

/** Ce qui mérite une ligne dans le fil du PC. */
export type Notice =
  | { kind: 'announce' | 'start' | 'end'; event: ScenarioEvent; station?: number }
  | {
      kind: 'incident';
      stage: 'announce' | 'start' | 'end';
      id: string;
      title: string;
      text: string;
      station?: number;
      line?: number;
      /** Incident sérieux : le fil reste sobre tant qu'il dure. */
      sober?: boolean;
    }
  | { kind: 'crowd'; station: number; count: number }
  | { kind: 'bunching'; line: number; count: number; station: number }
  | { kind: 'deploy' | 'retire' | 'cancel'; line: number }
  | { kind: 'depot-empty' }
  | { kind: 'plan'; change: 'cut' | 'uncut' | 'skip' | 'unskip'; station: number }
  | { kind: 'plan'; change: 'deviation-on' | 'deviation-off'; deviation: string; line: number }
  | { kind: 'plan'; change: 'cut-edge' | 'uncut-edge'; station: number; to: number }
  | {
      kind: 'order';
      stage: 'given' | 'done' | 'cancelled';
      order: TramOrderKind;
      tram: number;
      line: number;
      station: number;
    }
  | { kind: 'watchdog'; line: number; station: number };

export interface Stats {
  spawned: number;
  /** Arrivés en tram, arrivés à pied, partis à pied (abandons), en retard (plus de 10 min d'attente). */
  arrived: number;
  walked: number;
  abandoned: number;
  late: number;
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
  /** Fois où le chien de garde a dû renvoyer une rame coincée au dépôt (doit rester à 0). */
  watchdog: number;
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

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

/** Ce que l'affichage doit savoir d'une station. */
export interface StationState {
  skipped: boolean;
  cut: boolean;
  obstructed: boolean;
  closed: boolean;
  frozen: boolean;
  /** Lignes dont un tronçon s'arrête ici alors que ce n'est pas un vrai terminus. */
  provisional: number[];
}

/** Ce qui fait tourner les incidents (voir `incidents.ts`) : appelé au début de chaque pas. */
export interface IncidentHook {
  tick(sim: Sim): void;
}

export interface SimOptions {
  /** Graine de la demande (flux interne) et des petites décisions d'exploitation. */
  seed?: number;
  /** Minute de départ (6 h par défaut). */
  start?: number;
  scenario?: readonly ScenarioEvent[];
  /** Périodes de demande renforcée (pluie) pour le flux interne. */
  windows?: readonly DemandWindow[];
  incidents?: IncidentHook;
  /** Rames au total (83 : la flotte réelle de 8 h). */
  fleet?: number;
  /** Garder les événements des points (l'affichage les consomme ; inutile pour une simulation sans rendu). */
  track?: boolean;
  /**
   * Faire naître des voyageurs avec un flux interne (true par défaut). Le duel passe `false` et fournit les
   * apparitions lui-même à `step()` ; les tests aussi, pour n'avoir que les voyageurs qu'ils ajoutent.
   */
  demand?: boolean;
}

/**
 * La simulation : des rames qui roulent sur le service du plan d'exploitation, s'arrêtent à quai le temps de faire
 * descendre et monter les voyageurs, obéissent aux ordres du régulateur et se heurtent aux incidents ; des points
 * qui apparaissent, attendent, changent de ligne, marchent ou abandonnent. Aucun DOM.
 */
export class Sim {
  time: number;
  readonly trams: Tram[] = [];
  /** Points à quai : `waiting[station][indice de ligne]`. */
  readonly waiting: Rider[][][];
  /** Points sans itinéraire (réseau coupé) : ils attendent qu'un chemin réapparaisse. */
  readonly stranded: Rider[][];
  readonly walkers: Rider[] = [];
  depot: number;
  readonly incoming: { line: number; eta: number }[] = [];
  readonly returning: number[] = [];
  readonly events: SimEvent[] = [];
  readonly notices: Notice[] = [];
  readonly stats: Stats;
  readonly fleet: number;
  readonly plan = new OperatingPlan();
  readonly obstructions = new Obstructions();
  /** Garder les événements des points pour l'essaim (coupé pendant une avance rapide). */
  track: boolean;
  /** Ralentissement des rames (pluie : 1,3) et de la marche. */
  slow = 1;
  walkFactor = 1;
  /** Rames retenues au dépôt par une grève. */
  withheld = 0;

  private readonly opsRng: () => number;
  private readonly lineIndex = new Map<number, number>();
  private readonly lineById = new Map<number, Line>();
  private readonly segments = new Map<string, Tram[]>();
  private readonly platforms = new Map<string, number>();
  private readonly scenario: { event: ScenarioEvent; stage: 0 | 1 | 2 | 3 }[];
  private readonly lastCrowd: Float64Array;
  private readonly lastBunch = new Map<number, number>();
  private readonly lastStart = new Map<string, number>();
  private readonly alternate = new Map<string, number>();
  private readonly registry: PathRegistry;
  private readonly router: Router;
  private readonly stream: DemandStream | null;
  private readonly spawnBuffer: Spawn[] = [];
  /** Le moteur d'imprévus (lu par l'affichage et les bots). */
  readonly incidents: IncidentHook | null;
  private service: Map<number, LineService>;
  private inService = new Set<Path>();
  private snapshot: PlanSnapshot;
  private appliedPlan = 0;
  private obstructionVersion = 0;
  private walkVersion = 1;
  private net_version = 1;
  private riderVersion = 1;
  private tramId = 1;
  private manualSeq = 0;
  private patienceClock = 0;
  private watchClock = 0;
  private watchCount = 0;

  constructor(
    readonly net: Network,
    readonly demand: Demand,
    options: SimOptions = {},
  ) {
    const seed = options.seed ?? 20261007;
    this.opsRng = mulberry32(seed ^ 0x5bd1e995);
    this.time = options.start ?? CONFIG.day.start;
    this.track = options.track ?? true;
    this.incidents = options.incidents ?? null;
    this.stream =
      (options.demand ?? true)
        ? new DemandStream(net, demand, {
            seed,
            scenario: options.scenario,
            windows: options.windows,
          })
        : null;
    net.lines.forEach((l, i) => {
      this.lineIndex.set(l.id, i);
      this.lineById.set(l.id, l);
    });
    const n = net.stations.length;
    this.waiting = net.stations.map(() => net.lines.map(() => []));
    this.stranded = net.stations.map(() => []);
    this.lastCrowd = new Float64Array(n).fill(-Infinity);
    this.stats = {
      spawned: 0,
      arrived: 0,
      walked: 0,
      abandoned: 0,
      late: 0,
      waitSum: 0,
      waits: 0,
      abandonsBy: new Int32Array(n),
      maxCrowd: 0,
      maxCrowdStation: 0,
      maxCrowdAt: this.time,
      servedByHour: new Array(25).fill(0),
      lostByHour: new Array(25).fill(0),
      watchdog: 0,
    };
    this.scenario = (options.scenario ?? []).map((event) => ({ event, stage: 0 }));

    this.registry = new PathRegistry(net);
    this.snapshot = this.plan.snapshot();
    this.service = deriveService(net, this.snapshot, this.registry);
    this.refreshInService();
    this.router = new Router(net);

    // La flotte : celle que la TaM fait rouler à 8 h ; à l'ouverture, la répartition réelle de l'heure.
    this.fleet = options.fleet ?? net.lines.reduce((s, l) => s + realFleet(l, 8 * 60 + 30), 0);
    let placed = 0;
    for (const line of net.lines) {
      const count = realFleet(line, this.time);
      this.placeEvenly(line, count);
      placed += count;
    }
    this.depot = Math.max(0, this.fleet - placed);
    this.syncNetwork();
  }

  // ------------------------------------------------------------ lecture

  /** Version du réseau vu par les voyageurs (plan appliqué, stations bloquées, marche). */
  get netVersion(): number {
    return this.net_version;
  }

  /** Stations où aucune rame ne passe à cause d'un incident (compatibilité de l'affichage). */
  get blocked(): ReadonlySet<number> {
    return this.obstructions.stations;
  }

  /** Le service appliqué d'une ligne. */
  serviceOf(lineId: number): LineService {
    return this.service.get(lineId)!;
  }

  /** Une rame peut-elle s'arrêter là (pour les voyageurs) ? */
  stops(s: number): boolean {
    return (
      !this.snapshot.skipped.has(s) &&
      !this.snapshot.cut.has(s) &&
      !this.obstructions.stations.has(s)
    );
  }

  stationState(s: number): StationState {
    const provisional: number[] = [];
    for (const [id, svc] of this.service) {
      const ends = svc.paths.some(
        (p) => !p.loop && p.provisional[1] && p.stations[p.stations.length - 1] === s,
      );
      if (ends) provisional.push(id);
    }
    return {
      skipped: this.plan.isSkipped(s),
      cut: this.plan.isCut(s),
      obstructed: this.obstructions.stations.has(s),
      closed: this.obstructions.closed.has(s),
      frozen: this.obstructions.frozen.has(s),
      provisional,
    };
  }

  findTram(id: number): Tram | undefined {
    return this.trams.find((t) => t.id === id);
  }

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

  /** Points à quai dans une station, toutes lignes confondues (et ceux qui n'ont plus d'itinéraire). */
  crowdAt(station: number): number {
    let n = this.stranded[station].length;
    for (const list of this.waiting[station]) n += list.length;
    return n;
  }

  waitingCount(): number {
    let n = 0;
    for (let s = 0; s < this.waiting.length; s++) n += this.crowdAt(s);
    return n;
  }

  /** Points de la partie, en voyageurs : +1 arrivé en tram, −3 abandon, −1 attente de plus de 10 min. */
  get points(): number {
    const p = CONFIG.points;
    const s = this.stats;
    return (s.arrived * p.arrived + s.abandoned * p.gaveUp + s.late * p.late) * CONFIG.riderSize;
  }

  // ------------------------------------------------------------ commandes : rames par ligne

  /** Sort une rame du dépôt pour cette ligne (elle arrive au terminus après `CONFIG.depot.deploy`). */
  addRame(lineId: number): boolean {
    if (this.depot <= 0) {
      this.notices.push({ kind: 'depot-empty' });
      return false;
    }
    if (!this.service.get(lineId)?.paths.length) return false;
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
      if (tram.line.id !== lineId || tram.retire || tram.immobile > 0) continue;
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

  // ------------------------------------------------------------ commandes : plan d'exploitation

  setDeviation(id: string, on: boolean): CommandResult {
    const dev = DEVIATIONS.find((d) => d.id === id);
    if (!dev) return { ok: false, reason: 'Déviation inconnue' };
    if (!this.plan.setDeviation(id, on)) return { ok: false, reason: 'Déjà dans cet état' };
    this.notices.push({
      kind: 'plan',
      change: on ? 'deviation-on' : 'deviation-off',
      deviation: id,
      line: dev.line,
    });
    return { ok: true };
  }

  setSkip(s: number, on: boolean): CommandResult {
    if (!this.plan.setSkip(s, on)) return { ok: false, reason: 'Déjà dans cet état' };
    this.notices.push({ kind: 'plan', change: on ? 'skip' : 'unskip', station: s });
    return { ok: true };
  }

  setCut(s: number, on: boolean): CommandResult {
    if (!this.plan.setCut(s, on)) return { ok: false, reason: 'Déjà dans cet état' };
    this.notices.push({ kind: 'plan', change: on ? 'cut' : 'uncut', station: s });
    return { ok: true };
  }

  setCutEdge(a: number, b: number, on: boolean): CommandResult {
    if (!this.plan.setCutEdge(a, b, on)) return { ok: false, reason: 'Déjà dans cet état' };
    this.notices.push({ kind: 'plan', change: on ? 'cut-edge' : 'uncut-edge', station: a, to: b });
    return { ok: true };
  }

  // ------------------------------------------------------------ commandes : une rame

  /** Les ordres possibles pour une rame, avec la raison d'un refus. */
  tramActions(tram: Tram): Record<TramOrderKind, CommandResult & { at?: number }> {
    const kinds: TramOrderKind[] = ['hold', 'turnBack', 'deadhead', 'deviate', 'depot'];
    return Object.fromEntries(kinds.map((k) => [k, this.checkOrder(tram, k)])) as Record<
      TramOrderKind,
      CommandResult & { at?: number }
    >;
  }

  /** Donne un ordre à une rame ; il s'applique à sa station actuelle (à quai) ou à la prochaine. */
  order(tramId: number, kind: TramOrderKind): CommandResult {
    const tram = this.findTram(tramId);
    if (!tram) return { ok: false, reason: 'Rame introuvable' };
    const check = this.checkOrder(tram, kind);
    if (!check.ok) return check;
    const at = check.at!;
    if (kind === 'deviate') {
      const dev = DEVIATIONS.find((d) => d.line === tram.line.id && !this.plan.hasDeviation(d.id))!;
      tram.path = deviatePath(this.net, this.registry, tram.path, dev)!;
      tram.stale = true;
      this.notices.push({
        kind: 'order',
        stage: 'done',
        order: kind,
        tram: tram.id,
        line: tram.line.id,
        station: at,
      });
      return { ok: true };
    }
    tram.order = { kind, at };
    this.notices.push({
      kind: 'order',
      stage: 'given',
      order: kind,
      tram: tram.id,
      line: tram.line.id,
      station: at,
    });
    if (tram.state === 'dwell' && tram.path.stations[tram.k] === at) this.applyOrderAtStop(tram);
    return { ok: true };
  }

  private checkOrder(tram: Tram, kind: TramOrderKind): CommandResult & { at?: number } {
    if (tram.immobile > 0) return { ok: false, reason: 'Rame immobilisée' };
    if (this.isFrozen(tram)) return { ok: false, reason: 'Courant coupé' };
    if (tram.order) return { ok: false, reason: 'Un ordre est déjà en cours' };
    const ids = tram.path.stations;
    const n = ids.length;
    const dwelling = tram.state === 'dwell';
    const nextK = tram.path.loop ? (tram.k + 1) % n : tram.k + 1;
    if (!dwelling && nextK >= n) return { ok: false, reason: 'Fin de parcours' };
    const at = dwelling ? ids[tram.k] : ids[nextK];
    if (kind === 'deviate') {
      const dev = DEVIATIONS.find((d) => d.line === tram.line.id);
      if (!dev) return { ok: false, reason: 'Pas de déviation sur cette ligne' };
      if (this.plan.hasDeviation(dev.id) || tram.path.deviation)
        return { ok: false, reason: 'Déjà déviée' };
      const entry = deviationEntry(this.net, tram.path, dev);
      if (entry < 0 || entry < tram.k || (!dwelling && entry === tram.k)) {
        return { ok: false, reason: 'La déviation n’est pas devant elle' };
      }
      const via = dev.via.map((id) => this.net.byId.get(id)!);
      if (via.some((s) => this.snapshot.cut.has(s) || this.obstructions.stations.has(s))) {
        return { ok: false, reason: 'Itinéraire bis bloqué' };
      }
      return { ok: true, at };
    }
    if (kind === 'deadhead' || kind === 'hold') {
      if (tram.mode === 'deadhead') return { ok: false, reason: 'Déjà haut-le-pied' };
    }
    if (kind === 'deadhead' && !tram.path.loop && (dwelling ? tram.k : nextK) >= n - 1) {
      return { ok: false, reason: 'Déjà au terminus' };
    }
    return { ok: true, at };
  }

  /** Effet d'un ordre quand la rame est à quai à sa station. */
  private applyOrderAtStop(tram: Tram): void {
    const o = tram.order!;
    switch (o.kind) {
      case 'hold':
        tram.holdUntil = Math.max(tram.holdUntil, this.time + CONFIG.orders.hold);
        this.finishOrder(tram);
        break;
      case 'turnBack':
      case 'deadhead':
      case 'depot':
        tram.alightAll = true;
        if (o.kind === 'turnBack') tram.turned = false;
        break;
      case 'deviate':
        break;
    }
  }

  private finishOrder(tram: Tram, stage: 'done' | 'cancelled' = 'done'): void {
    const o = tram.order;
    if (!o) return;
    tram.order = null;
    this.notices.push({
      kind: 'order',
      stage,
      order: o.kind,
      tram: tram.id,
      line: tram.line.id,
      station: o.at,
    });
  }

  // ------------------------------------------------------------ incidents

  /** Immobilise une rame (panne, malaise). */
  immobilize(tram: Tram, minutes: number, cause: 'breakdown' | 'illness'): void {
    tram.immobile = Math.max(tram.immobile, minutes);
    tram.cause = cause;
  }

  setSlow(factor: number): void {
    this.slow = factor;
  }

  setWalkFactor(factor: number): void {
    if (factor === this.walkFactor) return;
    this.walkFactor = factor;
    this.walkVersion++;
  }

  /** Retient jusqu'à `n` rames au dépôt (grève) ; renvoie le nombre réellement retenu. */
  withhold(n: number): number {
    const k = Math.min(n, this.depot);
    this.depot -= k;
    this.withheld += k;
    return k;
  }

  release(n: number): void {
    const k = Math.min(n, this.withheld);
    this.withheld -= k;
    this.depot += k;
  }

  pushNotice(n: Notice): void {
    this.notices.push(n);
  }

  // ------------------------------------------------------------ pas de simulation

  /** Un pas de `dt` minutes. `spawns` : les apparitions fournies par le duel (sinon le flux interne). */
  step(dt: number, spawns?: readonly Spawn[]): void {
    this.time += dt;
    this.applyPlan();
    this.runScenario();
    this.incidents?.tick(this);
    this.syncNetwork();

    if (spawns) for (const s of spawns) this.spawn(s);
    else if (this.stream) {
      this.spawnBuffer.length = 0;
      this.stream.advance(this.time, dt, this.spawnBuffer);
      for (const s of this.spawnBuffer) this.spawn(s);
    }
    if (this.riderVersion !== this.net_version) this.rerouteWaiting();
    this.moveWalkers();
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

  // ------------------------------------------------------------ plan et réseau

  private refreshInService(): void {
    this.inService = new Set([...this.service.values()].flatMap((s) => s.paths));
  }

  /** Applique le plan du joueur s'il a changé : nouveau service, rames recalées, réseau à recalculer. */
  private applyPlan(): void {
    if (this.plan.version === this.appliedPlan) return;
    this.appliedPlan = this.plan.version;
    this.snapshot = this.plan.snapshot();
    this.service = deriveService(this.net, this.snapshot, this.registry);
    this.refreshInService();
    for (const tram of [...this.trams]) this.snapTram(tram);
    this.net_version++;
  }

  /** Le réseau des voyageurs change aussi avec les obstructions et la vitesse de marche. */
  private syncNetwork(): void {
    const key = this.obstructions.version * 1000 + this.walkVersion;
    if (key !== this.obstructionVersion) {
      this.obstructionVersion = key;
      this.net_version++;
    }
    this.router.sync({
      paths: [...this.inService],
      stops: (s) => this.stops(s),
      walkFactor: this.walkFactor,
      version: this.net_version,
    });
  }

  /** Recale une rame sur le service courant (voir `resnap.ts`). */
  private snapTram(tram: Tram): void {
    const svc = this.service.get(tram.line.id)!;
    if (tram.path.oneOff) {
      // Déviation à la demande ou repli : on garde son parcours tant que rien de coupé ne se trouve devant.
      const ahead = tram.path.stations.slice(tram.k + 1);
      if (!ahead.some((s) => this.snapshot.cut.has(s))) {
        tram.stale = true;
        return;
      }
    }
    const snap = resnap(
      { path: tram.path, k: tram.k, state: tram.state, p: tram.p, turned: tram.turned },
      svc,
      this.snapshot,
    );
    switch (snap.kind) {
      case 'keep':
        tram.stale = false;
        break;
      case 'move':
        tram.path = snap.path;
        tram.k = snap.k;
        if (tram.state === 'dwell') tram.turned = snap.turned;
        tram.stale = false;
        break;
      case 'turn':
        tram.turned = false;
        tram.stale = true;
        break;
      case 'stale':
        tram.stale = true;
        break;
      case 'shunt': {
        const dir = (snap.backward ? -tram.path.dir : tram.path.dir) as 1 | -1;
        const path = this.registry.intern(tram.line.id, snap.stations, dir, false, {
          oneOff: true,
          group: 'shunt',
          provisional: [true, true],
        });
        if (tram.state === 'run') {
          this.leaveSegment(tram);
          tram.path = path;
          tram.k = 0;
          tram.p = snap.p;
          this.enterSegment(tram);
        } else {
          tram.path = path;
          tram.k = 0;
          tram.turned = true;
          tram.alightAll = true;
        }
        tram.stale = true;
        break;
      }
      case 'depot':
        this.sendToDepot(tram);
        return;
    }
    // Un ordre dont la station n'est plus devant la rame est annulé.
    if (tram.order && tram.order.kind !== 'deviate') {
      const r = tram.path.rank[tram.order.at];
      if (r < 0 || r < tram.k || (tram.state === 'run' && r === tram.k))
        this.finishOrder(tram, 'cancelled');
    }
  }

  // ------------------------------------------------------------ voyageurs

  private spawn(s: Spawn): void {
    const rider: Rider = {
      id: s.seq,
      origin: s.origin,
      dest: s.dest,
      legs: [],
      leg: 0,
      station: s.origin,
      state: 'wait',
      waitSince: this.time,
      waited: 0,
      patience: s.patience,
      late: false,
      version: this.net_version,
      walkFrom: s.origin,
      walkStart: 0,
      walkUntil: 0,
      tram: null,
    };
    this.stats.spawned++;
    if (this.track) this.events.push({ kind: 'spawn', rider });
    this.plan_(rider, s.origin, false);
  }

  /** Fait apparaître un point à `origin` pour `dest` (pour les tests). */
  addRider(origin: number, dest: number, patience = 20): Rider {
    this.spawn({ seq: --this.manualSeq, time: this.time, origin, dest, patience });
    return this.findRider(this.manualSeq)!;
  }

  private findRider(id: number): Rider | undefined {
    for (const lists of this.waiting)
      for (const l of lists) for (const r of l) if (r.id === id) return r;
    for (const l of this.stranded) for (const r of l) if (r.id === id) return r;
    for (const r of this.walkers) if (r.id === id) return r;
    for (const t of this.trams) for (const r of t.riders) if (r.id === id) return r;
    return undefined;
  }

  /**
   * (Re)calcule l'itinéraire d'un point à `station` et le lance sur son premier morceau. `keepWait` : un point qui
   * attendait déjà garde son heure d'arrivée à quai (sa patience ne repart pas de zéro).
   */
  private plan_(rider: Rider, station: number, keepWait: boolean): void {
    rider.station = station;
    rider.version = this.net_version;
    rider.tram = null;
    const legs = this.router.route(station, rider.dest);
    if (!keepWait) rider.waitSince = this.time;
    if (!legs) {
      rider.legs = [];
      rider.leg = 0;
      rider.state = 'stranded';
      this.stranded[station].push(rider);
      return;
    }
    rider.legs = legs;
    rider.leg = 0;
    if (!legs.length) {
      this.finish(rider, false);
      return;
    }
    this.startLeg(rider, station);
  }

  private startLeg(rider: Rider, station: number): void {
    const leg = rider.legs[rider.leg];
    rider.station = station;
    if (leg.kind === 'walk') {
      rider.state = 'walk';
      rider.walkFrom = station;
      rider.walkStart = this.time;
      rider.walkUntil = this.time + leg.minutes;
      this.walkers.push(rider);
      if (this.track) {
        this.events.push({
          kind: 'walk',
          rider,
          from: station,
          to: leg.to,
          start: this.time,
          until: rider.walkUntil,
        });
      }
      return;
    }
    rider.state = 'wait';
    this.waiting[station][this.lineIndex.get(leg.line)!].push(rider);
  }

  /** Le réseau a changé : les points à quai (et sans itinéraire) recalculent leur trajet, sans perdre leur patience. */
  private rerouteWaiting(): void {
    this.riderVersion = this.net_version;
    for (let s = 0; s < this.waiting.length; s++) {
      const all = [...this.stranded[s]];
      this.stranded[s].length = 0;
      for (const list of this.waiting[s]) {
        all.push(...list);
        list.length = 0;
      }
      for (const r of all) {
        const before = r.legs[r.leg];
        this.plan_(r, s, true);
        if (this.track && r.state !== 'walk') {
          const after = r.legs[r.leg];
          const same =
            before?.kind === 'ride' && after?.kind === 'ride' && before.line === after.line;
          if (!same) this.events.push({ kind: 'reroute', rider: r });
        }
      }
    }
  }

  private moveWalkers(): void {
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const r = this.walkers[i];
      if (this.time < r.walkUntil) continue;
      this.walkers.splice(i, 1);
      const leg = r.legs[r.leg];
      const at = leg.to;
      if (r.leg === r.legs.length - 1) {
        this.finish(r, true);
        continue;
      }
      r.leg++;
      r.waitSince = this.time;
      if (this.track) this.events.push({ kind: 'walked', rider: r, done: false });
      if (r.version !== this.net_version) this.plan_(r, at, false);
      else this.startLeg(r, at);
    }
  }

  /** Fin du trajet : en tram (+1) ou à pied (0 point). */
  private finish(r: Rider, onFoot: boolean): void {
    r.tram = null;
    r.state = 'wait';
    if (onFoot) {
      this.stats.walked++;
      if (this.track) this.events.push({ kind: 'walked', rider: r, done: true });
      return;
    }
    this.stats.arrived++;
    this.stats.servedByHour[Math.min(24, Math.floor(this.time / 60))]++;
  }

  private checkPatience(): void {
    const hour = Math.min(24, Math.floor(this.time / 60));
    const late = CONFIG.points.lateAfter;
    const check = (list: Rider[], s: number) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        const current = this.time - r.waitSince;
        if (!r.late && r.waited + current > late) {
          r.late = true;
          this.stats.late++;
        }
        if (current < r.patience) continue;
        list.splice(i, 1);
        this.stats.abandoned++;
        this.stats.abandonsBy[s]++;
        this.stats.lostByHour[hour]++;
        if (this.track) this.events.push({ kind: 'abandon', rider: r });
      }
    };
    for (let s = 0; s < this.waiting.length; s++) {
      for (const list of this.waiting[s]) check(list, s);
      check(this.stranded[s], s);
    }
  }

  // ------------------------------------------------------------ rames : mise en place

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
      id: this.tramId++,
      line,
      path,
      k,
      state: 'dwell',
      p: 0,
      t: 0,
      minDwell: CONFIG.tram.dwell,
      riders: [],
      retire: false,
      immobile: 0,
      cause: null,
      flow: 0,
      platform: null,
      seg: null,
      turned: true,
      stale: false,
      mode: 'service',
      order: null,
      holdUntil: 0,
      alightAll: false,
      lastMove: this.time,
    };
    this.trams.push(tram);
    return tram;
  }

  /** Une rame à quai au départ de `path` (terminus), prête à embarquer. */
  private spawnAtStart(line: Line, path: Path): Tram {
    const tram = this.newTram(line, path, 0);
    tram.minDwell = CONFIG.tram.layover * 0.5;
    this.dockAt(tram, this.platformKey(path, 0, true));
    return tram;
  }

  /** Les sorties de dépôt arrivées à échéance, et les rames retirées qui rentrent. */
  private serveDepot(): void {
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      if (this.incoming[i].eta > this.time) continue;
      const line = this.lineById.get(this.incoming[i].line)!;
      const start = this.bestStart(line);
      this.incoming.splice(i, 1);
      if (start) this.spawnAtStart(line, start);
      else this.depot++;
    }
    for (let i = this.returning.length - 1; i >= 0; i--) {
      if (this.returning[i] > this.time) continue;
      this.returning.splice(i, 1);
      this.depot++;
    }
  }

  /** Le terminus où une nouvelle rame est la plus utile : là où il y a le plus de monde pour cette ligne. */
  private bestStart(line: Line): Path | null {
    const li = this.lineIndex.get(line.id)!;
    const svc = this.service.get(line.id)!;
    let best: Path | null = null;
    let score = -Infinity;
    for (const [station, paths] of svc.startsAt) {
      if (this.obstructions.stations.has(station)) continue;
      for (const path of paths) {
        // Plusieurs parcours partent d'ici (branches de la 3) : on choisit celui qui a le moins de rames.
        const crowd = paths.length > 1 ? 0 : this.waiting[station][li].length;
        const onPath = this.trams.filter((t) => t.path === path).length;
        const s = crowd - onPath * 2 - this.opsRng() * 0.1;
        if (s > score) {
          score = s;
          best = path;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------ rames : quais et tronçons

  private platformKey(path: Path, k: number, terminal: boolean): string {
    const s = path.stations[k];
    if (terminal) return `${s}:T`;
    const prev = path.stations[(k - 1 + path.stations.length) % path.stations.length];
    return `${s}:${prev}`;
  }

  private dockAt(tram: Tram, key: string): void {
    tram.platform = key;
    this.platforms.set(key, (this.platforms.get(key) ?? 0) + 1);
  }

  private undock(tram: Tram): void {
    if (!tram.platform) return;
    this.platforms.set(tram.platform, (this.platforms.get(tram.platform) ?? 1) - 1);
    tram.platform = null;
  }

  private enterSegment(tram: Tram): void {
    const ids = tram.path.stations;
    const key = `${ids[tram.k]}>${ids[(tram.k + 1) % ids.length]}`;
    tram.seg = key;
    const list = this.segments.get(key);
    if (list) list.push(tram);
    else this.segments.set(key, [tram]);
  }

  private leaveSegment(tram: Tram): void {
    if (!tram.seg) return;
    const list = this.segments.get(tram.seg);
    tram.seg = null;
    if (!list) return;
    const i = list.indexOf(tram);
    if (i >= 0) list.splice(i, 1);
  }

  /** Comptes internes (pour les invariants des tests). */
  debugBooks(): {
    segments: ReadonlyMap<string, readonly Tram[]>;
    platforms: ReadonlyMap<string, number>;
  } {
    return { segments: this.segments, platforms: this.platforms };
  }

  // ------------------------------------------------------------ rames : mouvement

  private isFrozen(tram: Tram): boolean {
    const frozen = this.obstructions.frozen;
    if (!frozen.size) return false;
    const ids = tram.path.stations;
    if (tram.state === 'dwell') return frozen.has(ids[tram.k]);
    return frozen.has(ids[tram.k]) || frozen.has(ids[(tram.k + 1) % ids.length]);
  }

  private moveTram(tram: Tram, dt: number): void {
    if (tram.immobile > 0) {
      tram.immobile = Math.max(0, tram.immobile - dt);
      if (tram.immobile === 0) tram.cause = null;
      tram.lastMove = this.time;
      this.stuck(tram, dt);
      return;
    }
    if (this.isFrozen(tram)) {
      tram.lastMove = this.time;
      this.stuck(tram, dt);
      return;
    }
    const { state, k, p } = tram;
    if (tram.state === 'dwell') this.dwell(tram, dt);
    else this.run(tram, dt);
    // Bloquée en ligne, ou à quai bien au-delà d'un arrêt normal : le temps compte comme de l'attente.
    const blocked =
      state === 'run'
        ? tram.state === 'run' && tram.k === k && tram.p === p
        : tram.state === 'dwell' && tram.t > tram.minDwell + CONFIG.tram.maxDwell + 1;
    if (blocked) this.stuck(tram, dt);
    if (this.time - tram.lastMove > CONFIG.orders.watchdog && this.trams.includes(tram)) {
      this.stats.watchdog++;
      this.notices.push({
        kind: 'watchdog',
        line: tram.line.id,
        station: tram.path.stations[tram.k],
      });
      this.sendToDepot(tram);
    }
  }

  /** Les voyageurs d'une rame à l'arrêt attendent aussi (et finissent en retard, −1 point). */
  private stuck(tram: Tram, dt: number): void {
    for (const r of tram.riders) {
      r.waited += dt;
      if (!r.late && r.waited > CONFIG.points.lateAfter) {
        r.late = true;
        this.stats.late++;
      }
    }
  }

  private run(tram: Tram, dt: number): void {
    const path = tram.path;
    const ids = path.stations;
    const n = ids.length;
    const a = ids[tram.k];
    const nk = path.loop ? (tram.k + 1) % n : tram.k + 1;
    const b = ids[nk];
    // Une voiture sur la voie : les rames du tronçon restent sur place.
    if (this.obstructions.blocksEdge(a, b)) return;
    const travel = Math.max(0.3, path.minutes[tram.k] - CONFIG.tram.dwell) * this.slow;
    let p = tram.p + dt / travel;
    // Pas de dépassement : on reste à distance de la rame de devant sur le même tronçon.
    const list = tram.seg ? this.segments.get(tram.seg) : undefined;
    if (list) {
      for (const other of list) {
        if (other !== tram && other.p > tram.p)
          p = Math.min(p, other.p - CONFIG.tram.spacing / travel);
      }
    }
    const before = tram.p;
    tram.p = Math.max(tram.p, Math.min(1, p));
    if (tram.p > before) tram.lastMove = this.time;
    if (tram.p < 1) return;

    if (this.obstructions.stations.has(b)) return;
    const terminal = !path.loop && nk === n - 1;
    if (!this.mustStop(tram, b, terminal)) {
      this.passThrough(tram, nk);
      return;
    }
    const key = this.platformKey(path, nk, terminal);
    const room = terminal
      ? path.provisional[1]
        ? CONFIG.plan.provisionalPlatforms
        : CONFIG.tram.terminusPlatforms
      : 1;
    if ((this.platforms.get(key) ?? 0) >= room) return;

    this.leaveSegment(tram);
    this.dockAt(tram, key);
    tram.k = nk;
    tram.state = 'dwell';
    tram.t = 0;
    tram.p = 0;
    tram.flow = 0;
    tram.turned = !terminal;
    tram.lastMove = this.time;
    tram.minDwell = terminal
      ? path.provisional[1]
        ? CONFIG.plan.provisionalLayover
        : CONFIG.tram.layover
      : path.loop && nk === 0
        ? CONFIG.tram.loopStop
        : CONFIG.tram.dwell;
    if (tram.stale) this.snapTram(tram);
    if (tram.order && tram.order.at === b && this.trams.includes(tram)) this.applyOrderAtStop(tram);
  }

  /** S'arrête-t-on à la prochaine station ? */
  private mustStop(tram: Tram, s: number, terminal: boolean): boolean {
    if (terminal) return true;
    if (tram.order?.at === s) return true;
    if (tram.stale) return true;
    if (tram.mode === 'deadhead') return false;
    return !this.snapshot.skipped.has(s) && !this.snapshot.cut.has(s);
  }

  /** Passer une station sans s'arrêter (non desservie, haut-le-pied) : seulement si son quai est libre. */
  private passThrough(tram: Tram, nk: number): void {
    const path = tram.path;
    const key = this.platformKey(path, nk, false);
    if ((this.platforms.get(key) ?? 0) > 0) return;
    const n = path.stations.length;
    const next = path.stations[(nk + 1) % n];
    if (this.obstructions.blocksEdge(path.stations[nk], next)) return;
    this.leaveSegment(tram);
    tram.k = nk;
    tram.p = 0;
    tram.lastMove = this.time;
    this.enterSegment(tram);
  }

  private dwell(tram: Tram, dt: number): void {
    tram.t += dt;
    const station = tram.path.stations[tram.k];
    const terminal = !tram.turned;

    // Les voyageurs à bord dont le réseau a changé recalculent leur trajet à cet arrêt.
    for (const r of tram.riders) {
      if (r.version !== this.net_version) {
        const legs = this.router.route(station, r.dest);
        r.version = this.net_version;
        if (legs?.length) {
          r.legs = legs;
          r.leg = 0;
        }
      }
    }

    // Descentes d'abord, au débit des portes.
    let leaving = 0;
    for (const r of tram.riders) if (this.mustAlight(tram, r, station, terminal)) leaving++;
    if (leaving) {
      tram.flow = Math.min(tram.flow + dt * CONFIG.tram.alightRate, leaving);
      for (let i = tram.riders.length - 1; i >= 0 && tram.flow >= 1; i--) {
        const r = tram.riders[i];
        if (!this.mustAlight(tram, r, station, terminal)) continue;
        tram.flow -= 1;
        leaving--;
        tram.riders.splice(i, 1);
        this.alight(r, tram, station);
      }
      if (leaving) return;
    }
    tram.lastMove = this.time;

    // Ordres qui prennent effet une fois la rame vide.
    if (tram.order?.at === station) {
      if (tram.order.kind === 'depot') {
        this.finishOrder(tram);
        this.sendToDepot(tram);
        return;
      }
      if (tram.order.kind === 'deadhead') {
        this.finishOrder(tram);
        tram.mode = 'deadhead';
      }
    }

    // Terminus (vrai ou provisoire), demi-tour demandé, ou rentrée au dépôt.
    const loopEnd = tram.path.loop && tram.k === 0;
    if (!tram.turned || (loopEnd && tram.retire)) {
      if (tram.retire) {
        this.sendToDepot(tram);
        return;
      }
      const next = this.turnAround(tram, station);
      if (!next) {
        this.sendToDepot(tram);
        return;
      }
      tram.path = next.path;
      tram.k = next.k;
      tram.turned = true;
      tram.mode = 'service';
      tram.alightAll = false;
      tram.stale = !this.inService.has(next.path);
      if (tram.order?.kind === 'turnBack' && tram.order.at === station) this.finishOrder(tram);
    }
    tram.alightAll = false;

    if (this.obstructions.stations.has(station)) return;

    // Montées, au débit des portes, tant qu'il reste de la place.
    let canBoard = false;
    if (tram.mode === 'service' && this.stops(station) && tram.riders.length < tram.line.capacity) {
      tram.flow = Math.min(tram.flow + dt * CONFIG.tram.boardRate, 3);
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
    if (this.time < tram.holdUntil) return;
    if (tram.k === 0 && !this.regulated(tram)) return;

    // Devant : une station ou un tronçon coupé par le plan → demi-tour ici ; une obstruction → on attend à quai.
    const ids = tram.path.stations;
    const n = ids.length;
    if (!tram.path.loop && tram.k >= n - 1) {
      tram.turned = false;
      return;
    }
    const next = ids[(tram.k + 1) % n];
    if (this.snapshot.cut.has(next) || this.plan.isEdgeCut(station, next)) {
      tram.turned = false;
      tram.alightAll = true;
      tram.stale = true;
      return;
    }
    if (this.obstructions.blocksEdge(station, next)) return;
    this.depart(tram);
  }

  /** Doit-il descendre ici ? */
  private mustAlight(tram: Tram, r: Rider, station: number, terminal: boolean): boolean {
    if (terminal || tram.alightAll) return true;
    const leg = r.legs[r.leg];
    if (!leg || leg.kind !== 'ride') return true;
    if (leg.to === station) return true;
    return !this.serves(tram, leg, true);
  }

  /**
   * La rame va-t-elle là où ce morceau d'itinéraire veut aller ? `onboard` : pour un voyageur déjà à bord (la
   * rame peut alors être en haut-le-pied jusqu'au prochain arrêt où il descendra).
   */
  serves(tram: Tram, leg: Leg | undefined, onboard = false): boolean {
    if (!leg || leg.kind !== 'ride' || leg.line !== tram.line.id) return false;
    if (!onboard && (tram.mode !== 'service' || tram.alightAll)) return false;
    const path = tram.path;
    const r = path.rank[leg.to];
    if (r < 0) return false;
    if (path.loop) {
      if (leg.dir !== path.dir) return false;
    } else if (leg.dir !== 0 || r <= tram.k) return false;
    if (this.snapshot.skipped.has(leg.to) || this.snapshot.cut.has(leg.to)) return false;
    const o = tram.order;
    if (o && (o.kind === 'turnBack' || o.kind === 'depot' || o.kind === 'deadhead')) {
      const at = path.rank[o.at];
      if (at >= 0 && at < r) return false;
    }
    return true;
  }

  /**
   * Où repartir d'une station : la boucle continue ; sinon un parcours qui part d'ici (en alternant, comme les
   * branches de la 3 à Juvignac) ; sinon le parcours en sens inverse qui passe par ici (demi-tour en ligne).
   */
  private turnAround(tram: Tram, s: number): { path: Path; k: number } | null {
    const svc = this.service.get(tram.line.id)!;
    if (tram.path.loop && tram.k === 0 && this.inService.has(tram.path) && tram.turned) {
      return { path: tram.path, k: 0 };
    }
    const starts = svc.startsAt.get(s);
    if (starts?.length) {
      const key = `${tram.line.id}:${s}`;
      const i = this.alternate.get(key) ?? 0;
      this.alternate.set(key, i + 1);
      return { path: starts[i % starts.length], k: 0 };
    }
    const dir = tram.path.dir;
    const back = svc.paths
      .filter((p) => p.rank[s] >= 0 && (p.loop || p.rank[s] < p.stations.length - 1))
      .sort((a, b) => Number(a.dir === dir) - Number(b.dir === dir))[0];
    return back ? { path: back, k: back.rank[s] } : null;
  }

  /**
   * Régulation au départ du terminus : on laisse au moins une fraction de l'intervalle prévu depuis la dernière
   * rame partie sur ce parcours, sinon les rames finissent collées (bunching).
   */
  private regulated(tram: Tram): boolean {
    const path = tram.path;
    if (!this.inService.has(path)) return true;
    const last = this.lastStart.get(path.key);
    if (last === undefined) return true;
    let n = 0;
    for (const t of this.trams) {
      if (t.line === tram.line && !t.retire && t.mode === 'service' && t.path.group === path.group)
        n++;
    }
    const cycle = this.service.get(tram.line.id)!.cycle.get(path.group) ?? 60;
    return this.time - last >= (CONFIG.tram.regulation * cycle) / Math.max(1, n);
  }

  private depart(tram: Tram): void {
    if (tram.k === 0) this.lastStart.set(tram.path.key, this.time);
    this.undock(tram);
    tram.state = 'run';
    tram.p = 0;
    tram.t = 0;
    tram.lastMove = this.time;
    this.enterSegment(tram);
  }

  /** Retire la rame du réseau (elle sera au dépôt après `CONFIG.depot.back`) ; ses voyageurs descendent. */
  private sendToDepot(tram: Tram): void {
    const station = tram.path.stations[tram.k];
    for (const r of tram.riders) {
      if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: true });
      this.plan_(r, station, false);
    }
    tram.riders.length = 0;
    if (tram.order) this.finishOrder(tram, 'cancelled');
    this.undock(tram);
    this.leaveSegment(tram);
    const i = this.trams.indexOf(tram);
    if (i >= 0) this.trams.splice(i, 1);
    this.returning.push(this.time + CONFIG.depot.back);
  }

  private board(r: Rider, tram: Tram): void {
    r.tram = tram;
    r.state = 'ride';
    const wait = this.time - r.waitSince;
    r.waited += wait;
    if (!r.late && r.waited > CONFIG.points.lateAfter) {
      r.late = true;
      this.stats.late++;
    }
    this.stats.waitSum += wait;
    this.stats.waits++;
    tram.riders.push(r);
    if (this.track) this.events.push({ kind: 'board', rider: r, tram });
  }

  private alight(r: Rider, tram: Tram, station: number): void {
    const leg = r.legs[r.leg];
    const arrived = leg?.kind === 'ride' && leg.to === station;
    if (arrived && r.leg === r.legs.length - 1) {
      if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: false });
      this.finish(r, false);
      return;
    }
    if (this.track) this.events.push({ kind: 'alight', rider: r, tram, transfer: true });
    if (arrived && r.version === this.net_version) {
      r.leg++;
      r.waitSince = this.time;
      this.startLeg(r, station);
    } else {
      this.plan_(r, station, false);
    }
  }

  /** Minutes avant le prochain terminus (ou Garcia Lorca pour la boucle). */
  private minutesToEnd(tram: Tram): number {
    const m = tram.path.minutes;
    let left = tram.state === 'run' ? m[tram.k] * (1 - tram.p) : 0;
    for (let k = tram.k + (tram.state === 'run' ? 1 : 0); k < m.length; k++) left += m[k];
    return left;
  }

  // ------------------------------------------------------------ événements prévus (annonces)

  private runScenario(): void {
    for (const s of this.scenario) {
      const e = s.event;
      if (s.stage === 0 && this.time >= e.at - e.lead) {
        s.stage = 1;
        if (e.lead > 0) this.notices.push({ kind: 'announce', event: e });
      }
      if (s.stage === 1 && this.time >= e.at) {
        s.stage = 2;
        const fx = e.effect;
        const station =
          fx.kind === 'surge' ? this.net.byId.get(Object.keys(fx.from)[0]) : undefined;
        this.notices.push({ kind: 'start', event: e, station });
      }
      if (s.stage === 2 && this.time >= e.until) {
        s.stage = 3;
        if (e.done) this.notices.push({ kind: 'end', event: e });
      }
    }
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
    for (const [lineId, svc] of this.service) {
      if (this.time - (this.lastBunch.get(lineId) ?? -Infinity) < 60) continue;
      for (const path of svc.paths) {
        const cum: number[] = [0];
        for (const m of path.minutes) cum.push(cum[cum.length - 1] + m);
        const pos = this.trams
          .filter((t) => t.path === path && t.immobile === 0)
          .map((t) => ({ t, at: cum[t.k] + (t.state === 'run' ? t.p * path.minutes[t.k] : 0) }))
          .sort((a, b) => a.at - b.at);
        for (let i = 0; i + 2 < pos.length; i++) {
          if (pos[i + 2].at - pos[i].at > 3) continue;
          let j = i + 2;
          while (j + 1 < pos.length && pos[j + 1].at - pos[i].at <= 4) j++;
          this.lastBunch.set(lineId, this.time);
          this.notices.push({
            kind: 'bunching',
            line: lineId,
            count: j - i + 1,
            station: path.stations[pos[j].t.k],
          });
          return;
        }
      }
    }
  }
}
