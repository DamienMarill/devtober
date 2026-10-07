import { CONFIG } from './config';
import { Network, Path } from './network';

/** Un morceau d'itinéraire : monter dans la ligne `line` à `from`, descendre à `to`. */
export interface Leg {
  line: number;
  from: number;
  to: number;
  /** Sens sur une boucle (1 ou -1) ; 0 sur une ligne simple, où la destination suffit à dire le sens. */
  dir: 0 | 1 | -1;
}

/** `routes[origine][destination]` : les morceaux du meilleur itinéraire (vide si origine = destination). */
export type Routes = readonly (readonly (readonly Leg[])[])[];

/**
 * Tous les itinéraires du réseau, par Dijkstra sur les états (parcours, rang dans le parcours) : rouler d'une
 * station à la suivante coûte le temps de parcours plus l'arrêt, changer de parcours dans une station coûte
 * `transfer` minutes. Les états d'une même station sur deux parcours de la même ligne (les deux branches de la
 * 3) sont reliés comme une correspondance : on descend et on attend la bonne rame.
 */
export function computeRoutes(net: Network, transfer: number = CONFIG.riders.transfer): Routes {
  const paths: Path[] = net.lines.flatMap((l) => l.paths);
  const first: number[] = [];
  let count = 0;
  for (const p of paths) {
    first.push(count);
    count += p.stations.length;
  }
  const pathOf = new Int32Array(count);
  const rankOf = new Int32Array(count);
  const stationOf = new Int32Array(count);
  const atStation: number[][] = net.stations.map(() => []);
  paths.forEach((p, pi) => {
    p.stations.forEach((s, k) => {
      const id = first[pi] + k;
      pathOf[id] = pi;
      rankOf[id] = k;
      stationOf[id] = s;
      atStation[s].push(id);
    });
  });
  const dwell = CONFIG.tram.dwell;

  const dist = new Float64Array(count);
  const prev = new Int32Array(count);
  const heap = new MinHeap();
  const routes: Leg[][][] = [];

  for (let origin = 0; origin < net.stations.length; origin++) {
    dist.fill(Infinity);
    prev.fill(-1);
    for (const id of atStation[origin]) {
      dist[id] = 0;
      heap.push(0, id);
    }
    while (heap.size) {
      const [d, id] = heap.pop();
      if (d > dist[id]) continue;
      const p = paths[pathOf[id]];
      const k = rankOf[id];
      const n = p.stations.length;
      // Rouler jusqu'à la station suivante du parcours.
      if (p.loop || k + 1 < n) {
        const next = first[pathOf[id]] + ((k + 1) % n);
        const nd = d + p.minutes[k] + dwell;
        if (nd < dist[next]) {
          dist[next] = nd;
          prev[next] = id;
          heap.push(nd, next);
        }
      }
      // Changer de parcours dans cette station (sauf à l'origine, où tous les départs sont gratuits).
      if (stationOf[id] === origin) continue;
      for (const other of atStation[stationOf[id]]) {
        if (other === id) continue;
        const nd = d + transfer;
        if (nd < dist[other]) {
          dist[other] = nd;
          prev[other] = id;
          heap.push(nd, other);
        }
      }
    }

    const row: Leg[][] = [];
    for (let dest = 0; dest < net.stations.length; dest++) {
      if (dest === origin) {
        row.push([]);
        continue;
      }
      let best = -1;
      for (const id of atStation[dest]) if (best < 0 || dist[id] < dist[best]) best = id;
      const chain: number[] = [];
      for (let id = best; id >= 0; id = prev[id]) chain.push(id);
      chain.reverse();
      row.push(toLegs(chain, paths, pathOf, stationOf));
    }
    routes.push(row);
  }
  return routes;
}

/** Une suite d'états → les morceaux d'itinéraire (un par parcours emprunté). */
function toLegs(chain: number[], paths: Path[], pathOf: Int32Array, stationOf: Int32Array): Leg[] {
  const legs: Leg[] = [];
  let start = 0;
  for (let i = 1; i <= chain.length; i++) {
    if (i < chain.length && pathOf[chain[i]] === pathOf[chain[start]]) continue;
    const from = stationOf[chain[start]];
    const to = stationOf[chain[i - 1]];
    if (from !== to) {
      const p = paths[pathOf[chain[start]]];
      legs.push({ line: p.line, from, to, dir: p.loop ? p.dir : 0 });
    }
    start = i;
  }
  return legs;
}

/** Tas binaire minimal (priorité, valeur). */
class MinHeap {
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
