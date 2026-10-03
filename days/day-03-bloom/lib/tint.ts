/**
 * La lumière du moment sur un calque peint en plein jour : multiplication par la lumière ambiante,
 * désaturation (ciel couvert), voile de brume, puis halos des lanternes, sans toucher à la transparence.
 */
export interface Tint {
  /** Lumière ambiante, multiplicateur RVB (0–1). */
  ambient: readonly [number, number, number];
  /** Désaturation, 0–1. */
  desaturate: number;
  /** Voile (brume, perspective atmosphérique). */
  haze: { color: string; alpha: number };
  /** Halos chauds (lanternes, lampadaires), en pixels du canvas. */
  glows: { x: number; y: number; r: number; color: string; alpha: number }[];
}

export function applyTint(
  target: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  tint: Tint,
): void {
  const { width, height } = target.canvas;
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = 1;
  target.globalCompositeOperation = 'copy';
  target.drawImage(base, 0, 0);
  const [r, g, b] = tint.ambient.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  if (r < 255 || g < 255 || b < 255) {
    target.globalCompositeOperation = 'multiply';
    target.fillStyle = `rgb(${r} ${g} ${b})`;
    target.fillRect(0, 0, width, height);
  }
  if (tint.desaturate > 0.01) {
    target.globalCompositeOperation = 'saturation';
    target.globalAlpha = Math.min(1, tint.desaturate);
    target.fillStyle = '#808080';
    target.fillRect(0, 0, width, height);
    target.globalAlpha = 1;
  }
  if (tint.glows.length) {
    target.globalCompositeOperation = 'lighter';
    for (const glow of tint.glows) {
      if (glow.alpha < 0.01) continue;
      const gradient = target.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
      gradient.addColorStop(0, glow.color);
      gradient.addColorStop(1, 'rgb(0 0 0 / 0)');
      target.globalAlpha = glow.alpha;
      target.fillStyle = gradient;
      target.fillRect(glow.x - glow.r, glow.y - glow.r, glow.r * 2, glow.r * 2);
    }
    target.globalAlpha = 1;
  }
  // On rend au calque sa transparence (les étapes précédentes ont pu peindre à côté des branches).
  target.globalCompositeOperation = 'destination-in';
  target.drawImage(base, 0, 0);
  if (tint.haze.alpha > 0.01) {
    target.globalCompositeOperation = 'source-atop';
    target.globalAlpha = Math.min(1, tint.haze.alpha);
    target.fillStyle = tint.haze.color;
    target.fillRect(0, 0, width, height);
    target.globalAlpha = 1;
  }
  target.globalCompositeOperation = 'source-over';
}
