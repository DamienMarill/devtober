import { Preset, isPreset } from './weather';

/**
 * Ce que le panneau de debug (ou l'adresse) impose à la place du direct. Tout est facultatif : ce qui
 * manque vient d'Ōgaki.
 * Exemple : `?debug&time=18:40&weather=rain&wind=8,270&clouds=90&speed=600`.
 */
export interface Overrides {
  /** Heure d'Ōgaki imposée, en minutes depuis minuit. */
  time?: number;
  /** Accélération du temps (1 = temps réel). */
  speed?: number;
  weather?: Preset;
  /** Vent imposé : vitesse (m/s) et provenance (degrés). */
  wind?: { speed: number; from: number };
  /** Couverture nuageuse imposée, 0–1. */
  clouds?: number;
}

export interface UrlState {
  debug: boolean;
  overrides: Overrides;
}

/** Lit l'adresse (`location.search`). Les valeurs invalides sont ignorées. */
export function parseOverrides(search: string): UrlState {
  const params = new URLSearchParams(search);
  const overrides: Overrides = {};

  const time = params.get('time')?.match(/^(\d{1,2})[:h](\d{2})$/);
  if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
    overrides.time = Number(time[1]) * 60 + Number(time[2]);
  }
  const speed = Number(params.get('speed'));
  if (params.has('speed') && Number.isFinite(speed) && speed > 0) {
    overrides.speed = Math.min(speed, 10_000);
  }
  const weather = params.get('weather');
  if (weather && isPreset(weather)) overrides.weather = weather;

  const wind = params.get('wind')?.split(',').map(Number);
  if (wind && wind.length === 2 && wind.every(Number.isFinite) && wind[0] >= 0) {
    overrides.wind = { speed: Math.min(wind[0], 40), from: ((wind[1] % 360) + 360) % 360 };
  }
  const clouds = Number(params.get('clouds'));
  if (params.has('clouds') && Number.isFinite(clouds)) {
    overrides.clouds = Math.min(1, Math.max(0, clouds / 100));
  }
  return { debug: params.has('debug'), overrides };
}
