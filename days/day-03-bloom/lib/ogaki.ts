/**
 * Où l'on se tient : au-dessus du canal Suimon (水門川), à Ōgaki, face au pont Mitokoi (美登鯉橋), le pont de
 * *Koe no Katachi*. D'après OpenStreetMap, le pont va du nord au sud et le canal, d'est en ouest : on
 * regarde plein ouest, vers les montagnes (mont Ibuki, massif de Yōrō), et le soleil se couche derrière
 * le pont.
 */
export const OGAKI = {
  latitude: 35.3578,
  longitude: 136.6118,
  timeZone: 'Asia/Tokyo',
  /** JST, sans heure d'été : sert tant que l'API n'a pas répondu. */
  utcOffsetSeconds: 9 * 3600,
} as const;

/** Cap du regard, en degrés depuis le nord (270 = ouest). La droite de l'écran est donc le nord. */
export const CAMERA_HEADING = 270;

/** Mesures relevées chaque quart d'heure par Open-Meteo (gratuit, sans clé, CORS ouvert). */
const CURRENT = [
  'temperature_2m',
  'weather_code',
  'cloud_cover',
  'precipitation',
  'rain',
  'snowfall',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'is_day',
  'visibility',
];

/**
 * L'appel Open-Meteo : météo du quart d'heure, lever et coucher d'hier à demain (pour encadrer la nuit),
 * vent en m/s et instants en secondes Unix : aucune date locale à interpréter.
 */
export function weatherUrl(): string {
  const params = new URLSearchParams({
    latitude: String(OGAKI.latitude),
    longitude: String(OGAKI.longitude),
    current: CURRENT.join(','),
    daily: 'sunrise,sunset',
    timezone: OGAKI.timeZone,
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    past_days: '1',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}
