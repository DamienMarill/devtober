/**
 * Le bazar de la chambre autour du circuit : jouets et stickers, vus du dessus. Tout est placé dans le
 * repère du circuit (le croisement en (0, 0), les boucles centrées en (±240, 0), rayon 150) : les objets
 * restent dans les boucles et autour quelle que soit la taille de l'écran.
 */
import { CAR_SCALE, circle, drawToyCar, dropShadow, noShadow, roundRect, volume } from './paint';

type Draw = (ctx: CanvasRenderingContext2D) => void;

interface Item {
  x: number;
  y: number;
  /** Rotation en radians. */
  angle: number;
  /** Rayon du cercle qui contient l'objet : sert à vérifier qu'il ne mord pas sur la route. */
  radius: number;
  draw: Draw;
}

/** Les objets, du plus bas au plus haut (un sticker passe sous un jouet s'ils se chevauchent). */
export const DECOR: readonly Item[] = [
  // Stickers collés au sol.
  { x: -238, y: -70, angle: -0.25, radius: 20, draw: (c) => sticker(c, star(17), '#ffd43b') },
  { x: 205, y: 58, angle: 0.2, radius: 18, draw: smiley },
  { x: 0, y: -132, angle: 0.15, radius: 18, draw: (c) => sticker(c, heart(15), '#ff6b9e') },
  { x: 130, y: 196, angle: -0.35, radius: 16, draw: (c) => sticker(c, bolt(18), '#ff922b') },
  { x: -130, y: 205, angle: 0.4, radius: 16, draw: (c) => sticker(c, star(13), '#74c0fc') },
  { x: -140, y: -200, angle: -0.5, radius: 15, draw: (c) => sticker(c, heart(12), '#b197fc') },

  // Boucle de gauche : le canard et les billes.
  { x: -268, y: 18, angle: -0.5, radius: 34, draw: duck },
  { x: -196, y: -12, angle: 0, radius: 9, draw: (c) => marble(c, '#4dabf7') },
  { x: -186, y: 12, angle: 0, radius: 9, draw: (c) => marble(c, '#51cf66') },
  { x: -212, y: 40, angle: 0, radius: 9, draw: (c) => marble(c, '#ff6b6b') },

  // Boucle de droite : les briques et le dé.
  { x: 228, y: -32, angle: 0.35, radius: 34, draw: (c) => brick(c, '#e03131', 4, 2) },
  { x: 268, y: -2, angle: -0.6, radius: 22, draw: (c) => brick(c, '#1c7ed6', 2, 2) },
  { x: 280, y: 52, angle: 0.5, radius: 19, draw: die },

  // Autour du circuit (les coins du bas restent libres pour les manettes).
  { x: 392, y: -180, angle: 0.3, radius: 25, draw: tires },
  { x: 58, y: 168, angle: 0.2, radius: 16, draw: cone },
  { x: -58, y: 168, angle: -0.3, radius: 16, draw: cone },
  { x: -405, y: -185, angle: 0.45, radius: 36, draw: (c) => crayon(c, '#e64980') },
  { x: -414, y: -170, angle: 0.6, radius: 36, draw: (c) => crayon(c, '#228be6') },
  { x: 78, y: -196, angle: 0.25, radius: 20, draw: policeCar },
  { x: 330, y: 200, angle: 0.1, radius: 20, draw: spinningTop },
];

/** Dessine tout le décor ; `ctx` est déjà dans le repère du circuit. */
export function drawDecor(ctx: CanvasRenderingContext2D): void {
  for (const item of DECOR) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);
    item.draw(ctx);
    ctx.restore();
    noShadow(ctx);
  }
}

// --- Stickers : une forme colorée sur un fond blanc découpé, collée à plat (ombre très courte). ---

function sticker(ctx: CanvasRenderingContext2D, shape: Path2D, color: string): void {
  dropShadow(ctx, 1, 0.25);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.stroke(shape);
  ctx.fill(shape);
  noShadow(ctx);
  ctx.fillStyle = color;
  ctx.fill(shape);
  // Reflet du vinyle.
  ctx.save();
  ctx.clip(shape);
  const g = ctx.createLinearGradient(-20, -20, 20, 20);
  g.addColorStop(0.3, 'rgba(255, 255, 255, 0.35)');
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fill(shape);
  ctx.restore();
}

function star(r: number): Path2D {
  const path = new Path2D();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  return path;
}

function heart(s: number): Path2D {
  const path = new Path2D();
  path.moveTo(0, s * 0.95);
  path.bezierCurveTo(-s * 1.3, s * 0.1, -s * 0.9, -s * 1.05, 0, -s * 0.4);
  path.bezierCurveTo(s * 0.9, -s * 1.05, s * 1.3, s * 0.1, 0, s * 0.95);
  path.closePath();
  return path;
}

function bolt(s: number): Path2D {
  const path = new Path2D();
  const points = [
    [0.15, -1],
    [-0.55, 0.12],
    [-0.05, 0.12],
    [-0.2, 1],
    [0.55, -0.15],
    [0.05, -0.15],
  ];
  points.forEach(([x, y], i) => (i ? path.lineTo(x * s, y * s) : path.moveTo(x * s, y * s)));
  path.closePath();
  return path;
}

function smiley(ctx: CanvasRenderingContext2D): void {
  const face = new Path2D();
  face.arc(0, 0, 15, 0, Math.PI * 2);
  sticker(ctx, face, '#ffd43b');
  ctx.fillStyle = '#5c3d00';
  for (const x of [-5, 5]) {
    ctx.beginPath();
    ctx.ellipse(x, -4, 1.8, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#5c3d00';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 1, 8, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

// --- Jouets. ---

function duck(ctx: CanvasRenderingContext2D): void {
  const yellow = '#ffd43b';
  // Corps et queue.
  dropShadow(ctx, 8);
  ctx.fillStyle = yellow;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 23, 17, 0, 0, Math.PI * 2);
  ctx.moveTo(-20, -7);
  ctx.quadraticCurveTo(-34, -4, -31, 0);
  ctx.quadraticCurveTo(-34, 4, -20, 7);
  ctx.fill();
  noShadow(ctx);
  ctx.beginPath();
  ctx.ellipse(-2, 0, 23, 17, 0, 0, Math.PI * 2);
  volume(ctx, 17, 0.7);
  // Ailes.
  ctx.strokeStyle = '#f0a800';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-6, side * 9, 11, 5, 0, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI : Math.PI * 2);
    ctx.stroke();
  }
  // Tête, posée sur le corps.
  dropShadow(ctx, 3, 0.25);
  ctx.fillStyle = yellow;
  circle(ctx, 15, 0, 11);
  ctx.fill();
  noShadow(ctx);
  circle(ctx, 15, 0, 11);
  volume(ctx, 11, 0.5);
  // Bec et yeux.
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.ellipse(26, 0, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1d1f';
  for (const y of [-6, 6]) {
    circle(ctx, 18, y, 2.2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (const y of [-6.6, 5.4]) {
    circle(ctx, 18.7, y, 0.7);
    ctx.fill();
  }
}

function marble(ctx: CanvasRenderingContext2D, color: string): void {
  dropShadow(ctx, 5, 0.35);
  const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(20, 30, 60, 0.9)');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, 8.5);
  ctx.fill();
  noShadow(ctx);
  // Le ruban de couleur à l'intérieur de la bille.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-5, 3);
  ctx.bezierCurveTo(-2, -4, 2, 6, 5, -2);
  ctx.stroke();
}

function brick(ctx: CanvasRenderingContext2D, color: string, cols: number, rows: number): void {
  const unit = 15;
  const w = cols * unit;
  const h = rows * unit;
  dropShadow(ctx, 9);
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 2.5);
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -w / 2 + unit * (i + 0.5);
      const y = -h / 2 + unit * (j + 0.5);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      circle(ctx, x + 0.9, y + 1.3, 4.6);
      ctx.fill();
      ctx.fillStyle = color;
      circle(ctx, x, y, 4.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      circle(ctx, x - 1.2, y - 1.2, 1.8);
      ctx.fill();
    }
  }
}

function die(ctx: CanvasRenderingContext2D): void {
  const s = 26;
  dropShadow(ctx, 9);
  ctx.fillStyle = '#fbfaf7';
  roundRect(ctx, -s / 2, -s / 2, s, s, 5);
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#e03131';
  for (const [x, y] of [
    [-6.5, -6.5],
    [6.5, -6.5],
    [0, 0],
    [-6.5, 6.5],
    [6.5, 6.5],
  ]) {
    circle(ctx, x, y, 2.4);
    ctx.fill();
  }
}

function tires(ctx: CanvasRenderingContext2D): void {
  for (const [x, y] of [
    [0, -12],
    [-11, 8],
    [11, 8],
  ]) {
    dropShadow(ctx, 10, 0.28);
    ctx.fillStyle = '#26262b';
    circle(ctx, x, y, 12.5);
    ctx.fill();
    noShadow(ctx);
    // Sculptures du pneu.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 9.5, y + Math.sin(a) * 9.5);
      ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      ctx.stroke();
    }
    ctx.fillStyle = '#0d0d10';
    circle(ctx, x, y, 5.5);
    ctx.fill();
  }
}

function cone(ctx: CanvasRenderingContext2D): void {
  dropShadow(ctx, 6);
  ctx.fillStyle = '#e8590c';
  roundRect(ctx, -11, -11, 22, 22, 3);
  ctx.fill();
  noShadow(ctx);
  const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 9);
  g.addColorStop(0, '#ffa94d');
  g.addColorStop(1, '#f76707');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, 8.5);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  circle(ctx, 0, 0, 5.4);
  ctx.stroke();
  ctx.fillStyle = '#ffc078';
  circle(ctx, 0, 0, 2.2);
  ctx.fill();
}

function crayon(ctx: CanvasRenderingContext2D, color: string): void {
  dropShadow(ctx, 4);
  ctx.fillStyle = color;
  roundRect(ctx, -30, -4.5, 52, 9, 1.5);
  ctx.fill();
  noShadow(ctx);
  roundRect(ctx, -30, -4.5, 52, 9, 1.5);
  volume(ctx, 4.5);
  // Étiquette en papier.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(-20, -4.5, 30, 9);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  for (const x of [-17, 7]) {
    ctx.beginPath();
    ctx.moveTo(x, -4.5);
    ctx.lineTo(x, 4.5);
    ctx.stroke();
  }
  // Bois taillé puis mine.
  ctx.fillStyle = '#efcf9f';
  ctx.beginPath();
  ctx.moveTo(22, -4.5);
  ctx.lineTo(33, -1.4);
  ctx.lineTo(33, 1.4);
  ctx.lineTo(22, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(30, -2.2);
  ctx.lineTo(36, 0);
  ctx.lineTo(30, 2.2);
  ctx.closePath();
  ctx.fill();
}

function policeCar(ctx: CanvasRenderingContext2D): void {
  ctx.scale(CAR_SCALE, CAR_SCALE);
  drawToyCar(ctx, { body: '#1e1e24', police: true }, 3);
}

function spinningTop(ctx: CanvasRenderingContext2D): void {
  const colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8', '#ff922b'];
  dropShadow(ctx, 10);
  ctx.fillStyle = '#ffffff';
  circle(ctx, 0, 0, 19);
  ctx.fill();
  noShadow(ctx);
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 19, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
    ctx.closePath();
    ctx.fill();
  });
  const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, 19);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, 19);
  ctx.fill();
  ctx.fillStyle = '#495057';
  circle(ctx, 0, 0, 4);
  ctx.fill();
}
