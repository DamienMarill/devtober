import { Path, segmentKey } from './network';
import { LineService, PlanSnapshot } from './plan';

/** Où en est une rame sur son parcours. */
export interface TramPos {
  path: Path;
  k: number;
  state: 'run' | 'dwell';
  p: number;
  turned: boolean;
}

/**
 * Ce que devient une rame quand le plan change :
 * - `keep` : son parcours est toujours en service ;
 * - `move` : elle passe sur un parcours du nouveau service qui emprunte le même tronçon (ou part de la même station) ;
 * - `turn` : elle est à quai dans une station encore desservie mais son sens n'existe plus : tout le monde descend
 *   et elle repart d'ici (terminus provisoire) ;
 * - `stale` : elle finit le tronçon en cours et on recommence à la station suivante ;
 * - `shunt` : elle est sur (ou vers) une station coupée : elle recule jusqu'à la première station ouverte ;
 * - `depot` : la ligne n'a plus aucun service.
 */
export type Snap =
  | { kind: 'keep' }
  | { kind: 'move'; path: Path; k: number; turned: boolean }
  | { kind: 'turn' }
  | { kind: 'stale' }
  | { kind: 'shunt'; stations: number[]; p: number; backward: boolean }
  | { kind: 'depot' };

/** Le parcours passe-t-il de `a` à `b` (dans ce sens) ? */
export function hasEdge(path: Path, a: number, b: number): boolean {
  const r = path.rank[a];
  if (r < 0) return false;
  const n = path.stations.length;
  if (!path.loop && r === n - 1) return false;
  return path.stations[(r + 1) % n] === b;
}

/**
 * Les stations à partir du rang `k` (inclus), en reculant (`step` = -1) ou en avançant (+1), jusqu'à la première
 * station ouverte (incluse) ; vide si on sort du parcours avant d'en trouver une.
 */
function walkTo(path: Path, k: number, step: 1 | -1, cut: ReadonlySet<number>): number[] {
  const ids = path.stations;
  const n = ids.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = k + i * step;
    if ((idx < 0 || idx >= n) && !path.loop) return [];
    const s = ids[((idx % n) + n) % n];
    out.push(s);
    if (!cut.has(s)) return out;
  }
  return [];
}

/** Recale une rame sur le service courant (fonction pure, testée seule). */
export function resnap(pos: TramPos, svc: LineService, plan: PlanSnapshot): Snap {
  if (svc.paths.includes(pos.path)) return { kind: 'keep' };
  if (!svc.paths.length) return { kind: 'depot' };
  const ids = pos.path.stations;
  const n = ids.length;
  const here = ids[pos.k];
  const sameDirFirst = (a: Path, b: Path) =>
    Number(b.dir === pos.path.dir) - Number(a.dir === pos.path.dir);

  if (pos.state === 'run') {
    const next = ids[(pos.k + 1) % n];
    // Vers une station coupée, ou sur un tronçon coupé : on recule jusqu'à la station d'où l'on vient.
    if (plan.cut.has(next) || plan.cutEdges.has(segmentKey(here, next))) {
      const back = walkTo(pos.path, pos.k, -1, plan.cut);
      return back.length
        ? { kind: 'shunt', stations: [next, ...back], p: 1 - pos.p, backward: true }
        : { kind: 'depot' };
    }
    const cand = svc.paths.filter((p) => hasEdge(p, here, next)).sort(sameDirFirst)[0];
    if (cand) return { kind: 'move', path: cand, k: cand.rank[here], turned: true };
    return { kind: 'stale' };
  }

  if (plan.cut.has(here)) {
    // À quai dans une station coupée : on ressort par où on est venu, sinon par devant.
    const back = walkTo(pos.path, pos.k - 1, -1, plan.cut);
    if (back.length) return { kind: 'shunt', stations: [here, ...back], p: 0, backward: true };
    const ahead = walkTo(pos.path, pos.k + 1, 1, plan.cut);
    if (ahead.length) return { kind: 'shunt', stations: [here, ...ahead], p: 0, backward: false };
    return { kind: 'depot' };
  }
  const hasNext = pos.path.loop || pos.k < n - 1;
  if (hasNext) {
    const next = ids[(pos.k + 1) % n];
    const cand = svc.paths.filter((p) => hasEdge(p, here, next)).sort(sameDirFirst)[0];
    if (cand) return { kind: 'move', path: cand, k: cand.rank[here], turned: pos.turned };
  }
  const prev = pos.path.loop || pos.k > 0 ? ids[(pos.k - 1 + n) % n] : -1;
  // Un parcours qui se termine ici en venant du même côté : la station est devenue terminus provisoire.
  const ending = svc.paths.find(
    (p) =>
      !p.loop &&
      p.stations[p.stations.length - 1] === here &&
      (prev < 0 || p.stations[p.stations.length - 2] === prev),
  );
  if (ending) return { kind: 'move', path: ending, k: ending.stations.length - 1, turned: false };
  if (svc.paths.some((p) => p.rank[here] >= 0)) return { kind: 'turn' };
  return { kind: 'stale' };
}
