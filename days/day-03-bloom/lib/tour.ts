import { Preset } from './weather';

/**
 * La visite (touche T) : une journée à Ōgaki en 30 secondes, toujours la même, pour le GIF d'aperçu et
 * pour montrer ce que le direct ne montre pas au moment où on regarde. L'heure défile en continu ; la
 * météo et le vent changent d'une étape à l'autre.
 */
export interface TourStep {
  /** Début de l'étape (secondes depuis le lancement). */
  at: number;
  /** Heure d'Ōgaki à ce moment (minutes depuis minuit). */
  time: number;
  weather: Preset;
  /** Vent : vitesse (m/s) et provenance (degrés). */
  wind: { speed: number; from: number };
}

export const TOUR: TourStep[] = [
  { at: 0, time: 4 * 60 + 50, weather: 'clear', wind: { speed: 1.5, from: 90 } },
  { at: 4, time: 5 * 60 + 50, weather: 'clear', wind: { speed: 2.5, from: 135 } },
  { at: 8, time: 9 * 60, weather: 'cloudy', wind: { speed: 4, from: 270 } },
  { at: 11, time: 11 * 60, weather: 'rain', wind: { speed: 6, from: 250 } },
  { at: 16, time: 14 * 60 + 30, weather: 'cloudy', wind: { speed: 7, from: 0 } },
  { at: 19, time: 16 * 60 + 40, weather: 'clear', wind: { speed: 3, from: 180 } },
  { at: 24, time: 17 * 60 + 50, weather: 'clear', wind: { speed: 2, from: 200 } },
  { at: 28, time: 20 * 60, weather: 'clear', wind: { speed: 1.5, from: 270 } },
];

export const TOUR_SECONDS = 31;

/** Où en est la visite à `t` secondes : l'heure (interpolée) et l'étape en cours. */
export function tourAt(t: number): { minutes: number; step: TourStep; done: boolean } {
  const clamped = Math.max(0, Math.min(t, TOUR_SECONDS));
  let i = TOUR.findIndex((s) => s.at > clamped) - 1;
  if (i < 0) i = TOUR.length - 1;
  const step = TOUR[i];
  const next = TOUR[i + 1];
  const minutes = next
    ? step.time + ((next.time - step.time) * (clamped - step.at)) / (next.at - step.at)
    : step.time;
  return { minutes, step, done: t >= TOUR_SECONDS };
}
