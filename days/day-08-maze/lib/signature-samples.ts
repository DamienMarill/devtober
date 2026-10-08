import type { Pt } from './model';
import { Rng } from './rng';

/**
 * Des signatures de synthèse, pour les tests, la démo et les bots : une « écriture » faite d'une boucle d'initiale
 * puis d'ondulations, propre à chaque `main` (graine). Chaque essai varie un peu, comme une signature à la souris :
 * échelle, inclinaison, tremblement et longueur des traits.
 */
export function signatureOf(
  main: number,
  essai: number,
  box = { x: 0, y: 0, w: 150, h: 40 },
): Pt[][] {
  const style = new Rng(main * 7919 + 13);
  const freqs = [style.range(2, 4.5), style.range(5, 8)];
  const amps = [style.range(0.25, 0.4), style.range(0.08, 0.18)];
  const phase = style.range(0, Math.PI * 2);
  const loop = style.range(0.12, 0.25);
  const trailing = style.chance(0.6);
  const v = new Rng(main * 104729 + essai * 31 + 1);
  const sx = v.range(0.88, 1.08);
  const sy = v.range(0.85, 1.12);
  const shear = v.range(-0.1, 0.1);
  const jitter = 0.012;
  const toBox = (u: number, w: number): Pt => {
    const x = box.x + box.w * (0.08 + 0.84 * (u * sx + shear * (0.5 - w)));
    const y = box.y + box.h * (0.5 + (w - 0.5) * sy);
    return { x, y };
  };
  const strokes: Pt[][] = [];
  // L'initiale : une boucle.
  const first: Pt[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2 + phase;
    first.push(
      toBox(
        loop * (0.5 + 0.5 * Math.cos(a)) + v.range(-jitter, jitter),
        0.5 + 0.42 * Math.sin(a) + v.range(-jitter, jitter),
      ),
    );
  }
  // Le corps : des ondulations.
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    const w =
      0.5 +
      amps[0] * Math.sin(2 * Math.PI * freqs[0] * u + phase) +
      amps[1] * Math.sin(2 * Math.PI * freqs[1] * u);
    first.push(
      toBox(loop + (0.9 - loop) * u + v.range(-jitter, jitter), w + v.range(-jitter, jitter)),
    );
  }
  strokes.push(first);
  if (trailing) {
    const bar: Pt[] = [];
    for (let i = 0; i <= 12; i++)
      bar.push(
        toBox(0.15 + 0.7 * (i / 12) + v.range(-jitter, jitter), 0.88 + v.range(-jitter, jitter)),
      );
    strokes.push(bar);
  }
  return strokes;
}
