import { CONFIG } from './config';
import { Network, Path, metres } from './network';

/** Un morceau d'itinéraire : un trajet en tram (`ride`) ou à pied (`walk`). */
export type Leg =
  | {
      kind: 'ride';
      line: number;
      from: number;
      to: number;
      /** Sens sur une boucle (1 ou -1) ; 0 sur un tronçon linéaire, où la destination suffit à dire le sens. */
      dir: 0 | 1 | -1;
    }
  | { kind: 'walk'; from: number; to: number; minutes: number };

export interface RouterInput {
  /** Les parcours en service, toutes lignes confondues. */
  paths: readonly Path[];
  /** Une rame peut-elle s'arrêter (et les voyageurs monter ou descendre) à cette station ? */
  stops: (s: number) => boolean;
  /** Multiplicateur du temps de marche (pluie). */
  walkFactor: number;
  /** Version du réseau : on recalcule tout quand elle change. */
  version: number;
}

const enum Edge {
  Ride,
  Alight,
  Board,
  Walk,
}

/** Tas binaire minimal (priorité, valeur). */
export class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const k = this.keys;
    const v = this.values;
    k.push(key);
    v.push(value);
    let i = k.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (k[parent] <= k[i]) break;
      [k[parent], k[i]] = [k[i], k[parent]];
      [v[parent], v[i]] = [v[i], v[parent]];
      i = parent;
    }
  }

  pop(): [number, number] {
    const k = this.keys;
    const v = this.values;
    const top: [number, number] = [k[0], v[0]];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Les itinéraires des voyageurs, sur le réseau tel qu'il est exploité à l'instant. Le graphe a trois sortes de
 * nœuds : les états (parcours, rang) des rames en service, et deux couches « à pied » par station, avant d'être
 * monté (`foot0`) et après (`foot1`). Monter depuis `foot1` coûte une correspondance ; marcher relie les
 * stations voisines (distance réelle). Dijkstra est lancé à la demande, une fois par origine et par version du
 * réseau, puis les itinéraires sont mémorisés.
 */
export class Router {
  private version = Number.NaN;
  private paths: readonly Path[] = [];
  private stops: (s: number) => boolean = () => true;
  private walkFactor = 1;
  private rides = 0;
  private nodes = 0;
  private pathOf = new Int32Array(0);
  private rankOf = new Int32Array(0);
  private adjStart = new Int32Array(0);
  private adjTo = new Int32Array(0);
  private adjW = new Float64Array(0);
  private adjKind = new Int8Array(0);
  private readonly trees = new Map<
    number,
    { dist: Float64Array; prev: Int32Array; kind: Int8Array }
  >();
  private readonly memo = new Map<number, readonly Leg[] | null>();
  readonly counters = { dijkstras: 0 };

  constructor(
    private readonly net: Network,
    private readonly opts: { transfer?: number; walk?: boolean } = {},
  ) {}

  /** Reconstruit le graphe si la version du réseau a changé. */
  sync(input: RouterInput): void {
    if (input.version === this.version) return;
    this.version = input.version;
    this.paths = input.paths;
    this.stops = input.stops;
    this.walkFactor = input.walkFactor;
    this.trees.clear();
    this.memo.clear();
    this.build();
  }

  private build(): void {
    const S = this.net.stations.length;
    const first: number[] = [];
    let rides = 0;
    for (const p of this.paths) {
      first.push(rides);
      rides += p.stations.length;
    }
    this.rides = rides;
    this.nodes = rides + 2 * S;
    this.pathOf = new Int32Array(rides);
    this.rankOf = new Int32Array(rides);
    const edges: number[][] = Array.from({ length: this.nodes }, () => []);
    const add = (u: number, v: number, w: number, kind: Edge) => edges[u].push(v, w, kind);
    const transfer = this.opts.transfer ?? CONFIG.riders.transfer;
    const dwell = CONFIG.tram.dwell;
    const stopping = new Uint8Array(S);
    for (let s = 0; s < S; s++) stopping[s] = this.stops(s) ? 1 : 0;

    this.paths.forEach((p, pi) => {
      const n = p.stations.length;
      for (let k = 0; k < n; k++) {
        const id = first[pi] + k;
        const s = p.stations[k];
        this.pathOf[id] = pi;
        this.rankOf[id] = k;
        const continues = p.loop || k < n - 1;
        if (continues) {
          const next = p.stations[(k + 1) % n];
          add(
            id,
            first[pi] + ((k + 1) % n),
            p.minutes[k] + (stopping[next] ? dwell : 0),
            Edge.Ride,
          );
        }
        if (!stopping[s]) continue;
        add(id, rides + S + s, 0, Edge.Alight);
        if (continues) {
          add(rides + s, id, 0, Edge.Board);
          add(rides + S + s, id, transfer, Edge.Board);
        }
      }
    });
    if (this.opts.walk ?? true) {
      for (let s = 0; s < S; s++) {
        for (const w of this.net.walk[s]) {
          const minutes = (w.metres / CONFIG.walk.speed) * this.walkFactor;
          add(rides + s, rides + w.to, minutes, Edge.Walk);
          add(rides + S + s, rides + S + w.to, minutes, Edge.Walk);
        }
      }
    }

    let count = 0;
    for (const e of edges) count += e.length / 3;
    this.adjStart = new Int32Array(this.nodes + 1);
    this.adjTo = new Int32Array(count);
    this.adjW = new Float64Array(count);
    this.adjKind = new Int8Array(count);
    let at = 0;
    edges.forEach((list, u) => {
      this.adjStart[u] = at;
      for (let i = 0; i < list.length; i += 3) {
        this.adjTo[at] = list[i];
        this.adjW[at] = list[i + 1];
        this.adjKind[at] = list[i + 2];
        at++;
      }
    });
    this.adjStart[this.nodes] = at;
  }

  private tree(origin: number) {
    let tree = this.trees.get(origin);
    if (tree) return tree;
    this.counters.dijkstras++;
    const dist = new Float64Array(this.nodes).fill(Infinity);
    const prev = new Int32Array(this.nodes).fill(-1);
    const kind = new Int8Array(this.nodes).fill(-1);
    const heap = new MinHeap();
    const start = this.rides + origin;
    dist[start] = 0;
    heap.push(0, start);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (let e = this.adjStart[u]; e < this.adjStart[u + 1]; e++) {
        const v = this.adjTo[e];
        const nd = d + this.adjW[e];
        if (nd < dist[v]) {
          dist[v] = nd;
          prev[v] = u;
          kind[v] = this.adjKind[e];
          heap.push(nd, v);
        }
      }
    }
    tree = { dist, prev, kind };
    this.trees.set(origin, tree);
    return tree;
  }

  /** Coût (minutes, attente non comptée) du meilleur itinéraire, Infinity s'il n'y en a pas. */
  cost(origin: number, dest: number): number {
    if (origin === dest) return 0;
    const { dist } = this.tree(origin);
    const S = this.net.stations.length;
    return Math.min(dist[this.rides + dest], dist[this.rides + S + dest]);
  }

  /** Le meilleur itinéraire, ou null s'il n'y en a pas (même à pied). Vide si origine = destination. */
  route(origin: number, dest: number): readonly Leg[] | null {
    if (origin === dest) return [];
    const key = origin * this.net.stations.length + dest;
    if (this.memo.has(key)) return this.memo.get(key)!;
    const legs = this.solve(origin, dest);
    this.memo.set(key, legs);
    return legs;
  }

  private solve(origin: number, dest: number): Leg[] | null {
    const S = this.net.stations.length;
    const { dist, prev, kind } = this.tree(origin);
    const a = this.rides + dest;
    const b = this.rides + S + dest;
    const end = dist[a] <= dist[b] ? a : b;
    const net = dist[end];
    // Tout près : on marche plutôt que d'attendre une rame.
    const direct = metres(this.net.stations[origin], this.net.stations[dest]);
    if ((this.opts.walk ?? true) && direct <= CONFIG.walk.direct) {
      const minutes = (direct / CONFIG.walk.speed) * this.walkFactor;
      if (minutes <= net + CONFIG.walk.waitGuess)
        return [{ kind: 'walk', from: origin, to: dest, minutes }];
    }
    if (!Number.isFinite(net)) return null;

    const chain: number[] = [];
    for (let u = end; u >= 0; u = prev[u]) chain.push(u);
    chain.reverse();
    const station = (u: number) =>
      u < this.rides ? this.paths[this.pathOf[u]].stations[this.rankOf[u]] : (u - this.rides) % S;
    const legs: Leg[] = [];
    let boardAt = -1;
    for (let i = 1; i < chain.length; i++) {
      const u = chain[i];
      switch (kind[u]) {
        case Edge.Board:
          boardAt = station(u);
          break;
        case Edge.Alight: {
          const p = this.paths[this.pathOf[chain[i - 1]]];
          const to = station(u);
          if (to !== boardAt) {
            legs.push({ kind: 'ride', line: p.line, from: boardAt, to, dir: p.loop ? p.dir : 0 });
          }
          break;
        }
        case Edge.Walk: {
          const from = station(chain[i - 1]);
          const to = station(u);
          const minutes = this.adjWeight(chain[i - 1], u);
          const last = legs[legs.length - 1];
          if (last?.kind === 'walk' && last.to === from) {
            legs[legs.length - 1] = {
              kind: 'walk',
              from: last.from,
              to,
              minutes: last.minutes + minutes,
            };
          } else {
            legs.push({ kind: 'walk', from, to, minutes });
          }
          break;
        }
      }
    }
    return legs;
  }

  private adjWeight(u: number, v: number): number {
    for (let e = this.adjStart[u]; e < this.adjStart[u + 1]; e++)
      if (this.adjTo[e] === v) return this.adjW[e];
    return 0;
  }
}
