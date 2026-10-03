/**
 * Cadrage. La scène est dessinée dans un repère fixe (unités « monde ») ; la caméra choisit la partie
 * visible selon la taille de l'écran. Un simple `preserveAspectRatio="slice"` ne suffit pas : en portrait,
 * il ne garderait qu'un tiers de la largeur et couperait le pont.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La composition de référence : ce qu'on voit en entier sur un écran 16:10. */
export const COMPOSITION: Box = { x: 0, y: 0, w: 1600, h: 1000 };
/**
 * Jusqu'où le décor est dessiné : on ne montre jamais au-delà (sauf écran extrême, centré). Le ciel monte
 * loin : un téléphone en portrait gagne du ciel, pas du vide sous les arbres.
 */
export const BLEED: Box = { x: -200, y: -450, w: 2000, h: 1700 };
/** Ce qui doit toujours rester visible : le pont dans sa trouée, et les montagnes au-dessus. */
export const SAFE: Box = { x: 360, y: 200, w: 720, h: 500 };

/** Part de la marge verticale donnée au ciel plutôt qu'à l'eau quand l'écran est plus haut que la zone sûre. */
const SKY_BIAS = 0.7;

export interface Camera {
  /** Rectangle visible, en unités monde (c'est aussi le `viewBox` des SVG). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pixels CSS par unité monde. */
  scale: number;
  /** Taille de l'écran, en pixels CSS. */
  width: number;
  height: number;
}

/**
 * La caméra pour un écran de `width` × `height` pixels : la plus grande échelle qui remplit l'écran avec la
 * composition, sans jamais perdre la zone sûre. Le cadre vise le centre de la composition (un écran plus
 * haut gagne surtout du ciel), se décale pour garder la zone sûre, puis reste dans le débord.
 */
export function frame(width: number, height: number): Camera {
  const w0 = Math.max(1, width);
  const h0 = Math.max(1, height);
  const cover = Math.max(w0 / COMPOSITION.w, h0 / COMPOSITION.h);
  const contain = Math.min(w0 / SAFE.w, h0 / SAFE.h);
  const scale = Math.min(cover, contain);
  const w = w0 / scale;
  const h = h0 / scale;

  // On vise le centre de la composition ; la marge d'un écran plus haut va surtout au ciel.
  const preferX = COMPOSITION.x + (COMPOSITION.w - w) / 2;
  const preferY =
    h > COMPOSITION.h
      ? COMPOSITION.y - (h - COMPOSITION.h) * SKY_BIAS
      : COMPOSITION.y + (COMPOSITION.h - h) / 2;
  // … sans jamais perdre la zone sûre.
  const x = Math.min(Math.max(preferX, SAFE.x + SAFE.w - w), SAFE.x);
  const top = Math.min(Math.max(preferY, SAFE.y + SAFE.h - h), SAFE.y);
  return {
    x: clampSpan(x, w, BLEED.x, BLEED.w),
    y: clampSpan(top, h, BLEED.y, BLEED.h),
    w,
    h,
    scale,
    width: w0,
    height: h0,
  };
}

/** Garde un segment [start, start + size] dans [min, min + span] ; s'il est plus grand, on le centre. */
function clampSpan(start: number, size: number, min: number, span: number): number {
  if (size >= span) return min + (span - size) / 2;
  return Math.min(Math.max(start, min), min + span - size);
}

/** Le `viewBox` SVG du cadre. */
export function viewBox(camera: Camera): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `${r(camera.x)} ${r(camera.y)} ${r(camera.w)} ${r(camera.h)}`;
}

/** Point du monde -> pixels CSS de l'écran. */
export function toScreen(camera: Camera, x: number, y: number): { x: number; y: number } {
  return { x: (x - camera.x) * camera.scale, y: (y - camera.y) * camera.scale };
}
