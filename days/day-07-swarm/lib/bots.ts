import { IncidentEngine } from './incidents';
import { Network, segmentKey } from './network';
import { Sim } from './sim';

/** Un régulateur automatique qui n'utilise que l'API publique de la simulation (appelé chaque minute). */
export interface Bot {
  readonly name: string;
  act(sim: Sim): void;
}

/**
 * Le régulateur qui répond aux imprévus avec les outils du joueur : couper un tronçon ou une station bloquée,
 * couper le passage du cortège (et dévier la 1 par Pompignane quand il occupe la Comédie ou la gare), puis tout
 * rétablir. Sert à prouver (`balance.spec.ts`) que les outils font mieux que le fantôme, et de démo.
 */
export function responder(
  net: Network,
  opts: {
    /** Manif : seulement la déviation (le mieux mesuré), couper tout le parcours, ou suivre le cortège. */
    cortege?: 'zone' | 'follow' | 'none';
    deviation?: boolean;
    /** Couper aussi pour les incidents courts (trottinette, malaise) : ça coûte plus que ça ne rapporte. */
    cutShort?: boolean;
  } = {},
): Bot {
  const cortegeMode = opts.cortege ?? 'none';
  const useDeviation = opts.deviation ?? true;
  const cuts = new Map<number, Set<string>>();
  const edges = new Map<string, Set<string>>();
  const leftAt = new Map<number, number>();
  const deviationBy = new Set<string>();
  const comedie = net.byId.get('comedie')!;
  const gare = net.byId.get('gare-saint-roch')!;

  const want = <K>(map: Map<K, Set<string>>, key: K, id: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(id);
    map.set(key, set);
  };
  const release = <K>(
    map: Map<K, Set<string>>,
    id: string,
    keep: (k: K) => boolean = () => false,
  ) => {
    const freed: K[] = [];
    for (const [k, set] of map) {
      if (!set.has(id) || keep(k)) continue;
      set.delete(id);
      if (!set.size) freed.push(k);
    }
    for (const k of freed) map.delete(k);
    return freed;
  };

  return {
    name: 'responder',
    act(sim: Sim): void {
      const engine = sim.incidents as IncidentEngine | null;
      if (!engine) return;
      const active = engine.active;
      const ids = new Set(active.map((i) => i.spec.id));

      // Ce qui est fini : on rétablit.
      for (const id of new Set([
        ...[...cuts.values()].flatMap((s) => [...s]),
        ...[...edges.values()].flatMap((s) => [...s]),
      ])) {
        if (ids.has(id)) continue;
        for (const s of release(cuts, id)) sim.setCut(s, false);
        for (const k of release(edges, id)) {
          const [a, b] = k.split('-').map(Number);
          sim.setCutEdge(a, b, false);
        }
      }
      for (const id of [...deviationBy]) {
        if (!ids.has(id)) {
          deviationBy.delete(id);
          if (!deviationBy.size) sim.setDeviation('l1-pompignane', false);
        }
      }

      for (const inc of active) {
        const s = inc.spec;
        switch (s.kind) {
          case 'car': {
            const key = segmentKey(s.stations[0], s.stations[1]);
            if (!edges.get(key)?.has(s.id)) {
              want(edges, key, s.id);
              sim.setCutEdge(s.stations[0], s.stations[1], true);
            }
            break;
          }
          case 'breakdown': {
            const tram = inc.tram !== null ? sim.findTram(inc.tram) : undefined;
            if (!tram || tram.state !== 'run' || tram.immobile <= 0) break;
            const a = tram.path.stations[tram.k];
            const b = tram.path.stations[(tram.k + 1) % tram.path.stations.length];
            const key = segmentKey(a, b);
            if (!edges.get(key)?.has(s.id)) {
              want(edges, key, s.id);
              sim.setCutEdge(a, b, true);
            }
            break;
          }
          case 'scooter':
          case 'illness':
            if (!opts.cutShort) break;
          // fallthrough
          case 'package':
          case 'power':
          case 'rain':
            for (const st of s.stations) {
              if (cuts.get(st)?.has(s.id)) continue;
              want(cuts, st, s.id);
              sim.setCut(st, true);
            }
            break;
          case 'cortege': {
            const route = s.stations;
            if (cortegeMode === 'zone') {
              // Comme la TaM un jour de manif : tout le parcours coupé pendant toute la durée, la 1 déviée.
              for (const st of new Set(route)) {
                if (cuts.get(st)?.has(s.id)) continue;
                want(cuts, st, s.id);
                sim.setCut(st, true);
              }
              if (useDeviation && !deviationBy.has(s.id)) {
                deviationBy.add(s.id);
                sim.setDeviation('l1-pompignane', true);
              }
              break;
            }
            if (cortegeMode === 'none') {
              if (useDeviation && !deviationBy.has(s.id)) {
                deviationBy.add(s.id);
                sim.setDeviation('l1-pompignane', true);
              }
              break;
            }
            const covered = new Set(inc.covered);
            // La station juste devant la tête du cortège est coupée d'avance.
            const arc = engine.arc(s.id);
            const ahead = route.find((_, i) => arc[i] > inc.head + 60);
            if (ahead !== undefined) covered.add(ahead);
            for (const st of covered) {
              leftAt.delete(st);
              if (cuts.get(st)?.has(s.id)) continue;
              want(cuts, st, s.id);
              sim.setCut(st, true);
            }
            // On rouvre ce que le cortège a quitté depuis au moins 2 minutes.
            const behind = release(cuts, s.id, (st) => {
              if (covered.has(st)) return true;
              const left = leftAt.get(st) ?? sim.time;
              leftAt.set(st, left);
              return sim.time - left < 2;
            });
            for (const st of behind) {
              leftAt.delete(st);
              sim.setCut(st, false);
            }
            const centre = useDeviation && (covered.has(comedie) || covered.has(gare));
            if (centre && !deviationBy.has(s.id)) {
              deviationBy.add(s.id);
              sim.setDeviation('l1-pompignane', true);
            } else if (!centre && deviationBy.delete(s.id) && !deviationBy.size) {
              sim.setDeviation('l1-pompignane', false);
            }
            break;
          }
          case 'strike':
            break;
        }
      }
    },
  };
}
