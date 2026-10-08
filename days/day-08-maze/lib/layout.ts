import type { Bloc, Face, Field, Format, LaidBloc, Rect } from './model';

/**
 * Mise en page des pièces : chaque bloc reçoit un rectangle, chaque champ un cadre. La même fonction sert au
 * rendu (le DOM place les blocs à ces positions) et aux règles (le centre d'un tampon dans un cadre) : ce que le
 * joueur voit est exactement ce que le jeu vérifie.
 */
export const FORMATS: Record<Format, { w: number; h: number; pad: number }> = {
  a4: { w: 190, h: 262, pad: 12 },
  demi: { w: 190, h: 150, pad: 11 },
  ticket: { w: 108, h: 176, pad: 8 },
  carte: { w: 176, h: 112, pad: 9 },
  photo: { w: 124, h: 150, pad: 8 },
  etiquette: { w: 136, h: 124, pad: 9 },
  bordereau: { w: 214, h: 360, pad: 11 },
  fiche: { w: 186, h: 150, pad: 10 },
};

/** Corps, interligne et chasse moyenne (en em) de chaque style de texte : de quoi estimer les retours à la ligne. */
export const TYPO = {
  titre: { size: 11, lh: 13, chasse: 0.52 },
  meta: { size: 8.5, lh: 10.5, chasse: 0.47 },
  texte: { size: 9.5, lh: 11.5, chasse: 0.46 },
  gras: { size: 9.5, lh: 11.5, chasse: 0.5 },
  manuscrit: { size: 12, lh: 13, chasse: 0.44 },
  machine: { size: 8.5, lh: 11, chasse: 0.62 },
  petit: { size: 6, lh: 7, chasse: 0.47 },
  ligne: { size: 9.5, lh: 11.5, chasse: 0.47 },
  valeur: { size: 9.5, lh: 12.5, chasse: 0.47 },
  label: { size: 8, lh: 10, chasse: 0.47 },
} as const;

export const GAP = 3;
export const CASE = 11;
export const SIGNATURE_H = 40;
export const CACHET = { w: 88, h: 52 };
export const PARAPHE = { w: 40, h: 24 };
export const CHAMP_H = 17;

/** Nombre de lignes d'un texte de `width` px dans le style donné (estimation prudente, mot à mot). */
export function lineCount(text: string, width: number, style: keyof typeof TYPO): number {
  const { size, chasse } = TYPO[style];
  const perLine = Math.max(4, Math.floor(width / (size * chasse)));
  let lines = 0;
  for (const para of text.split('\n')) {
    let current = 0;
    let count = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (current === 0) current = len;
      else if (current + 1 + len <= perLine) current += 1 + len;
      else {
        count++;
        current = len;
      }
      while (current > perLine) {
        count++;
        current -= perLine;
      }
    }
    lines += count;
  }
  return lines;
}

export interface Layout {
  laid: LaidBloc[];
  fields: Field[];
  /** Bas du dernier bloc. */
  bottom: number;
}

/** Place les blocs l'un sous l'autre, de haut en bas ; le paraphe va dans le coin inférieur droit. */
export function layoutBlocs(
  blocs: readonly Bloc[],
  format: Format,
  face: Face,
  height?: number,
): Layout {
  const { w, pad } = FORMATS[format];
  const h = height ?? FORMATS[format].h;
  const inner = w - 2 * pad;
  const laid: LaidBloc[] = [];
  const fields: Field[] = [];
  let y = pad;
  const push = (bloc: Bloc, rect: Rect) => {
    laid.push({ bloc, rect });
    y = rect.y + rect.h + GAP;
  };

  for (const bloc of blocs) {
    switch (bloc.t) {
      case 'titre': {
        const n = lineCount(bloc.texte, inner, 'titre');
        push(bloc, { x: pad, y, w: inner, h: n * TYPO.titre.lh });
        break;
      }
      case 'meta': {
        const n = lineCount(bloc.texte, inner, 'meta');
        push(bloc, { x: pad, y, w: inner, h: n * TYPO.meta.lh });
        break;
      }
      case 'texte': {
        const style =
          bloc.style === 'manuscrit'
            ? 'manuscrit'
            : bloc.style === 'machine'
              ? 'machine'
              : bloc.style === 'petit'
                ? 'petit'
                : bloc.style === 'gras'
                  ? 'gras'
                  : 'texte';
        const n = lineCount(bloc.texte, inner, style);
        push(bloc, { x: pad, y, w: inner, h: n * TYPO[style].lh });
        break;
      }
      case 'ligne': {
        const n = lineCount(bloc.texte, inner - 14, 'ligne');
        push(bloc, { x: pad, y, w: inner, h: n * TYPO.ligne.lh + 1 });
        break;
      }
      case 'valeur': {
        const n = lineCount(`${bloc.label} : ${bloc.valeur}`, inner, 'valeur');
        push(bloc, { x: pad, y, w: inner, h: n * TYPO.valeur.lh });
        break;
      }
      case 'champ': {
        const rect = { x: pad, y, w: inner, h: TYPO.label.lh + CHAMP_H };
        const box = { x: pad, y: y + TYPO.label.lh, w: inner, h: CHAMP_H };
        fields.push({ id: bloc.id, kind: 'champ', label: bloc.label, face, rect: box, zone: rect });
        push(bloc, rect);
        break;
      }
      case 'case': {
        const n = lineCount(bloc.label, inner - CASE - 5, 'texte');
        const rect = { x: pad, y, w: inner, h: Math.max(CASE + 2, n * TYPO.texte.lh + 1) };
        const box = { x: pad, y: y + 1, w: CASE, h: CASE };
        fields.push({ id: bloc.id, kind: 'case', label: bloc.label, face, rect: box, zone: rect });
        push(bloc, rect);
        break;
      }
      case 'signature': {
        const sw = Math.min(inner, 168);
        const rect = { x: pad, y, w: sw, h: TYPO.label.lh + SIGNATURE_H };
        const box = { x: pad, y: y + TYPO.label.lh, w: sw, h: SIGNATURE_H };
        fields.push({
          id: bloc.id,
          kind: 'signature',
          label: bloc.label,
          face,
          rect: box,
          zone: box,
        });
        push(bloc, rect);
        break;
      }
      case 'cachet': {
        const rect = { x: pad, y, w: CACHET.w, h: CACHET.h };
        fields.push({ id: bloc.id, kind: 'cachet', label: bloc.label, face, rect, zone: rect });
        push(bloc, rect);
        break;
      }
      case 'pied': {
        const sw = inner - CACHET.w - 6;
        const sig = { x: pad, y, w: sw, h: CACHET.h };
        const cachet = { x: pad + sw + 6, y, w: CACHET.w, h: CACHET.h };
        fields.push({
          id: bloc.signature.id,
          kind: 'signature',
          label: bloc.signature.label,
          face,
          rect: sig,
          zone: sig,
        });
        fields.push({
          id: bloc.cachet.id,
          kind: 'cachet',
          label: bloc.cachet.label,
          face,
          rect: cachet,
          zone: cachet,
        });
        push(bloc, { x: pad, y, w: inner, h: CACHET.h });
        break;
      }
      case 'paraphe': {
        const rect = {
          x: w - pad - PARAPHE.w,
          y: h - pad - PARAPHE.h + 4,
          w: PARAPHE.w,
          h: PARAPHE.h,
        };
        fields.push({ id: bloc.id, kind: 'paraphe', label: 'Paraphe', face, rect, zone: rect });
        laid.push({ bloc, rect });
        break;
      }
      case 'motif': {
        push(bloc, { x: pad, y, w: inner, h: bloc.hauteur ?? 40 });
        break;
      }
      case 'espace': {
        y += bloc.h;
        break;
      }
    }
  }
  const bottom = laid
    .filter((l) => l.bloc.t !== 'paraphe')
    .reduce((m, l) => Math.max(m, l.rect.y + l.rect.h), pad);
  return { laid, fields, bottom };
}
