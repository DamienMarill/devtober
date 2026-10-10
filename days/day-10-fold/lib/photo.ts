import { fibers, rng } from './patterns';

/** Un rectangle en pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** L'éclairage d'un décor : ciel et sol (lumière hémisphérique), soleil, lumière d'appoint. */
export interface Mood {
  readonly sky: number;
  readonly ground: number;
  readonly ambient: number;
  readonly sun: number;
  readonly sunIntensity: number;
  readonly fill: number;
}

/**
 * Un décor pour le mode photo : un fond peint en 2D (le même à l'écran et sur la photo), avec ou sans le
 * tapis de découpe, et un éclairage assorti.
 */
export interface Decor {
  readonly id: string;
  readonly name: string;
  /** Aperçu CSS pour le bouton. */
  readonly swatch: string;
  /** Le tapis de découpe reste sous le modèle ; sinon, seule son ombre se pose sur le fond. */
  readonly mat: boolean;
  readonly shadow: number;
  readonly mood: Mood;
  /** Peint le fond sur tout le canvas, la composition étant calée sur le cadre `r`. */
  readonly paint: (ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) => void;
}

function radial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: [number, string][],
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function vertical(
  ctx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  stops: [number, string][],
) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** L'atelier : la nuit du site, un halo au centre et une lueur rose en haut à droite. */
function atelier(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) {
  ctx.fillStyle = '#0e0a35';
  ctx.fillRect(0, 0, w, h);
  const s = Math.max(r.w, r.h);
  ctx.fillStyle = radial(ctx, r.x + r.w / 2, r.y + r.h * 0.45, s * 0.75, [
    [0, '#241c6b'],
    [1, 'rgba(36, 28, 107, 0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = radial(ctx, r.x + r.w * 0.85, r.y + r.h * 0.1, s * 0.5, [
    [0, 'rgba(255, 202, 236, 0.12)'],
    [1, 'rgba(255, 202, 236, 0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
}

/** Washi : un fond de studio en papier crème, lumière douce au centre. */
function washi(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) {
  ctx.fillStyle = vertical(ctx, r.y, r.y + r.h, [
    [0, '#efe4d0'],
    [0.62, '#f8f1e4'],
    [1, '#e6d8bf'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = radial(ctx, r.x + r.w / 2, r.y + r.h * 0.55, Math.max(r.w, r.h) * 0.6, [
    [0, 'rgba(255, 252, 245, 0.85)'],
    [1, 'rgba(255, 252, 245, 0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  fibers(ctx, Math.max(w, h), 2.4, 21);
}

/** Nuit étoilée : un dégradé indigo, des étoiles et un croissant de lune. */
function nuit(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) {
  ctx.fillStyle = vertical(ctx, r.y, r.y + r.h, [
    [0, '#04051a'],
    [0.7, '#141857'],
    [1, '#2a2470'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const rand = rng(4);
  const s = Math.min(r.w, r.h);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const big = rand() < 0.08;
    ctx.fillStyle = `rgba(255, ${235 + rand() * 20}, ${220 + rand() * 35}, ${0.35 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, (big ? 1.6 : 0.7) * (s / 600), 0, Math.PI * 2);
    ctx.fill();
  }
  const mx = r.x + r.w * 0.8;
  const my = r.y + r.h * 0.17;
  const mr = s * 0.07;
  ctx.fillStyle = radial(ctx, mx, my, mr * 4, [
    [0, 'rgba(255, 244, 214, 0.35)'],
    [1, 'rgba(255, 244, 214, 0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  ctx.fillStyle = vertical(ctx, r.y, r.y + r.h, [
    [0, '#04051a'],
    [1, '#141857'],
  ]);
  ctx.beginPath();
  ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hanami : l'aube rose sous les cerisiers, des fleurs floues au premier plan. */
function hanami(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) {
  ctx.fillStyle = vertical(ctx, r.y, r.y + r.h, [
    [0, '#ffe9f0'],
    [0.55, '#ffd0de'],
    [1, '#f2a9bf'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const s = Math.max(r.w, r.h);
  ctx.fillStyle = radial(ctx, r.x + r.w * 0.3, r.y + r.h * 0.25, s * 0.45, [
    [0, 'rgba(255, 250, 240, 0.9)'],
    [1, 'rgba(255, 250, 240, 0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  // Le bokeh : des disques flous de toutes les tailles.
  const rand = rng(12);
  for (let i = 0; i < 46; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const rr = (0.01 + rand() * 0.05) * s;
    ctx.fillStyle = radial(ctx, x, y, rr, [
      [0, `rgba(255, ${170 + rand() * 60}, ${200 + rand() * 40}, ${0.25 + rand() * 0.3})`],
      [1, 'rgba(255, 200, 220, 0)'],
    ]);
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

/** Fuji : une estampe, ciel d'or, soleil rouge et le mont enneigé derrière le modèle. */
function fuji(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rect) {
  ctx.fillStyle = vertical(ctx, r.y, r.y + r.h, [
    [0, '#fbe3b4'],
    [0.6, '#f6b48f'],
    [1, '#e98f7e'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(r.w, r.h);
  const cx = r.x + r.w / 2;
  // Le soleil, un peu à gauche du sommet.
  ctx.fillStyle = '#d8413a';
  ctx.beginPath();
  ctx.arc(cx - s * 0.24, r.y + r.h * 0.3, s * 0.13, 0, Math.PI * 2);
  ctx.fill();
  // Le mont : un trapèze aux flancs concaves, sommet aplati.
  const base = r.y + r.h * 0.86;
  const top = r.y + r.h * 0.36;
  const half = Math.max(r.w * 0.75, s * 0.9);
  const summit = s * 0.09;
  const flank = (side: 1 | -1, k: number) => {
    const x = cx + side * (summit + (half - summit) * k ** 1.6);
    return [x, top + (base - top) * k] as const;
  };
  ctx.fillStyle = '#2e3d72';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let k = 1; k >= 0; k -= 0.05) ctx.lineTo(...flank(-1, k));
  for (let k = 0; k <= 1.0001; k += 0.05) ctx.lineTo(...flank(1, k));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // La neige du sommet, en dents de scie.
  ctx.fillStyle = '#f6f1e6';
  ctx.beginPath();
  const snow = 0.3;
  ctx.moveTo(...flank(-1, snow));
  for (let k = snow; k >= 0; k -= 0.05) ctx.lineTo(...flank(-1, k));
  for (let k = 0; k <= snow; k += 0.05) ctx.lineTo(...flank(1, k));
  const [rx, ry] = flank(1, snow);
  const [lx] = flank(-1, snow);
  for (let i = 1; i <= 6; i++) {
    const x = rx + ((lx - rx) * i) / 6;
    ctx.lineTo(x + (lx - rx) / 12, ry + (i % 2 ? s * 0.04 : -s * 0.005));
  }
  ctx.closePath();
  ctx.fill();
  // La brume au pied du mont.
  ctx.fillStyle = vertical(ctx, base - s * 0.2, base + s * 0.1, [
    [0, 'rgba(255, 236, 222, 0)'],
    [1, 'rgba(255, 236, 222, 0.75)'],
  ]);
  ctx.fillRect(0, base - s * 0.2, w, h - base + s * 0.2);
}

export const DECORS: readonly Decor[] = [
  {
    id: 'atelier',
    name: 'Atelier',
    swatch: 'radial-gradient(circle at 50% 45%, #2f2590, #0e0a35 70%)',
    mat: true,
    shadow: 0,
    mood: {
      sky: 0xfff4ea,
      ground: 0x2b2466,
      ambient: 1.5,
      sun: 0xfff0dc,
      sunIntensity: 1.9,
      fill: 1.05,
    },
    paint: atelier,
  },
  {
    id: 'washi',
    name: 'Washi',
    swatch: 'radial-gradient(circle at 50% 55%, #fffaf0, #e6d8bf 75%)',
    mat: false,
    shadow: 0.12,
    mood: {
      sky: 0xfff8ee,
      ground: 0xcdb89a,
      ambient: 1.6,
      sun: 0xfff3e0,
      sunIntensity: 1.7,
      fill: 0.95,
    },
    paint: washi,
  },
  {
    id: 'nuit',
    name: 'Nuit étoilée',
    swatch: 'radial-gradient(circle at 75% 25%, #fff3d6 6%, #141857 9%, #04051a 80%)',
    mat: false,
    shadow: 0,
    mood: {
      sky: 0xb9c6ff,
      ground: 0x141033,
      ambient: 1.15,
      sun: 0xd4dcff,
      sunIntensity: 1.35,
      fill: 0.9,
    },
    paint: nuit,
  },
  {
    id: 'hanami',
    name: 'Hanami',
    swatch: 'linear-gradient(#ffe9f0, #f2a9bf)',
    mat: false,
    shadow: 0.1,
    mood: {
      sky: 0xfff0f5,
      ground: 0xe8a0b5,
      ambient: 1.5,
      sun: 0xffe8ee,
      sunIntensity: 1.6,
      fill: 0.95,
    },
    paint: hanami,
  },
  {
    id: 'fuji',
    name: 'Fuji',
    swatch:
      'radial-gradient(circle at 35% 35%, #d8413a 18%, transparent 20%), linear-gradient(#fbe3b4 55%, #2e3d72 56%)',
    mat: false,
    shadow: 0,
    mood: {
      sky: 0xffe6c4,
      ground: 0x6b4a6e,
      ambient: 1.4,
      sun: 0xffd9a0,
      sunIntensity: 1.8,
      fill: 0.9,
    },
    paint: fuji,
  },
];

/** Peint le décor dans un canvas affiché (net sur écran haute densité), calé sur le viseur `r`. */
export function paintBackdrop(canvas: HTMLCanvasElement, decor: Decor, r?: Rect) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  decor.paint(ctx, w, h, r ?? { x: 0, y: 0, w, h });
}

// ───────────────────────────── filtres

/** Une opération de filtre CSS, appliquée telle quelle à l'aperçu et recalculée sur les pixels de la photo. */
type Op = readonly ['sepia' | 'grayscale' | 'saturate' | 'contrast' | 'brightness', number];

export interface PhotoFilter {
  readonly id: string;
  readonly name: string;
  readonly ops: readonly Op[];
  /** Grain ajouté à la photo (amplitude sur 255). */
  readonly grain: number;
}

export const FILTERS: readonly PhotoFilter[] = [
  { id: 'naturel', name: 'Naturel', ops: [], grain: 0 },
  {
    id: 'washi',
    name: 'Washi',
    ops: [
      ['sepia', 0.35],
      ['contrast', 0.92],
      ['brightness', 1.06],
    ],
    grain: 9,
  },
  {
    id: 'pop',
    name: 'Pop',
    ops: [
      ['saturate', 1.45],
      ['contrast', 1.08],
    ],
    grain: 0,
  },
  {
    id: 'nb',
    name: 'N&B',
    ops: [
      ['grayscale', 1],
      ['contrast', 1.15],
    ],
    grain: 6,
  },
];

/** Le filtre CSS de l'aperçu. */
export const filterCss = (f: PhotoFilter) =>
  f.ops.map(([k, x]) => `${k}(${x})`).join(' ') || 'none';

/** Une transformation affine des couleurs (3 × 4, sur 0..1), comme les fonctions de filtre CSS. */
type Affine = number[];

function matrixOf([kind, a]: Op): Affine {
  switch (kind) {
    case 'sepia': {
      const k = 1 - a;
      // prettier-ignore
      return [
        0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0,
        0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0,
        0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0,
      ];
    }
    case 'grayscale': {
      const k = 1 - a;
      // prettier-ignore
      return [
        0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0,
        0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0,
        0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k, 0,
      ];
    }
    case 'saturate':
      // prettier-ignore
      return [
        0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0,
      ];
    case 'contrast':
      return [a, 0, 0, 0.5 - 0.5 * a, 0, a, 0, 0.5 - 0.5 * a, 0, 0, a, 0.5 - 0.5 * a];
    case 'brightness':
      return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
  }
}

/** `m` puis `n`. */
function chain(m: Affine, n: Affine): Affine {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++)
      out.push(n[r * 4] * m[c] + n[r * 4 + 1] * m[4 + c] + n[r * 4 + 2] * m[8 + c]);
    out.push(n[r * 4] * m[3] + n[r * 4 + 1] * m[7] + n[r * 4 + 2] * m[11] + n[r * 4 + 3]);
  }
  return out;
}

/** Applique le filtre aux pixels de `canvas` (zone `r`), en une passe, puis le grain. */
export function applyFilter(canvas: HTMLCanvasElement, f: PhotoFilter, r?: Rect) {
  if (!f.ops.length && !f.grain) return;
  const ctx = canvas.getContext('2d')!;
  const { x, y, w, h } = r ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const m = f.ops.map(matrixOf).reduce(chain, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  const rand = rng(99);
  for (let i = 0; i < d.length; i += 4) {
    const red = d[i] / 255;
    const green = d[i + 1] / 255;
    const blue = d[i + 2] / 255;
    const noise = f.grain ? (rand() - 0.5) * 2 * f.grain : 0;
    d[i] = (m[0] * red + m[1] * green + m[2] * blue + m[3]) * 255 + noise;
    d[i + 1] = (m[4] * red + m[5] * green + m[6] * blue + m[7]) * 255 + noise;
    d[i + 2] = (m[8] * red + m[9] * green + m[10] * blue + m[11]) * 255 + noise;
  }
  ctx.putImageData(img, x, y);
}

// ───────────────────────────── formats et cadres

export interface PhotoFormat {
  readonly id: string;
  readonly name: string;
  /** Largeur / hauteur de la photo (sans le cadre). */
  readonly ratio: number;
  /** Largeur de la photo en pixels. */
  readonly width: number;
}

export const FORMATS: readonly PhotoFormat[] = [
  { id: 'carre', name: 'Carré', ratio: 1, width: 1080 },
  { id: 'portrait', name: '4:5', ratio: 4 / 5, width: 1080 },
  { id: 'story', name: 'Story', ratio: 9 / 16, width: 1080 },
  { id: 'paysage', name: '16:9', ratio: 16 / 9, width: 1920 },
];

export interface PhotoFrame {
  readonly id: 'none' | 'polaroid' | 'estampe' | 'devtober';
  readonly name: string;
}

export const FRAMES: readonly PhotoFrame[] = [
  { id: 'polaroid', name: 'Polaroid' },
  { id: 'estampe', name: 'Estampe' },
  { id: 'devtober', name: 'Devtober' },
  { id: 'none', name: 'Sans cadre' },
];

/** Ce que le cadre écrit autour de la photo. */
export interface Caption {
  readonly text: string;
  readonly date: string;
}

const HAND = '"Caveat", "Segoe Print", cursive';
const BRUSH = '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

/** Les polices du mode photo : l'écriture manuscrite du polaroid et le kanji du sceau (sous-ensemble). */
export async function loadPhotoFonts() {
  if (!document.getElementById('origami-photo-fonts')) {
    for (const [id, href] of [
      [
        'origami-photo-fonts',
        'https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap',
      ],
      [
        'origami-photo-kanji',
        'https://fonts.googleapis.com/css2?family=Yuji+Syuku&text=%E6%8A%98&display=swap',
      ],
    ]) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    }
  }
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('600 48px Caveat'),
        document.fonts.load('48px "Yuji Syuku"', '折'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Hors ligne : on garde les polices de secours.
  }
}

/** Écrit `text` en réduisant la police jusqu'à ce qu'il tienne dans `max` pixels de large. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  size: number,
  max: number,
) {
  let px = size;
  ctx.font = font(px);
  while (px > 8 && ctx.measureText(text).width > max) {
    px *= 0.92;
    ctx.font = font(px);
  }
}

/** Le sceau rouge (hanko) avec le kanji « plier ». */
function hanko(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.fillStyle = '#c3352c';
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#f6efe2';
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.roundRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8, size * 0.06);
  ctx.stroke();
  ctx.fillStyle = '#f6efe2';
  ctx.font = `${size * 0.62}px ${BRUSH}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('折', 0, size * 0.03);
  ctx.restore();
}

/** Encadre la photo et écrit la légende. Renvoie un nouveau canvas. */
export function frame(
  photo: HTMLCanvasElement,
  f: PhotoFrame,
  caption: Caption,
): HTMLCanvasElement {
  const W = photo.width;
  const H = photo.height;
  const s = Math.min(W, H);
  const out = document.createElement('canvas');
  const ctx = (w: number, h: number) => {
    out.width = Math.round(w);
    out.height = Math.round(h);
    return out.getContext('2d')!;
  };

  if (f.id === 'none') {
    ctx(W, H).drawImage(photo, 0, 0);
    return out;
  }

  if (f.id === 'polaroid') {
    const pad = s * 0.06;
    const bottom = s * 0.26;
    const c = ctx(W + 2 * pad, H + pad + bottom);
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, out.width, out.height);
    fibers(c, Math.max(out.width, out.height), 1.4, 5);
    c.drawImage(photo, pad, pad);
    // Un liseré d'ombre autour de la photo, comme une vraie épreuve.
    c.strokeStyle = 'rgba(40, 30, 40, 0.18)';
    c.lineWidth = Math.max(1, s * 0.002);
    c.strokeRect(pad, pad, W, H);
    c.fillStyle = '#2a2440';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, caption.text, (px) => `600 ${px}px ${HAND}`, s * 0.085, W * 0.92);
    c.fillText(caption.text, out.width / 2, H + pad + bottom * 0.45);
    c.fillStyle = 'rgba(42, 36, 64, 0.55)';
    c.font = `600 ${s * 0.042}px ${HAND}`;
    c.textAlign = 'right';
    c.fillText(caption.date, out.width - pad, H + pad + bottom * 0.8);
    return out;
  }

  if (f.id === 'estampe') {
    const pad = s * 0.07;
    const bottom = s * 0.17;
    const c = ctx(W + 2 * pad, H + pad + bottom);
    c.fillStyle = '#f1e6d1';
    c.fillRect(0, 0, out.width, out.height);
    fibers(c, Math.max(out.width, out.height), 2.6, 8);
    c.drawImage(photo, pad, pad);
    c.strokeStyle = '#3b2a2a';
    c.lineWidth = Math.max(1, s * 0.004);
    c.strokeRect(pad, pad, W, H);
    c.lineWidth = Math.max(1, s * 0.0015);
    c.strokeRect(pad - s * 0.012, pad - s * 0.012, W + s * 0.024, H + s * 0.024);
    const seal = s * 0.11;
    hanko(c, out.width - pad - seal / 2, H + pad + bottom / 2, seal);
    c.fillStyle = '#3b2a2a';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    fitText(
      c,
      caption.text,
      (px) => `700 ${px}px "Bricolage Grotesque", sans-serif`,
      s * 0.05,
      W - seal * 1.6,
    );
    c.fillText(caption.text, pad, H + pad + bottom * 0.5);
    c.fillStyle = 'rgba(59, 42, 42, 0.65)';
    c.font = `${s * 0.028}px Lato, sans-serif`;
    c.fillText(`Devtober · jour 10 · ${caption.date}`, pad, H + pad + bottom * 0.78);
    return out;
  }

  // Devtober : le bandeau des aperçus du site (numéro et mot à gauche, Marill.dev à droite).
  const band = s * 0.13;
  const c = ctx(W, H + band);
  c.drawImage(photo, 0, 0);
  if (caption.text) {
    const scrim = c.createLinearGradient(0, H - s * 0.22, 0, H);
    scrim.addColorStop(0, 'rgba(14, 10, 53, 0)');
    scrim.addColorStop(1, 'rgba(14, 10, 53, 0.65)');
    c.fillStyle = scrim;
    c.fillRect(0, H - s * 0.22, W, s * 0.22);
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    fitText(
      c,
      caption.text,
      (px) => `700 ${px}px "Bricolage Grotesque", sans-serif`,
      s * 0.055,
      W - s * 0.1,
    );
    c.fillText(caption.text, s * 0.05, H - s * 0.05);
  }
  c.fillStyle = '#0e0a35';
  c.fillRect(0, H, W, band);
  c.fillStyle = 'rgba(255, 255, 255, 0.1)';
  c.fillRect(0, H, W, Math.max(1, s * 0.002));
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = '#a1a1aa';
  c.font = `${band * 0.26}px ui-monospace, Menlo, monospace`;
  c.fillText('#10', s * 0.05, H + band / 2);
  const num = c.measureText('#10 ').width;
  c.fillStyle = '#fff';
  c.font = `600 ${band * 0.32}px "Bricolage Grotesque", sans-serif`;
  c.fillText('Fold', s * 0.05 + num, H + band / 2);
  // Le logo, de droite à gauche : « dev », le point en accent, « Marill ».
  c.textAlign = 'right';
  c.font = `800 ${band * 0.36}px Lato, sans-serif`;
  const right = W - s * 0.05;
  const dev = c.measureText('dev').width;
  const dot = c.measureText('.').width;
  c.fillText('dev', right, H + band / 2);
  c.fillStyle = '#a49cff';
  c.fillText('.', right - dev, H + band / 2);
  c.fillStyle = '#fff';
  c.fillText('Marill', right - dev - dot, H + band / 2);
  return out;
}

// ───────────────────────────── partage

export const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image vide'))), 'image/png'),
  );

/** Le partage natif sait-il envoyer une image (mobiles, Safari, Edge) ? */
export function canShareFiles(): boolean {
  try {
    const file = new File([new Blob()], 'origami.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export const canCopyImage = () =>
  typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

export async function shareImage(blob: Blob, name: string, text: string) {
  const file = new File([blob], name, { type: 'image/png' });
  await navigator.share({ files: [file], text });
}

export function downloadImage(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyImage(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
