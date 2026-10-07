import { CONFIG } from './config';
import { Sim } from './sim';

export interface Report {
  /** Voyageurs arrivés à destination (points × 10). */
  served: number;
  /** Voyageurs partis à pied. */
  lost: number;
  /** Voyageurs arrivés à pied (réseau coupé) : ni servis ni perdus. */
  walked: number;
  /** Part des voyageurs servis parmi ceux qui ont fini leur journée (servis + perdus). */
  share: number;
  /** Attente moyenne à quai, en minutes. */
  wait: number;
  worst: { station: string; lost: number } | null;
  peak: { station: string; count: number; at: number };
  note: number;
  title: string;
  servedByHour: readonly number[];
  lostByHour: readonly number[];
}

/** Bornes de la note : en dessous de `floor` servis, 0/20 ; à `top` et au-dessus, 20/20. */
export const NOTE = { floor: 0.72, top: 0.985 };

/** La note sur 20, au demi-point. */
export function noteFor(share: number): number {
  const x = (share - NOTE.floor) / (NOTE.top - NOTE.floor);
  return Math.round(Math.max(0, Math.min(1, x)) * 40) / 2;
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

export function makeReport(sim: Sim): Report {
  const st = sim.stats;
  const size = CONFIG.riderSize;
  const done = st.arrived + st.abandoned;
  const share = done ? st.arrived / done : 1;
  let worst: Report['worst'] = null;
  st.abandonsBy.forEach((n, s) => {
    if (n > 0 && (!worst || n * size > worst.lost)) {
      worst = { station: sim.net.stations[s].name, lost: n * size };
    }
  });
  const note = noteFor(share);
  return {
    served: st.arrived * size,
    lost: st.abandoned * size,
    walked: st.walked * size,
    share,
    wait: st.waits ? st.waitSum / st.waits : 0,
    worst,
    peak: {
      station: sim.net.stations[st.maxCrowdStation].name,
      count: st.maxCrowd * size,
      at: st.maxCrowdAt,
    },
    note,
    title: titleFor(note),
    servedByHour: st.servedByHour.map((n) => n * size),
    lostByHour: st.lostByHour.map((n) => n * size),
  };
}

/** « 08:05 » ; au-delà de minuit, on repart de 00. */
export function clock(minute: number): string {
  const m = Math.floor(minute) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
