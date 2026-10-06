import { CONFIG } from './config';

/** L'étape de la tournée de démo à l'instant `t` (secondes depuis la touche T), ou -1 une fois finie. */
export function tourStep(
  t: number,
  steps = CONFIG.tour.steps.length,
  duration = CONFIG.tour.duration,
): number {
  if (t < 0) return 0;
  const i = Math.floor(t / duration);
  return i < steps ? i : -1;
}
