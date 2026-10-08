import { CONFIG } from './config';
import type { Bureau } from './bureau';
import type { RetourType } from './model';

/** Le relevé de situation tapé à la machine à 17 h. */
export interface Releve {
  jour: number;
  nom: string;
  date: string;
  traites: number;
  retours: Record<RetourType, number>;
  classes: number;
  transferes: number;
  /** Temps moyen de traitement (s réelles), ou null. */
  tempsMoyen: number | null;
  score: number;
  objectif: number;
  note: 'A' | 'B' | 'C' | 'D' | 'E';
  avertissement: boolean;
  /** Le dossier revenu le plus souvent, avec son motif le plus absurde : le moment à partager. */
  dossierDuJour: {
    numero: string;
    titre: string;
    nom: string;
    retours: number;
    motif: string;
  } | null;
}

export function noteFor(score: number, objectif: number): Releve['note'] {
  const ratio = objectif > 0 ? score / objectif : 1;
  // Un score négatif (le reliquat transféré chez Gérard) vaut E, comme tout ce qui est sous 80 %.
  return CONFIG.notes.find((n) => ratio >= n.min)?.note ?? 'E';
}

const ABSURDITY: Record<RetourType, number> = { R3: 3, R2: 2, NON_ACCUSE: 1, R1: 0 };

export function releve(bureau: Bureau): Releve {
  const { stats, params } = bureau;
  const note = noteFor(bureau.score, params.objectif);
  let best: Releve['dossierDuJour'] = null;
  for (const d of bureau.dossiers.values()) {
    if (!d.retours.length || (best && d.retours.length <= best.retours)) continue;
    const top = [...d.retours].sort((a, b) => ABSURDITY[b.type] - ABSURDITY[a.type])[0];
    best = {
      numero: d.numero,
      titre: d.titre,
      nom: d.nom,
      retours: d.retours.length,
      motif: top.motifs[0] ?? '',
    };
  }
  return {
    jour: params.numero,
    nom: params.nom,
    date: params.date,
    traites: stats.traites,
    retours: { ...stats.retours },
    classes: stats.classes,
    transferes: stats.transferes,
    tempsMoyen: stats.durees.length
      ? stats.durees.reduce((a, b) => a + b, 0) / stats.durees.length
      : null,
    score: bureau.score,
    objectif: params.objectif,
    note,
    avertissement: note === 'D' || note === 'E',
    dossierDuJour: best,
  };
}
