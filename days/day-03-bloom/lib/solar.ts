/**
 * Soleil et lune, calculés sur place. Les formules du soleil sont celles de la NOAA (précises à la minute
 * près) : la lumière suit l'élévation du soleil en continu, même hors ligne, même quand on fait défiler les
 * heures dans le panneau de debug.
 */

const RAD = Math.PI / 180;

export interface SunPosition {
  /** Hauteur au-dessus de l'horizon, en degrés (négative la nuit). */
  elevation: number;
  /** Azimut en degrés depuis le nord, dans le sens horaire (90 = est, 270 = ouest). */
  azimuth: number;
}

/** Position du soleil à l'instant `ms` (époque Unix, en millisecondes) vue depuis `latitude`/`longitude`. */
export function sunPosition(ms: number, latitude: number, longitude: number): SunPosition {
  const jd = ms / 86_400_000 + 2_440_587.5;
  const t = (jd - 2_451_545) / 36_525;

  const meanLong = mod(280.46646 + t * (36_000.76983 + t * 0.0003032), 360);
  const meanAnom = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    Math.sin(meanAnom * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnom * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnom * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const apparentLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(obliq * RAD) * Math.sin(apparentLong * RAD));

  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eqTime =
    (4 *
      (y * Math.sin(2 * meanLong * RAD) -
        2 * ecc * Math.sin(meanAnom * RAD) +
        4 * ecc * y * Math.sin(meanAnom * RAD) * Math.cos(2 * meanLong * RAD) -
        0.5 * y * y * Math.sin(4 * meanLong * RAD) -
        1.25 * ecc * ecc * Math.sin(2 * meanAnom * RAD))) /
    RAD;

  const minutesUtc = mod(ms / 60_000, 1440);
  const trueSolar = mod(minutesUtc + eqTime + 4 * longitude, 1440);
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180;

  const lat = latitude * RAD;
  const cosZenith =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle * RAD);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevation = 90 - zenith / RAD;

  const cosAz =
    (Math.sin(lat) * Math.cos(zenith) - Math.sin(declination)) / (Math.cos(lat) * Math.sin(zenith));
  const az = Math.acos(Math.min(1, Math.max(-1, cosAz))) / RAD;
  const azimuth = hourAngle > 0 ? mod(az + 180, 360) : mod(540 - az, 360);
  return { elevation, azimuth };
}

/** Nouvelle lune de référence (6 janvier 2000, 18 h 14 UTC) et durée d'une lunaison, en jours. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.530588853;

export interface MoonPhase {
  /** Avancée de la lunaison : 0 = nouvelle lune, 0,5 = pleine lune. */
  phase: number;
  /** Part éclairée du disque (0–1). */
  illumination: number;
}

export function moonPhase(ms: number): MoonPhase {
  const days = (ms - NEW_MOON_MS) / 86_400_000;
  const phase = mod(days / SYNODIC_DAYS, 1);
  return { phase, illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
