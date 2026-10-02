/**
 * Petits outils de dessin partagés : ombres portées (même lumière pour tout le décor), formes de base, et
 * les voitures jouets vues du dessus (les deux bolides, et la voiture de police garée dans le décor).
 */

/** Pixels du canvas par unité du repère courant (échelle de la transformation, rotation comprise). */
export function pixelScale(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b);
}

/**
 * Ombre portée d'un objet posé au sol, `height` = sa hauteur dans les unités du repère courant. La lumière
 * vient d'en haut à gauche : l'ombre part vers le bas à droite, quelle que soit la rotation de l'objet
 * (le canvas applique l'ombre en pixels, après la transformation).
 */
export function dropShadow(ctx: CanvasRenderingContext2D, height: number, alpha = 0.3): void {
  const k = pixelScale(ctx);
  ctx.shadowColor = `rgba(80, 58, 30, ${alpha})`;
  ctx.shadowBlur = (2 + height * 1.3) * k;
  ctx.shadowOffsetX = height * 0.55 * k;
  ctx.shadowOffsetY = height * 0.8 * k;
}

export function noShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Voile clair au centre et sombre sur les bords, pour donner du volume à une forme déjà tracée. */
export function volume(ctx: CanvasRenderingContext2D, half: number, strength = 1): void {
  const g = ctx.createLinearGradient(0, -half, 0, half);
  g.addColorStop(0, `rgba(0, 0, 0, ${0.28 * strength})`);
  g.addColorStop(0.35, `rgba(255, 255, 255, ${0.18 * strength})`);
  g.addColorStop(0.6, `rgba(255, 255, 255, ${0.05 * strength})`);
  g.addColorStop(1, `rgba(0, 0, 0, ${0.35 * strength})`);
  ctx.fillStyle = g;
  ctx.fill();
}

export interface CarStyle {
  body: string;
  /** Numéro peint sur le toit (voitures de course). */
  number?: number;
  /** Gyrophares et toit blanc. */
  police?: boolean;
}

export const CAR_LENGTH = 34;
export const CAR_WIDTH = 18;
/** Les voitures sont dessinées un peu plus grandes que nature (une voie fait 35 de large) : plus lisibles. */
export const CAR_SCALE = 1.25;

/** Une voiture jouet vue du dessus, centrée sur l'origine, l'avant vers +x. */
export function drawToyCar(ctx: CanvasRenderingContext2D, style: CarStyle, height = 3): void {
  const l = CAR_LENGTH / 2;
  const w = CAR_WIDTH / 2;

  // Roues qui dépassent un peu de la carrosserie.
  ctx.fillStyle = '#16161a';
  for (const x of [-l + 6, l - 9]) {
    for (const y of [-w - 1, w - 2]) {
      roundRect(ctx, x, y, 7, 3, 1);
      ctx.fill();
    }
  }

  // Carrosserie, avec son ombre au sol.
  dropShadow(ctx, height);
  ctx.fillStyle = style.body;
  roundRect(ctx, -l, -w, CAR_LENGTH, CAR_WIDTH, 6);
  ctx.fill();
  noShadow(ctx);
  volume(ctx, w);

  // Aileron arrière.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, -l - 1, -w - 0.5, 4, CAR_WIDTH + 1, 1.5);
  ctx.fill();

  // Pare-brise (devant le toit) et lunette arrière.
  ctx.fillStyle = '#1b2433';
  ctx.beginPath();
  ctx.moveTo(2, -w + 2.5);
  ctx.lineTo(8.5, -w + 3.5);
  ctx.lineTo(8.5, w - 3.5);
  ctx.lineTo(2, w - 2.5);
  ctx.closePath();
  ctx.fill();
  roundRect(ctx, -12.5, -w + 3, 4, CAR_WIDTH - 6, 1.5);
  ctx.fill();
  // Reflet sur le pare-brise.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(3.5, -w + 3.5);
  ctx.lineTo(6, -w + 4);
  ctx.lineTo(4.5, 0);
  ctx.lineTo(3, 0);
  ctx.closePath();
  ctx.fill();

  // Toit.
  ctx.fillStyle = style.police ? '#f4f4f6' : style.body;
  roundRect(ctx, -8.5, -w + 2.5, 10.5, CAR_WIDTH - 5, 2.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fill();

  if (style.police) {
    ctx.fillStyle = '#e03131';
    roundRect(ctx, -4.5, -w + 3, 3, CAR_WIDTH / 2 - 3, 1);
    ctx.fill();
    ctx.fillStyle = '#1971c2';
    roundRect(ctx, -4.5, 0, 3, CAR_WIDTH / 2 - 3, 1);
    ctx.fill();
  } else if (style.number !== undefined) {
    ctx.fillStyle = '#ffffff';
    circle(ctx, -3.2, 0, 4.4);
    ctx.fill();
    ctx.fillStyle = '#16161a';
    ctx.font = '700 6.5px Lato, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(-3.2, 0.3);
    ctx.rotate(Math.PI / 2); // le haut du chiffre vers l'avant de la voiture
    ctx.fillText(String(style.number), 0, 0);
    ctx.restore();
  }

  // Phares et feux arrière.
  ctx.fillStyle = '#fff7c4';
  for (const y of [-w + 3, w - 3]) {
    ctx.beginPath();
    ctx.ellipse(l - 1.5, y, 1.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3b3b';
  for (const y of [-w + 2, w - 4]) {
    roundRect(ctx, -l + 0.5, y, 1.5, 2, 0.5);
    ctx.fill();
  }
}
