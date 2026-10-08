import type { Ink, Piece, Pt, Rect, StampId } from './model';

/**
 * La géométrie du bureau, en pixels logiques de la scène 1280 × 720 (maquette du GDD) : la pile à gauche, le
 * travail au centre, la sortie à droite. La souris suit le trajet du dossier.
 */
export const R = {
  mur: { x: 0, y: 0, w: 1280, h: 104 },
  horloge: { x: 148, y: 12, w: 80, h: 80 },
  memo: { x: 318, y: 8, w: 252, h: 88 },
  fenetre: { x: 604, y: 10, w: 206, h: 84 },
  porte: { x: 1104, y: 2, w: 150, h: 102 },
  tube: { x: 40, y: 106, w: 76, h: 26 },
  pile: { x: 18, y: 146, w: 186, h: 466 },
  corbeille: { x: 26, y: 626, w: 172, h: 88 },
  sousmain: { x: 212, y: 112, w: 806, h: 486 },
  chemise: { x: 218, y: 118, w: 300, h: 452 },
  rabat: { x: 288, y: 570, w: 160, h: 26 },
  pot: { x: 212, y: 604, w: 112, h: 112 },
  tampons: { x: 332, y: 604, w: 510, h: 112 },
  compteur: { x: 850, y: 606, w: 168, h: 52 },
  calendrier: { x: 870, y: 662, w: 128, h: 54 },
  sortant: { x: 1030, y: 112, w: 240, h: 150 },
  archives: { x: 1030, y: 478, w: 240, h: 238 },
  deco: { x: 1030, y: 270, w: 240, h: 200 },
  // Vue Archives (en surimpression).
  onglet: { x: 430, y: 662, w: 420, h: 58 },
  poignee: { x: 560, y: 4, w: 160, h: 40 },
} as const satisfies Record<string, Rect>;

/** Hauteur d'une unité d'épaisseur dans la pile, et la base de la pile. */
export const PILE = { base: 612, unit: 36, x: 34, w: 154 };

/** Le dossier fermé, posé au centre du sous-main. */
export const FOLDER = { w: 288, h: 200, x: 660, y: 350 };

export const POT_ITEMS = [
  { id: 'bleu', rect: { x: 222, y: 608, w: 30, h: 104 } },
  { id: 'rouge', rect: { x: 256, y: 608, w: 30, h: 104 } },
  { id: 'loupe', rect: { x: 290, y: 612, w: 32, h: 100 } },
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
  return { x: 338 + i * 57, y: 608, w: 53, h: 104 };
}

export const INKS: readonly Ink[] = ['noir', 'rouge', 'bleu', 'violet'];
export const INK_COLOR: Record<Ink, string> = {
  noir: '#1E1E22',
  rouge: '#B3261E',
  bleu: '#1F4FA3',
  violet: '#5B3A8C',
};

export function inkWell(ink: Ink): Rect {
  return { x: 690 + INKS.indexOf(ink) * 38, y: 608, w: 34, h: 48 };
}

/** Les trois molettes du dateur (jour, mois, année). */
export function daterWheel(i: 0 | 1 | 2): Rect {
  return { x: 690 + [0, 38, 76][i], y: 662, w: i === 2 ? 76 : 34, h: 50 };
}

/** Taille d'une empreinte selon le tampon. */
export const PRINT_SIZE: Record<StampId, { w: number; h: number }> = {
  VU: { w: 70, h: 40 },
  CONFORME: { w: 118, h: 38 },
  APPROUVE: { w: 118, h: 38 },
  IRRECEVABLE: { w: 140, h: 38 },
  ANNULE: { w: 112, h: 38 },
  RECU_LE: { w: 118, h: 54 },
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
