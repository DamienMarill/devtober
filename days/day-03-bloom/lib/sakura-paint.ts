import { Camera } from './camera';
import { seeded } from './random';
import { Tree, Umbel, Wood } from './sakura';

/**
 * Peinture des cerisiers sur canvas, en couleurs de plein jour (la lumière du moment est appliquée
 * ensuite, d'un bloc, par `tint`). Les fleurs sont des sprites dessinés une fois en vectoriel (cinq
 * pétales échancrés, cœur, étamines), puis posés par dizaines de milliers avec une simple matrice :
 * le détail d'un décor d'anime, sans des mégaoctets de SVG.
 */

/** Teintes de fleur, de l'ombre du cœur de la ramure à la lumière du bord de la couronne. */
const TONES = [
  { tip: '#d9b4c6', body: '#cba0b6', base: '#b07898', edge: 'rgb(110 60 90 / 0.4)' },
  { tip: '#f0dce5', body: '#e5c6d4', base: '#d29ab4', edge: 'rgb(140 80 110 / 0.34)' },
  { tip: '#fff4f7', body: '#f9e3eb', base: '#eeb2c7', edge: 'rgb(180 110 140 / 0.3)' },
  { tip: '#ffffff', body: '#fff7f9', base: '#f8cddb', edge: 'rgb(205 140 165 / 0.26)' },
];
/** Cœurs : jeune (vert-jaune), épanouie (rose), passée (rouge, quand la fleur va tomber). */
const HEARTS = ['#c9cf7e', '#d9628d', '#b4304f'];
const BARK = {
  body: '#3a3136',
  light: '#685b62',
  dark: '#241d21',
  twig: '#5a4a4f',
  lenticel: 'rgb(160 146 150 / 0.32)',
};
const STEM = 'rgb(120 80 86 / 0.45)';

const FLOWER_PX = 72;
/** Rayon de fleur (px) à partir duquel on dessine chaque fleur, puis ses pédoncules. */
export const DETAIL_PX = 4.5;
const STEM_PX = 10;
const SMALL_PX = 40;

type Sprite = HTMLCanvasElement;

interface Sprites {
  /** [teinte][cœur] */
  front: Sprite[][];
  side: Sprite[];
  bud: Sprite[];
  /** Bouquet entier, pour les fleurs trop petites pour être détaillées : [teinte][variante]. */
  umbel: Sprite[][];
}

let cache: Sprites | undefined;

function canvas(size: number): [Sprite, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Un pétale de Somei Yoshino, pointe vers le haut : obovale, échancré au bout. `r` : longueur. */
function petal(ctx: CanvasRenderingContext2D, r: number, width = 1): void {
  const w = width;
  ctx.beginPath();
  ctx.moveTo(0, -0.1 * r);
  ctx.bezierCurveTo(-0.3 * r * w, -0.22 * r, -0.6 * r * w, -0.68 * r, -0.3 * r * w, -0.97 * r);
  ctx.quadraticCurveTo(-0.13 * r * w, -1.03 * r, 0, -0.86 * r);
  ctx.quadraticCurveTo(0.13 * r * w, -1.03 * r, 0.3 * r * w, -0.97 * r);
  ctx.bezierCurveTo(0.6 * r * w, -0.68 * r, 0.3 * r * w, -0.22 * r, 0, -0.1 * r);
  ctx.closePath();
}

/** Une fleur vue de face : cinq pétales en dégradé, liseré, nervure, cœur et étamines. */
function frontFlower(tone: (typeof TONES)[number], heart: string, seed: number): Sprite {
  const [c, ctx] = canvas(FLOWER_PX);
  const random = seeded(seed);
  const r = FLOWER_PX * 0.47;
  ctx.translate(FLOWER_PX / 2, FLOWER_PX / 2);
  const turn = random() * Math.PI;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate(turn + (i * Math.PI * 2) / 5 + (random() - 0.5) * 0.18);
    const g = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    g.addColorStop(0, tone.base);
    g.addColorStop(0.42, tone.body);
    g.addColorStop(1, tone.tip);
    ctx.fillStyle = g;
    petal(ctx, r * (0.94 + random() * 0.1), 0.95 + random() * 0.15);
    ctx.fill();
    ctx.strokeStyle = tone.edge;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Nervure médiane, à peine marquée.
    ctx.strokeStyle = tone.edge;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, -0.2 * r);
    ctx.lineTo(0, -0.62 * r);
    ctx.stroke();
    ctx.restore();
  }
  // Cœur et étamines.
  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  const stamens = 16;
  for (let i = 0; i < stamens; i++) {
    const a = (i / stamens) * Math.PI * 2 + random() * 0.3;
    const len = r * (0.3 + random() * 0.16);
    ctx.strokeStyle = 'rgb(255 236 242 / 0.85)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
    ctx.fillStyle = '#e8c06a';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * len, Math.sin(a) * len, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Une fleur de profil : coupe de trois pétales sur un calice rouge. */
function sideFlower(tone: (typeof TONES)[number]): Sprite {
  const [c, ctx] = canvas(FLOWER_PX);
  const r = FLOWER_PX * 0.42;
  ctx.translate(FLOWER_PX / 2, FLOWER_PX / 2 + r * 0.25);
  for (const [a, w] of [
    [-0.7, 0.85],
    [0.7, 0.85],
    [0, 1],
  ] as const) {
    ctx.save();
    ctx.rotate(a);
    ctx.scale(1, 0.9);
    const g = ctx.createLinearGradient(0, 0, 0, -r);
    g.addColorStop(0, tone.base);
    g.addColorStop(0.5, tone.body);
    g.addColorStop(1, tone.tip);
    ctx.fillStyle = g;
    petal(ctx, r, w);
    ctx.fill();
    ctx.strokeStyle = tone.edge;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#9b3a4e';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.12, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** Un bouton : ovale rose serré dans son calice. */
function bud(color: string): Sprite {
  const [c, ctx] = canvas(FLOWER_PX);
  const r = FLOWER_PX * 0.2;
  ctx.translate(FLOWER_PX / 2, FLOWER_PX / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.3, r * 0.62, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8f3346';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.65, r * 0.4, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** Un bouquet vu de loin : quatre ou cinq fleurs simplifiées, serrées. */
function smallUmbel(tone: (typeof TONES)[number], seed: number): Sprite {
  const [c, ctx] = canvas(SMALL_PX);
  const random = seeded(seed);
  ctx.translate(SMALL_PX / 2, SMALL_PX / 2);
  const n = 4 + Math.floor(random() * 2);
  for (let i = 0; i < n; i++) {
    const a = random() * Math.PI * 2;
    const d = SMALL_PX * (0.08 + random() * 0.17);
    const fx = Math.cos(a) * d;
    const fy = Math.sin(a) * d * 0.8 + SMALL_PX * 0.04;
    const fr = SMALL_PX * (0.13 + random() * 0.05);
    for (let k = 0; k < 5; k++) {
      const pa = random() + (k * Math.PI * 2) / 5;
      ctx.fillStyle = k % 2 ? tone.body : tone.tip;
      ctx.beginPath();
      ctx.arc(
        fx + Math.cos(pa) * fr * 0.55,
        fy + Math.sin(pa) * fr * 0.55,
        fr * 0.55,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = tone.base;
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function sprites(): Sprites {
  cache ??= {
    front: TONES.map((tone, t) =>
      HEARTS.map((heart, h) => frontFlower(tone, heart, t * 10 + h + 1)),
    ),
    side: TONES.map(sideFlower),
    bud: ['#f3a7bf', '#e98fae'].map(bud),
    umbel: TONES.map((tone, t) => [0, 1, 2].map((v) => smallUmbel(tone, t * 7 + v + 3))),
  };
  return cache;
}

/** Bouquets peints entre deux pauses (une pause = l'occasion de rendre la main à l'animation). */
const CHUNK = 350;

/**
 * Peint un arbre dans `ctx` (en plus de ce qui y est déjà), pour la caméra donnée. C'est un générateur :
 * il s'interrompt régulièrement, pour que la peinture s'étale sur plusieurs images sans figer l'animation.
 */
export function* paintTree(
  ctx: CanvasRenderingContext2D,
  tree: Tree,
  camera: Camera,
  dpr: number,
): Generator<void> {
  const k = camera.scale * dpr;
  const view = {
    x0: camera.x - 40,
    y0: camera.y - 40,
    x1: camera.x + camera.w + 40,
    y1: camera.y + camera.h + 40,
  };
  const s = sprites();
  ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);
  // Au fond du tunnel, seules les grosses branches se voient entre les touffes.
  const far = tree.spec.layer === 'far';
  const wood = [...tree.wood].filter((w) => !far || w.depth <= 2).sort((a, b) => a.depth - b.depth);
  for (let i = 0; i < wood.length; i++) {
    paintWood(ctx, wood[i], k, view);
    if (i % 400 === 399) {
      yield;
      ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);
    }
  }
  yield;
  const umbels = tree.umbels
    .filter((u) => u.x > view.x0 && u.x < view.x1 && u.y > view.y0 && u.y < view.y1)
    .sort((a, b) => a.light - b.light);
  for (let i = 0; i < umbels.length; i++) {
    paintUmbel(ctx, umbels[i], k, camera, s);
    if (i % CHUNK === CHUNK - 1) yield;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

function paintWood(
  ctx: CanvasRenderingContext2D,
  w: Wood,
  k: number,
  view: { x0: number; y0: number; x1: number; y1: number },
): void {
  const pts = w.points;
  if (
    !pts.some(
      (p) =>
        p.x > view.x0 - p.r && p.x < view.x1 + p.r && p.y > view.y0 - p.r && p.y < view.y1 + p.r,
    )
  ) {
    return;
  }
  const r0 = pts[0].r;
  if (r0 * k < 1.6) {
    // Rameau fin : un trait.
    ctx.strokeStyle = BARK.twig;
    ctx.lineWidth = Math.max(2 * r0, 0.55 / k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }
  // Branche : silhouette effilée, ombre dessous, lumière dessus, lenticelles horizontales.
  // Le côté éclairé (vers le haut de l'écran) est choisi une fois pour toute la branche : sinon la
  // normale bascule d'un point à l'autre et le liseré de lumière se hache.
  const up = pts[pts.length - 1].x >= pts[0].x ? -1 : 1;
  const outline = (from: number, to: number) => {
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / len) * up;
      const ny = ((b.x - a.x) / len) * up;
      const r = pts[i].r;
      left.push([pts[i].x + nx * r * from, pts[i].y + ny * r * from]);
      right.push([pts[i].x + nx * r * to, pts[i].y + ny * r * to]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  };
  ctx.fillStyle = BARK.body;
  outline(1, -1);
  ctx.fill();
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, last.r, 0, Math.PI * 2);
  ctx.fill();
  if (r0 * k < 3) return;
  ctx.fillStyle = BARK.dark;
  outline(-0.35, -1);
  ctx.fill();
  ctx.fillStyle = BARK.light;
  outline(0.95, 0.45);
  ctx.fill();
  // Lenticelles : les traits clairs qui barrent l'écorce des cerisiers.
  if (r0 * k > 5) {
    const random = seeded(Math.round(pts[0].x * 13 + pts[0].y * 7));
    ctx.strokeStyle = BARK.lenticel;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      if (p.r * k < 4 || random() < 0.35) continue;
      const q = pts[i + 1];
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const off = (random() - 0.5) * 1.2 * p.r * ((q.x - p.x) / len);
      const cx = p.x + ((q.x - p.x) / len) * off;
      const cy = p.y + ((q.y - p.y) / len) * off;
      const half = p.r * (0.25 + random() * 0.35);
      const shift = (random() - 0.5) * p.r;
      ctx.lineWidth = Math.max(0.6 / k, p.r * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx + nx * (shift - half), cy + ny * (shift - half));
      ctx.lineTo(cx + nx * (shift + half), cy + ny * (shift + half));
      ctx.stroke();
    }
  }
}

function paintUmbel(
  ctx: CanvasRenderingContext2D,
  u: Umbel,
  k: number,
  camera: Camera,
  s: Sprites,
): void {
  const tone = Math.min(3, Math.floor(u.light * 4));
  const px = u.size * k;
  const random = seeded(u.seed);
  const ox = -camera.x * k;
  const oy = -camera.y * k;
  if (u.clump || px < DETAIL_PX) {
    // Trop petit pour le détail : le bouquet d'un seul tampon.
    const size = u.size * (u.clump ? 2.9 : 3.4) * k;
    ctx.setTransform(size, 0, 0, size, u.x * k + ox, u.y * k + oy);
    ctx.drawImage(s.umbel[tone][u.seed % 3], -0.5, -0.5, 1, 1);
    return;
  }
  // Les fleurs pendent au bout de leur pédoncule, en éventail vers le bas.
  for (let i = 0; i < u.count; i++) {
    const a = Math.PI / 2 + (random() - 0.5) * 2.6;
    const len = u.size * (0.6 + random() * 1.1);
    const fx = u.x + Math.cos(a) * len;
    const fy = u.y + Math.sin(a) * len * 0.8;
    if (px > STEM_PX) {
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.strokeStyle = STEM;
      ctx.lineWidth = Math.max(0.5 / k, u.size * 0.07);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.quadraticCurveTo(u.x + (fx - u.x) * 0.3, u.y + (fy - u.y) * 0.8, fx, fy);
      ctx.stroke();
    }
    const kind = random();
    const rot = random() * Math.PI * 2;
    const size = u.size * 2.15 * (0.85 + random() * 0.3) * k;
    // Raccourci : une fleur vue de biais s'aplatit le long d'un axe.
    const squash = 0.5 + random() * 0.5;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    let sprite: Sprite;
    let sx = size;
    let sy = size * squash;
    if (kind < 0.1 && px > 6) {
      sprite = s.bud[i % 2];
      sx = sy = size;
    } else if (kind < 0.32) {
      sprite = s.side[tone];
      sy = size;
    } else {
      sprite = s.front[tone][kind > 0.93 ? 2 : kind > 0.8 ? 0 : 1];
    }
    ctx.setTransform(cos * sx, sin * sx, -sin * sy, cos * sy, fx * k + ox, fy * k + oy);
    ctx.drawImage(sprite, -0.5, -0.5, 1, 1);
  }
}
