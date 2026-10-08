import type { Ink, Piece, Pt, Rect, StampId } from './model';

/**
 * La géométrie du bureau, en pixels logiques de la scène 1280 × 720 (maquette du GDD) : la pile à gauche, le
 * travail au centre, la sortie à droite. La souris suit le trajet du dossier.
 */
export const R = {
  mur: { x: 0, y: 0, w: 1280, h: 132 },
  horloge: { x: 140, y: 20, w: 92, h: 92 },
  memo: { x: 336, y: 14, w: 262, h: 108 },
  fenetre: { x: 622, y: 16, w: 220, h: 104 },
  porte: { x: 1074, y: 6, w: 160, h: 126 },
  tube: { x: 44, y: 134, w: 76, h: 30 },
  pile: { x: 26, y: 176, w: 210, h: 474 },
  corbeille: { x: 40, y: 658, w: 176, h: 58 },
  sousmain: { x: 256, y: 150, w: 670, h: 414 },
  chemise: { x: 262, y: 156, w: 236, h: 402 },
  rabat: { x: 300, y: 540, w: 160, h: 24 },
  pot: { x: 256, y: 578, w: 132, h: 136 },
  tampons: { x: 400, y: 576, w: 338, h: 138 },
  compteur: { x: 752, y: 584, w: 172, h: 54 },
  calendrier: { x: 770, y: 644, w: 136, h: 68 },
  sortant: { x: 970, y: 152, w: 290, h: 156 },
  archives: { x: 970, y: 560, w: 290, h: 152 },
  deco: { x: 970, y: 320, w: 290, h: 230 },
  // Vue Archives (en surimpression).
  onglet: { x: 430, y: 662, w: 420, h: 58 },
  poignee: { x: 560, y: 4, w: 160, h: 40 },
} as const satisfies Record<string, Rect>;

/** Hauteur d'une unité d'épaisseur dans la pile, et la base de la pile. */
export const PILE = { base: 648, unit: 38, x: 46, w: 170 };

/** Le dossier fermé, posé au centre du sous-main. */
export const FOLDER = { w: 240, h: 168, x: 590, y: 352 };

export const POT_ITEMS = [
  { id: 'bleu', rect: { x: 268, y: 584, w: 32, h: 124 } },
  { id: 'rouge', rect: { x: 304, y: 584, w: 32, h: 124 } },
  { id: 'loupe', rect: { x: 340, y: 590, w: 44, h: 118 } },
] as const;

export const STAMP_ORDER: readonly StampId[] = [
  'VU',
  'CONFORME',
  'APPROUVE',
  'IRRECEVABLE',
  'ANNULE',
  'RECU_LE',
];

/** Les poignées des tampons sur le carrousel. */
export function stampSlot(id: StampId): Rect {
  const i = STAMP_ORDER.indexOf(id);
  return { x: 408 + i * 54, y: 582, w: 50, h: 78 };
}

export const INKS: readonly Ink[] = ['noir', 'rouge', 'bleu', 'violet'];
export const INK_COLOR: Record<Ink, string> = {
  noir: '#1E1E22',
  rouge: '#B3261E',
  bleu: '#1F4FA3',
  violet: '#5B3A8C',
};

export function inkWell(ink: Ink): Rect {
  return { x: 408 + INKS.indexOf(ink) * 38, y: 666, w: 34, h: 42 };
}

/** Les trois molettes du dateur (jour, mois, année). */
export function daterWheel(i: 0 | 1 | 2): Rect {
  return { x: 568 + [0, 40, 80][i], y: 666, w: i === 2 ? 82 : 36, h: 42 };
}

/** Taille d'une empreinte selon le tampon. */
export const PRINT_SIZE: Record<StampId, { w: number; h: number }> = {
  VU: { w: 58, h: 34 },
  CONFORME: { w: 96, h: 32 },
  APPROUVE: { w: 96, h: 32 },
  IRRECEVABLE: { w: 116, h: 32 },
  ANNULE: { w: 92, h: 32 },
  RECU_LE: { w: 96, h: 44 },
};

export const inside = (p: Pt, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Du repère de la scène au repère d'une pièce (rotation autour de son centre). */
export function toLocal(piece: Pick<Piece, 'x' | 'y' | 'rot' | 'w' | 'h'>, p: Pt): Pt {
  const a = (-piece.rot * Math.PI) / 180;
  const dx = p.x - piece.x;
  const dy = p.y - piece.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + piece.w / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + piece.h / 2,
  };
}

export function toWorld(piece: Pick<Piece, 'x' | 'y' | 'rot' | 'w' | 'h'>, l: Pt): Pt {
  const a = (piece.rot * Math.PI) / 180;
  const dx = l.x - piece.w / 2;
  const dy = l.y - piece.h / 2;
  return {
    x: piece.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: piece.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export function hitPiece(piece: Piece, p: Pt): Pt | null {
  const l = toLocal(piece, p);
  return l.x >= 0 && l.x <= piece.w && l.y >= 0 && l.y <= piece.h ? l : null;
}
