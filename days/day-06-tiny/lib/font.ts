import { Pattern } from './rle';

/**
 * Police pixel 3 × 5 de l'écran LCD : chaque glyphe est une liste de 5 lignes de 3 points (`#` allumé).
 * Les lettres accentuées sont ramenées à leur lettre de base.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '##.|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|##.|.##',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '##.|..#|.#.|#..|###',
  '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|##.|..#|##.',
  '6': '.##|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|##.',
  '/': '..#|..#|.#.|#..|#..',
  '.': '...|...|...|...|.#.',
  ':': '...|.#.|...|.#.|...',
  '-': '...|...|###|...|...',
  '+': '...|.#.|###|.#.|...',
  '&': '.#.|#.#|.#.|#.#|.##',
  "'": '.#.|.#.|...|...|...',
  '!': '.#.|.#.|.#.|...|.#.',
  '?': '##.|..#|.#.|...|.#.',
  '×': '...|#.#|.#.|#.#|...',
  '·': '...|...|.#.|...|...',
  ' ': '...|...|...|...|...',
};

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;

/** Ramène un texte à ce que la police sait dessiner : majuscules sans accents, inconnus en espace. */
export function toFont(text: string): string {
  return [...text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()]
    .map((c) => (c === '’' ? "'" : GLYPHS[c] ? c : ' '))
    .join('');
}

/** Largeur en points d'un texte, avec un point d'espace entre les lettres. */
export function textWidth(text: string): number {
  const n = [...toFont(text)].length;
  return n ? n * (GLYPH_WIDTH + 1) - 1 : 0;
}

/**
 * Écrit un texte dans une grille de niveaux (`target[y * stride + x] = value` pour chaque point allumé), en
 * coupant ce qui dépasse de `[0, stride) × [0, rows)`. Renvoie l'abscisse qui suit le texte.
 */
export function drawText(
  target: { [i: number]: number },
  stride: number,
  rows: number,
  x: number,
  y: number,
  text: string,
  value: number,
): number {
  for (const c of toFont(text)) {
    const glyph = GLYPHS[c];
    for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
      for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
        if (glyph[gy * 4 + gx] !== '#') continue;
        const px = x + gx;
        const py = y + gy;
        if (px >= 0 && px < stride && py >= 0 && py < rows) target[py * stride + px] = value;
      }
    }
    x += GLYPH_WIDTH + 1;
  }
  return x;
}

/**
 * Un texte en motif de cellules, chaque point agrandi en carré de `scale` × `scale` (le « TINY » de l'intro).
 */
export function textPattern(text: string, scale = 1): Pattern {
  const w = textWidth(text);
  const width = w * scale;
  const height = GLYPH_HEIGHT * scale;
  const small = new Uint8Array(w * GLYPH_HEIGHT);
  drawText(small, w, GLYPH_HEIGHT, 0, 0, text, 1);
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = small[((y / scale) | 0) * w + ((x / scale) | 0)];
    }
  }
  return { width, height, cells };
}
