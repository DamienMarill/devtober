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

export interface MoonState {
  /** Hauteur au-dessus de l'horizon (parallaxe et réfraction comprises), en degrés. */
  elevation: number;
  /** Azimut en degrés depuis le nord, dans le sens horaire (comme pour le soleil). */
  azimuth: number;
  /** Avancée de la lunaison : 0 = nouvelle lune, 0,5 = pleine lune. */
  phase: number;
  /** Part éclairée du disque (0–1). */
  illumination: number;
  /**
   * Direction du côté éclairé vu d'ici, en degrés dans le sens horaire depuis le haut du disque
   * (90 = côté droit, 270 = côté gauche). Elle suit l'inclinaison de la lune dans le ciel : à l'ouest
   * le soir, le croissant se couche sur le côté ; le matin, c'est l'inverse.
   */
  brightLimb: number;
}

/** Obliquité de l'écliptique (J2000) et distance moyenne Terre-Soleil (km), rayon de la Terre (km). */
const OBLIQUITY = 23.4397 * RAD;
const SUN_DISTANCE_KM = 149_598_000;
const EARTH_RADIUS_KM = 6371;

function rightAscension(lon: number, lat: number): number {
  return Math.atan2(
    Math.sin(lon) * Math.cos(OBLIQUITY) - Math.tan(lat) * Math.sin(OBLIQUITY),
    Math.cos(lon),
  );
}

function declination(lon: number, lat: number): number {
  return Math.asin(
    Math.sin(lat) * Math.cos(OBLIQUITY) + Math.cos(lat) * Math.sin(OBLIQUITY) * Math.sin(lon),
  );
}

/** Soleil, en coordonnées équatoriales (rad). `d` : jours depuis J2000. */
function sunEquatorial(d: number): { ra: number; dec: number } {
  const anomaly = RAD * (357.5291 + 0.98560028 * d);
  const center =
    RAD *
    (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly));
  const lon = anomaly + center + RAD * 102.9372 + Math.PI;
  return { ra: rightAscension(lon, 0), dec: declination(lon, 0) };
}

/** Lune, en coordonnées équatoriales (rad) et distance (km) : série abrégée, précise à ~0,3°. */
function moonEquatorial(d: number): { ra: number; dec: number; distance: number } {
  const meanLon = RAD * (218.316 + 13.176396 * d);
  const anomaly = RAD * (134.963 + 13.064993 * d);
  const node = RAD * (93.272 + 13.22935 * d);
  const lon = meanLon + RAD * 6.289 * Math.sin(anomaly);
  const lat = RAD * 5.128 * Math.sin(node);
  return {
    ra: rightAscension(lon, lat),
    dec: declination(lon, lat),
    distance: 385_001 - 20_905 * Math.cos(anomaly),
  };
}

/** Position, phase et inclinaison du croissant de la lune à l'instant `ms`, vue depuis le lieu donné. */
export function moonState(ms: number, latitude: number, longitude: number): MoonState {
  const d = ms / 86_400_000 - 10_957.5;
  const sun = sunEquatorial(d);
  const moon = moonEquatorial(d);

  // Position dans le ciel : angle horaire, puis hauteur et azimut.
  const lat = latitude * RAD;
  const hourAngle = RAD * (280.16 + 360.9856235 * d + longitude) - moon.ra;
  const sinElevation =
    Math.sin(lat) * Math.sin(moon.dec) + Math.cos(lat) * Math.cos(moon.dec) * Math.cos(hourAngle);
  let elevation = Math.asin(sinElevation);
  // La lune est si proche que la parallaxe compte (~1° à l'horizon) ; la réfraction la relève un peu.
  elevation -= (EARTH_RADIUS_KM / moon.distance) * Math.cos(elevation);
  const h = Math.max(elevation, 0);
  elevation += 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
  const azimuth = mod(
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(lat) - Math.tan(moon.dec) * Math.cos(lat),
    ) /
      RAD +
      180,
    360,
  );

  // Phase : élongation de la lune au soleil, et direction du côté éclairé (angle de position du limbe).
  const raGap = sun.ra - moon.ra;
  const elongation = Math.acos(
    Math.sin(sun.dec) * Math.sin(moon.dec) + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(raGap),
  );
  const incidence = Math.atan2(
    SUN_DISTANCE_KM * Math.sin(elongation),
    moon.distance - SUN_DISTANCE_KM * Math.cos(elongation),
  );
  const limbAngle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(raGap),
    Math.sin(sun.dec) * Math.cos(moon.dec) - Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(raGap),
  );
  const parallactic = Math.atan2(
    Math.sin(hourAngle),
    Math.tan(lat) * Math.cos(moon.dec) - Math.sin(moon.dec) * Math.cos(hourAngle),
  );
  return {
    elevation: elevation / RAD,
    azimuth,
    phase: 0.5 + (0.5 * incidence * (limbAngle < 0 ? -1 : 1)) / Math.PI,
    illumination: (1 + Math.cos(incidence)) / 2,
    // Angle de position (vers l'est depuis le nord) moins l'angle parallactique = angle au zénith ;
    // on le veut dans le sens horaire de l'écran, donc de signe opposé.
    brightLimb: mod(-(limbAngle - parallactic) / RAD, 360),
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
