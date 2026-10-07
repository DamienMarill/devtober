import { CONFIG } from './config';
import { realFleet } from './network';
import { Sim } from './sim';

/** Le mouvement décidé : sortir une rame du dépôt pour `add`, en retirer une à `remove`. */
export interface Move {
  add?: number;
  remove?: number;
}

/**
 * La part de la flotte que mérite chaque ligne : moitié le plan réel de la TaM dans une demi-heure (ce que les
 * horaires prévoient), moitié la demande du moment (points à quai et à bord, en rames pleines).
 */
export function targets(sim: Sim): Map<number, number> {
  const lines = sim.net.lines;
  const plan = lines.map((l) => realFleet(l, sim.time + 30));
  const planTotal = plan.reduce((s, n) => s + n, 0) || 1;
  const need = lines.map((l) => {
    const st = sim.lineStatus(l);
    return (st.waiting + st.riding) / l.capacity;
  });
  const needTotal = need.reduce((s, n) => s + n, 0);
  const out = new Map<number, number>();
  lines.forEach((l, i) => {
    const share =
      needTotal > 0
        ? 0.5 * (plan[i] / planTotal) + 0.5 * (need[i] / needTotal)
        : plan[i] / planTotal;
    out.set(l.id, Math.max(CONFIG.autopilot.minPerLine[l.id] ?? 2, Math.round(share * sim.fleet)));
  });
  return out;
}

/**
 * Une décision du pilote automatique : une sortie de dépôt vers la ligne la plus en manque s'il reste des
 * rames, sinon un transfert de la ligne la mieux servie vers la plus en manque quand l'écart dépasse une rame.
 */
export function decide(sim: Sim): Move | null {
  const goal = targets(sim);
  let short = 0;
  let shortBy = 0;
  let spare = 0;
  let spareBy = 0;
  for (const line of sim.net.lines) {
    const gap = goal.get(line.id)! - sim.lineStatus(line).active;
    if (gap > shortBy) {
      shortBy = gap;
      short = line.id;
    }
    if (-gap > spareBy) {
      spareBy = -gap;
      spare = line.id;
    }
  }
  if (!short) return null;
  if (sim.depot > 0) return { add: short };
  if (shortBy >= 2 && spareBy >= 2) return { remove: spare };
  return null;
}

/** Applique jusqu'à `moves` décisions d'affilée ; renvoie le nombre de mouvements faits. */
export function autopilot(sim: Sim, moves = 3): number {
  let done = 0;
  for (let i = 0; i < moves; i++) {
    const move = decide(sim);
    if (!move) break;
    if (move.add !== undefined && !sim.addRame(move.add)) break;
    if (move.remove !== undefined && !sim.removeRame(move.remove)) break;
    done++;
  }
  return done;
}
