import { OGAKI, weatherUrl } from './ogaki';

/** Ce qui tombe du ciel. */
export type Precip = 'none' | 'drizzle' | 'rain' | 'snow';

/** La météo traduite pour le rendu : tout est borné et prêt à l'emploi. */
export interface Conditions {
  /** Code météo WMO (0 = ciel clair… 99 = orage de grêle). */
  code: number;
  precip: Precip;
  /** Force des précipitations, 0–1. */
  intensity: number;
  storm: boolean;
  /** Brouillard, 0–1 (code 45/48 ou visibilité réduite). */
  fog: number;
  /** Couverture nuageuse, 0–1. */
  clouds: number;
  /** Vent moyen à 10 m, en m/s. */
  windSpeed: number;
  /** D'où vient le vent, en degrés depuis le nord (convention météo : 270 = vent d'ouest). */
  windFrom: number;
  /** Rafales, en m/s. */
  gusts: number;
  /** Température en °C (null si inconnue). */
  temperature: number | null;
}

/** La réponse d'Open-Meteo, une fois lue. */
export interface Weather {
  conditions: Conditions;
  /** Instant de la mesure (ms). */
  observedAt: number;
  /** Levers et couchers d'hier à demain (ms), triés. */
  sunrises: number[];
  sunsets: number[];
  isDay: boolean | null;
  utcOffsetSeconds: number;
}

/** Libellés français des codes WMO (ceux qu'Open-Meteo renvoie). */
export const WMO_LABELS: Record<number, string> = {
  0: 'ciel dégagé',
  1: 'plutôt dégagé',
  2: 'partiellement nuageux',
  3: 'couvert',
  45: 'brouillard',
  48: 'brouillard givrant',
  51: 'bruine légère',
  53: 'bruine',
  55: 'bruine dense',
  56: 'bruine verglaçante',
  57: 'bruine verglaçante dense',
  61: 'pluie faible',
  63: 'pluie',
  65: 'forte pluie',
  66: 'pluie verglaçante',
  67: 'forte pluie verglaçante',
  71: 'neige faible',
  73: 'neige',
  75: 'forte neige',
  77: 'grésil',
  80: 'averses faibles',
  81: 'averses',
  82: 'averses violentes',
  85: 'averses de neige',
  86: 'fortes averses de neige',
  95: 'orage',
  96: 'orage avec grêle',
  99: 'orage avec forte grêle',
};

/** Précipitation et force de base de chaque code WMO. */
const PRECIP_BY_CODE: Record<number, [Precip, number]> = {
  51: ['drizzle', 0.25],
  53: ['drizzle', 0.4],
  55: ['drizzle', 0.55],
  56: ['drizzle', 0.35],
  57: ['drizzle', 0.55],
  61: ['rain', 0.35],
  63: ['rain', 0.6],
  65: ['rain', 0.9],
  66: ['rain', 0.4],
  67: ['rain', 0.8],
  71: ['snow', 0.3],
  73: ['snow', 0.55],
  75: ['snow', 0.85],
  77: ['snow', 0.25],
  80: ['rain', 0.4],
  81: ['rain', 0.65],
  82: ['rain', 1],
  85: ['snow', 0.45],
  86: ['snow', 0.85],
  95: ['rain', 0.8],
  96: ['rain', 0.85],
  99: ['rain', 1],
};

export interface Measures {
  code: number;
  /** Cumul du dernier quart d'heure, en mm. */
  precipitation?: number;
  snowfall?: number;
  /** Couverture nuageuse, en %. */
  cloudCover?: number;
  /** Visibilité, en mètres. */
  visibility?: number;
  windSpeed?: number;
  windFrom?: number;
  gusts?: number;
  temperature?: number | null;
}

/**
 * Traduit les mesures en conditions de rendu. Le code WMO décide du type et donne la force de base ; le
 * cumul mesuré (×4 = mm/h) peut la renforcer, ou révéler une pluie que le code ne signale pas.
 */
export function toConditions(m: Measures): Conditions {
  const code = Math.round(m.code);
  let [precip, intensity] = PRECIP_BY_CODE[code] ?? (['none', 0] as [Precip, number]);
  const mmPerHour = Math.max(0, m.precipitation ?? 0) * 4;
  if (precip === 'none' && mmPerHour >= 0.4) {
    precip = (m.snowfall ?? 0) > 0 ? 'snow' : 'rain';
    intensity = 0;
  }
  if (precip !== 'none') intensity = Math.max(intensity, Math.min(1, mmPerHour / 10));

  const fogFromCode = code === 45 || code === 48 ? 0.75 : 0;
  const visibility = m.visibility ?? 30_000;
  const fogFromVisibility = clamp01((8_000 - visibility) / 7_000);
  const clouds = clamp01((m.cloudCover ?? (code >= 3 ? 100 : code * 25)) / 100);
  const windSpeed = Math.max(0, m.windSpeed ?? 0);

  return {
    code,
    precip,
    intensity: clamp01(intensity),
    storm: code >= 95,
    fog: Math.max(fogFromCode, fogFromVisibility),
    // Il ne pleut pas sous un ciel bleu.
    clouds: precip === 'none' ? clouds : Math.max(clouds, 0.75),
    windSpeed,
    windFrom: (((m.windFrom ?? 270) % 360) + 360) % 360,
    gusts: Math.max(windSpeed, m.gusts ?? windSpeed * 1.5),
    temperature: m.temperature ?? null,
  };
}

/** Ce qu'on affiche si l'API ne répond pas : ciel clair, petite brise d'ouest. */
export const FALLBACK_CONDITIONS = toConditions({
  code: 1,
  cloudCover: 20,
  windSpeed: 2,
  windFrom: 270,
  gusts: 4,
});

interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  current?: Record<string, number | null | undefined>;
  daily?: { sunrise?: number[]; sunset?: number[] };
}

/** Lit la réponse d'Open-Meteo (`timeformat=unixtime`, `wind_speed_unit=ms`). */
export function parseOpenMeteo(json: unknown): Weather {
  const data = json as OpenMeteoResponse;
  const c = data?.current;
  if (!c || typeof c['weather_code'] !== 'number') {
    throw new Error('Réponse Open-Meteo inattendue');
  }
  const num = (key: string) => (typeof c[key] === 'number' ? (c[key] as number) : undefined);
  const seconds = (list?: number[]) =>
    (list ?? [])
      .filter((s) => typeof s === 'number')
      .map((s) => s * 1000)
      .sort((a, b) => a - b);
  return {
    conditions: toConditions({
      code: c['weather_code'],
      precipitation: num('precipitation'),
      snowfall: num('snowfall'),
      cloudCover: num('cloud_cover'),
      visibility: num('visibility'),
      windSpeed: num('wind_speed_10m'),
      windFrom: num('wind_direction_10m'),
      gusts: num('wind_gusts_10m'),
      temperature: num('temperature_2m') ?? null,
    }),
    observedAt: (num('time') ?? Date.now() / 1000) * 1000,
    sunrises: seconds(data.daily?.sunrise),
    sunsets: seconds(data.daily?.sunset),
    isDay: num('is_day') === undefined ? null : num('is_day') === 1,
    utcOffsetSeconds: data.utc_offset_seconds ?? OGAKI.utcOffsetSeconds,
  };
}

/** Délai au-delà duquel on abandonne l'appel (ms). */
const TIMEOUT_MS = 10_000;

/** La météo d'Ōgaki maintenant. */
export async function fetchWeather(signal?: AbortSignal): Promise<Weather> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(weatherUrl(), {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Open-Meteo : HTTP ${response.status}`);
  return parseOpenMeteo(await response.json());
}

/** Préréglages du panneau de debug. */
export const PRESETS = {
  clear: { label: 'Dégagé', code: 0, cloudCover: 5 },
  cloudy: { label: 'Nuageux', code: 2, cloudCover: 55 },
  overcast: { label: 'Couvert', code: 3, cloudCover: 100 },
  fog: { label: 'Brouillard', code: 45, cloudCover: 100, visibility: 600 },
  drizzle: { label: 'Bruine', code: 53, cloudCover: 100, precipitation: 0.2 },
  rain: { label: 'Pluie', code: 63, cloudCover: 100, precipitation: 1 },
  downpour: { label: 'Forte pluie', code: 82, cloudCover: 100, precipitation: 3 },
  snow: { label: 'Neige', code: 73, cloudCover: 100, snowfall: 0.4 },
  storm: { label: 'Orage', code: 95, cloudCover: 100, precipitation: 2.5 },
} satisfies Record<string, Measures & { label: string }>;

export type Preset = keyof typeof PRESETS;

export function isPreset(value: string): value is Preset {
  return Object.hasOwn(PRESETS, value);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
