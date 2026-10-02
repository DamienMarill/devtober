/**
 * Le sol de la chambre : un lino clair en dalles, moucheté, dessiné une fois par mise en page sur un
 * calque. Tout le hasard passe par un générateur à graine : le sol ne change pas d'un redimensionnement
 * à l'autre.
 */

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite de nombres dans [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Couleur de fond du lino, aussi utilisée par le composant avant le premier dessin. */
export const LINO = '#ece4d6';
const TILES = ['#efe8db', '#e8dfcf'];
const SEAM = 'rgba(140, 118, 88, 0.22)';
/** Mouchetures : surtout des tons de sable, et quelques éclats de couleur comme dans les vieux linos. */
const FLECKS = [
  'rgba(176, 158, 130, 0.55)',
  'rgba(196, 180, 154, 0.6)',
  'rgba(255, 252, 244, 0.85)',
  'rgba(150, 132, 104, 0.4)',
  'rgba(120, 160, 190, 0.45)',
  'rgba(214, 120, 104, 0.4)',
];

/**
 * Dessine le lino sur toute la zone (`width` × `height`, en pixels CSS ; le contexte est déjà mis à
 * l'échelle de l'écran). `tile` est le côté d'une dalle en pixels, `origin` un coin de dalle : le
 * quadrillage reste calé sur le circuit quand l'écran change de taille.
 */
export function drawLino(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tile: number,
  origin: { x: number; y: number },
): void {
  ctx.fillStyle = LINO;
  ctx.fillRect(0, 0, width, height);

  // Dalles en damier, chacune un rien plus claire ou plus foncée que sa voisine.
  const x0 = origin.x - Math.ceil(origin.x / tile) * tile;
  const y0 = origin.y - Math.ceil(origin.y / tile) * tile;
  for (let y = y0, row = 0; y < height; y += tile, row++) {
    for (let x = x0, col = 0; x < width; x += tile, col++) {
      ctx.fillStyle = TILES[(row + col) & 1];
      ctx.fillRect(x, y, tile, tile);
    }
  }

  // Reflets : quelques grandes zones à peine plus claires, pour que les dalles ne soient pas trop parfaites.
  const random = seeded(7);
  for (let i = 0; i < (width * height) / 30000; i++) {
    const x = random() * width;
    const y = random() * height;
    const r = tile * (0.8 + random() * 1.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255, 253, 247, 0.28)');
    g.addColorStop(1, 'rgba(255, 253, 247, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // Mouchetures fines.
  for (let i = 0; i < (width * height) / 45; i++) {
    ctx.fillStyle = FLECKS[Math.floor(random() ** 2.2 * FLECKS.length)];
    const size = 0.6 + random() * 1.4;
    ctx.fillRect(random() * width, random() * height, size, size * (0.5 + random()));
  }

  // Joints entre les dalles, avec un liseré clair juste à côté (le bord de la dalle accroche la lumière).
  ctx.lineWidth = 1;
  for (let x = x0; x < width; x += tile) {
    line(ctx, x, 0, x, height, SEAM);
    line(ctx, x + 1, 0, x + 1, height, 'rgba(255, 255, 255, 0.35)');
  }
  for (let y = y0; y < height; y += tile) {
    line(ctx, 0, y, width, y, SEAM);
    line(ctx, 0, y + 1, width, y + 1, 'rgba(255, 255, 255, 0.35)');
  }

  // Lumière de la fenêtre en haut à gauche, coins un peu plus sombres.
  const light = ctx.createRadialGradient(
    width * 0.2,
    -height * 0.2,
    0,
    width * 0.2,
    -height * 0.2,
    width,
  );
  light.addColorStop(0, 'rgba(255, 250, 235, 0.35)');
  light.addColorStop(1, 'rgba(255, 250, 235, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  const radius = Math.hypot(width, height) / 2;
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    radius * 0.55,
    width / 2,
    height / 2,
    radius,
  );
  vignette.addColorStop(0, 'rgba(90, 70, 40, 0)');
  vignette.addColorStop(1, 'rgba(90, 70, 40, 0.14)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}
