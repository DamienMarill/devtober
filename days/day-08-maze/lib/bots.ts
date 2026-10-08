import { Bureau, type BureauInit } from './bureau';
import type { Dossier, Exigence } from './model';
import { Rng } from './rng';
import { applyAction, solve } from './solve';

/**
 * Les bots du simulateur d'équilibrage : ils jouent la journée avec le vrai moteur et le vrai solveur, mais au
 * lieu de bouger une souris ils « attendent » le temps qu'un humain mettrait. Les temps sont tirés dans une loi
 * log-normale (médiane = la table du GDD, σ = 0,35) ; les erreurs, selon p_err : une exigence oubliée.
 */
export type Profil = 'novice' | 'intermediaire' | 'expert';

/** Temps par exigence, lecture de la ligne comprise (s) : [novice, expert]. */
export const TEMPS = {
  case: [2, 1],
  verifier: [3, 1.5],
  tampon: [4, 2],
  signer: [5, 2.5],
  dateur: [7, 3],
  ecrire: [9, 5],
  archives: [15, 7],
} as const;

const SURCOUT = { novice: 4, intermediaire: 3, expert: 2 };
const SIGMA = 0.35;

function median(key: keyof typeof TEMPS, profil: Profil): number {
  const [n, e] = TEMPS[key];
  return profil === 'novice' ? n : profil === 'expert' ? e : Math.sqrt(n * e);
}

/** La médiane du temps d'une exigence pour un profil. */
export function tempsExigence(ex: Exigence, profil: Profil, fouillis: number): number {
  switch (ex.geste) {
    case 'cocher':
      return median('case', profil) + (ex.annuler ? median('tampon', profil) : 0);
    case 'tamponner':
      return ex.date
        ? median('dateur', profil)
        : median('tampon', profil) * (1 + 0.5 * ((ex.superposes ?? 1) - 1));
    case 'signer':
      return median('signer', profil);
    case 'parapher':
      return median('signer', profil) * 0.6;
    case 'ecrire':
      return median('ecrire', profil);
    case 'joindre':
      return median('archives', profil) * fouillis;
    case 'lire':
    case 'memo':
      return median('verifier', profil);
    default:
      return 0;
  }
}

export interface BotDay {
  effondre: boolean;
  hauteurMax: number;
  score: number;
  objectif: number;
  traites: number;
  arrives: number;
}

/** Joue une journée entière avec un bot. */
export function playDay(init: BureauInit, profil: Profil, botSeed: number): BotDay {
  const b = new Bureau(init);
  const rng = new Rng(botSeed);
  const pErr =
    profil === 'novice'
      ? b.params.pErr.novice
      : profil === 'expert'
        ? b.params.pErr.expert
        : (b.params.pErr.novice + b.params.pErr.expert) / 2;
  let busyUntil = 0;
  let hauteurMax = b.hauteur();
  const dt = 0.25;
  const plan = (d: Dossier): number => {
    const retour = d.retours.length > 0;
    const exs = d.exigences;
    const mean =
      exs.reduce((s, e) => s + tempsExigence(e, profil, b.params.fouillis), 0) /
      Math.max(1, exs.length);
    const base = retour
      ? 3 + mean
      : exs.reduce(
          (s, e) => s + rng.lognormal(tempsExigence(e, profil, b.params.fouillis) || 0.01, SIGMA),
          0,
        );
    return SURCOUT[profil] + base;
  };
  while (b.phase !== 'fini' && b.phase !== 'effondre') {
    b.tick(dt);
    hauteurMax = Math.max(hauteurMax, b.hauteur());
    if (!b.courant && b.pile.length && b.phase === 'travail' && b.t >= busyUntil) {
      b.prendre();
      busyUntil = b.t + plan(b.current()!);
    }
    const d = b.current();
    if (d && b.t >= busyUntil) {
      const present = new Set(
        [...b.pieces.values()].filter((p) => p.lieu === 'sousmain').map((p) => p.uid),
      );
      const actions = solve(d, b.pieces, b.ctx, present);
      const skip = actions.length && rng.chance(pErr) ? rng.int(0, actions.length - 1) : -1;
      actions.forEach((a, i) => i !== skip && applyAction(a, d, b.pieces, b.seq));
      const ordre = [...b.pieces.values()]
        .filter((p) => p.lieu === 'sousmain' && p.dossier === d.id && !p.leurre)
        .map((p) => p.uid);
      b.fermer(ordre);
      b.transmettre();
    }
  }
  return {
    effondre: b.phase === 'effondre',
    hauteurMax,
    score: b.score,
    objectif: b.params.objectif,
    traites: b.stats.traites,
    arrives: b.dossiers.size,
  };
}
