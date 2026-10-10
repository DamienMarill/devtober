/** Un papier : son nom, sa couleur dominante (pour l'interface) et sa façon de se dessiner. */
export interface Pattern {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

/** Petit générateur pseudo-aléatoire (mulberry32) : le même papier à chaque fois. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les fibres du washi : de courts filaments clairs et sombres, à peine visibles. */
function fibers(ctx: CanvasRenderingContext2D, size: number, strength = 1, seed = 7) {
  const rand = rng(seed);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    const l = (0.006 + rand() * 0.03) * size;
    ctx.strokeStyle =
      rand() < 0.5 ? `rgba(255,255,255,${0.05 * strength})` : `rgba(0,0,0,${0.035 * strength})`;
    ctx.lineWidth = (0.6 + rand()) * (size / 1024);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.6) * l * 0.5,
      y + Math.sin(a + 0.6) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function fill(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

/** Seigaiha : les vagues de la mer, des éventails de cercles concentriques qui se chevauchent. */
function seigaiha(ctx: CanvasRenderingContext2D, size: number) {
  const bg = '#1d3566';
  fill(ctx, size, bg);
  const r = size / 9;
  const rings = ['#f4efe4', bg, '#7fa7d9', bg, '#f4efe4', bg];
  for (let row = -1, y = -r; y < size + r * 2; row++, y += r / 2) {
    const shift = row % 2 ? r : 0;
    for (let x = -2 * r + shift; x < size + 2 * r; x += 2 * r) {
      rings.forEach((c, k) => {
        ctx.beginPath();
        ctx.arc(x, y, r * (1 - k * 0.17), Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
      });
    }
  }
  fibers(ctx, size, 1.4);
}

/** Asanoha : la feuille de chanvre, une grille de triangles dont chaque centre rejoint les sommets. */
function asanoha(ctx: CanvasRenderingContext2D, size: number) {
  fill(ctx, size, '#2c6b57');
  const a = size / 7;
  const h = (a * Math.sqrt(3)) / 2;
  ctx.strokeStyle = '#e9c46a';
  ctx.lineWidth = size / 400;
  ctx.lineJoin = 'round';
  const tri = (p: [number, number][]) => {
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
    const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    ctx.lineTo(p[1][0], p[1][1]);
    ctx.lineTo(p[2][0], p[2][1]);
    ctx.closePath();
    for (const [x, y] of p) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (let j = -1; j * h < size + h; j++) {
    const y0 = j * h;
    const off = j % 2 ? a / 2 : 0;
    for (let i = -1; i * a < size + a; i++) {
      const x0 = i * a + off;
      tri([
        [x0, y0],
        [x0 + a, y0],
        [x0 + a / 2, y0 + h],
      ]);
      tri([
        [x0 + a, y0],
        [x0 + a / 2, y0 + h],
        [x0 + (3 * a) / 2, y0 + h],
      ]);
    }
  }
  fibers(ctx, size, 1.2);
}

/** Une fleur de cerisier à cinq pétales échancrés. */
function blossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  petal: string,
  heart: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-r * 0.55, -r * 0.35, -r * 0.5, -r * 0.95, -r * 0.14, -r);
    ctx.lineTo(0, -r * 0.84);
    ctx.lineTo(r * 0.14, -r);
    ctx.bezierCurveTo(r * 0.5, -r * 0.95, r * 0.55, -r * 0.35, 0, 0);
    ctx.fill();
  }
  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Sakura : des fleurs de cerisier semées sur un fond rose poudré. */
function sakura(ctx: CanvasRenderingContext2D, size: number) {
  fill(ctx, size, '#f7cfd8');
  const rand = rng(10);
  const petals = ['#ffffff', '#ee8fa8', '#fbe3ea', '#e7738f'];
  for (let i = 0; i < 70; i++) {
    const r = (0.025 + rand() * 0.045) * size;
    blossom(
      ctx,
      rand() * size,
      rand() * size,
      r,
      rand() * 6.3,
      petals[i % petals.length],
      '#c9425f',
    );
  }
  fibers(ctx, size, 0.8);
}

/** Ichimatsu : le damier vert et noir (oui, celui du haori de Tanjirō). */
function ichimatsu(ctx: CanvasRenderingContext2D, size: number) {
  const n = 10;
  const c = size / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#1b1d1c' : '#2f8a63';
      ctx.fillRect(i * c, j * c, c + 1, c + 1);
    }
  fibers(ctx, size, 1.6);
}

/** Shippō : les « sept trésors », des cercles qui se chevauchent en quadrillage. */
function shippo(ctx: CanvasRenderingContext2D, size: number) {
  fill(ctx, size, '#5a3d8a');
  const r = size / 12;
  ctx.strokeStyle = '#f2d07a';
  ctx.lineWidth = size / 300;
  for (let y = 0; y <= size + r; y += r)
    for (let x = ((y / r) % 2) * r; x <= size + r; x += 2 * r) {
      ctx.beginPath();
      ctx.arc(x, y, r * Math.SQRT2 * 0.999, 0, Math.PI * 2);
      ctx.stroke();
    }
  ctx.fillStyle = '#f2d07a';
  for (let y = 0; y <= size + r; y += 2 * r)
    for (let x = 0; x <= size + r; x += 2 * r) {
      ctx.beginPath();
      ctx.arc(x, y, size / 220, 0, Math.PI * 2);
      ctx.fill();
    }
  fibers(ctx, size, 1.2);
}

/** Uni vermillon, le classique du kami. */
function aka(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#e2513f');
  g.addColorStop(1, '#c93a33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  fibers(ctx, size, 1.6);
}

export const PATTERNS: readonly Pattern[] = [
  { id: 'aka', name: 'Vermillon', color: '#d9483b', draw: aka },
  { id: 'sakura', name: 'Sakura', color: '#f2a7ba', draw: sakura },
  { id: 'seigaiha', name: 'Seigaiha', color: '#1d3566', draw: seigaiha },
  { id: 'asanoha', name: 'Asanoha', color: '#2c6b57', draw: asanoha },
  { id: 'ichimatsu', name: 'Ichimatsu', color: '#2f8a63', draw: ichimatsu },
  { id: 'shippo', name: 'Shippō', color: '#5a3d8a', draw: shippo },
];

/** Le verso : un washi crème, presque blanc, avec ses fibres. */
export function drawBack(ctx: CanvasRenderingContext2D, size: number) {
  fill(ctx, size, '#fbf8f1');
  fibers(ctx, size, 2.2, 3);
}

/** Une vignette du papier pour l'interface (data URL). */
export function swatch(pattern: Pattern, size = 96): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // On dessine un morceau de feuille plus grand pour garder l'échelle du motif.
  const scale = 3;
  ctx.scale(1 / scale, 1 / scale);
  pattern.draw(ctx, size * scale);
  return canvas.toDataURL();
}
