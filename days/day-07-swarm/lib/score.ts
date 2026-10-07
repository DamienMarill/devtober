import { CONFIG } from './config';
import type { Duel } from './duel';

export interface Report {
  /** Points du joueur et du fantôme (+1 arrivé, −3 abandon, −1 attente de plus de 10 min, en voyageurs). */
  points: number;
  ghostPoints: number;
  /** Voyageurs arrivés en tram (points × 10). */
  served: number;
  /** Voyageurs partis à pied (abandons). */
  lost: number;
  /** Voyageurs arrivés à pied (réseau coupé) : ni servis ni perdus. */
  walked: number;
  /** Part des voyageurs servis parmi ceux qui ont fini leur journée (servis + perdus). */
  share: number;
  /** Attente moyenne à quai, en minutes. */
  wait: number;
  worst: { station: string; lost: number } | null;
  peak: { station: string; count: number; at: number };
  /** Note sur 20 face au fantôme. */
  note: number;
  title: string;
  /** Chaque imprévu : pertes du joueur et du fantôme (abandons ×3 + retards, en voyageurs). */
  incidents: { title: string; at: number; player: number; ghost: number }[];
  servedByHour: readonly number[];
  lostByHour: readonly number[];
}

/**
 * La note face au fantôme : 10/20 à égalité ; 20/20 si l'on évite la moitié des pertes que le fantôme a subies
 * (par rapport au score parfait : tout le monde arrivé en tram sans attendre plus de 10 minutes) ; 0/20 si l'on
 * en subit autant de plus. Au demi-point.
 */
export function noteVsGhost(player: number, ghost: number, perfect: number): number {
  const room = Math.max((perfect - ghost) * 0.5, perfect * 0.02, 1);
  const x = Math.max(-1, Math.min(1, (player - ghost) / room));
  return Math.round((10 + 10 * x) * 2) / 2;
}

/** Le titre de la journée : le seul endroit franchement taquin du PC. */
export function titleFor(note: number): string {
  if (note >= 18) return 'Le PC t’applaudit debout. Même la 4 a l’air d’être arrivée à l’heure.';
  if (note >= 15)
    return 'Solide journée. Quelques quais bondés, rien que la Comédie n’ait déjà vu.';
  if (note >= 12) return 'Ça a tenu. Montpellier a râlé, mais Montpellier râle toujours.';
  if (note >= 8) return 'Rude journée. Les loueurs de trottinettes te remercient.';
  return 'La Métropole réfléchit à te confier plutôt les navettes de nuit.';
}

export function makeReport(duel: Duel): Report {
  const sim = duel.player;
  const st = sim.stats;
  const size = CONFIG.riderSize;
  const done = st.arrived + st.abandoned;
  let worst: Report['worst'] = null;
  st.abandonsBy.forEach((n, s) => {
    if (n > 0 && (!worst || n * size > worst.lost)) {
      worst = { station: sim.net.stations[s].name, lost: n * size };
    }
  });
  const note = noteVsGhost(sim.points, duel.ghost.points, st.spawned * size);
  return {
    points: sim.points,
    ghostPoints: duel.ghost.points,
    served: st.arrived * size,
    lost: st.abandoned * size,
    walked: st.walked * size,
    share: done ? st.arrived / done : 1,
    wait: st.waits ? st.waitSum / st.waits : 0,
    worst,
    peak: {
      station: sim.net.stations[st.maxCrowdStation].name,
      count: st.maxCrowd * size,
      at: st.maxCrowdAt,
    },
    note,
    title: titleFor(note),
    incidents: duel.incidentDeltas().map((d) => ({
      title: d.spec.title,
      at: d.spec.at,
      player: d.player,
      ghost: d.ghost,
    })),
    servedByHour: st.servedByHour.map((n) => n * size),
    lostByHour: st.lostByHour.map((n) => n * size),
  };
}

/** « 08:05 » ; au-delà de minuit, on repart de 00. */
export function clock(minute: number): string {
  const m = Math.floor(minute) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
