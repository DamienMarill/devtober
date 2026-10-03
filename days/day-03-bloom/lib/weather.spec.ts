import { describe, expect, it } from 'vitest';
import { FALLBACK_CONDITIONS, PRESETS, WMO_LABELS, parseOpenMeteo, toConditions } from './weather';

/** Réponse réelle d'Open-Meteo pour le pont Mitokoi (3 octobre 2026, 21 h JST), réduite. */
const FIXTURE = {
  utc_offset_seconds: 32400,
  current: {
    time: 1791028800,
    interval: 900,
    temperature_2m: 19.4,
    weather_code: 1,
    cloud_cover: 35,
    precipitation: 0,
    rain: 0,
    snowfall: 0,
    wind_speed_10m: 1.12,
    wind_direction_10m: 280,
    wind_gusts_10m: 2.5,
    is_day: 0,
    visibility: 28500,
  },
  daily: {
    time: [1790866800, 1790953200, 1791039600],
    sunrise: [1790887725, 1790974172, 1791060619],
    sunset: [1790930194, 1791016509, 1791102824],
  },
};

describe('parseOpenMeteo', () => {
  it('lit la mesure, le vent et les levers/couchers en millisecondes', () => {
    const w = parseOpenMeteo(FIXTURE);
    expect(w.observedAt).toBe(1791028800_000);
    expect(w.isDay).toBe(false);
    expect(w.utcOffsetSeconds).toBe(32400);
    expect(w.sunrises).toHaveLength(3);
    expect(w.sunrises[1]).toBe(1790974172_000); // 05:49:32 JST
    expect(w.conditions).toMatchObject({
      code: 1,
      precip: 'none',
      intensity: 0,
      storm: false,
      fog: 0,
      windSpeed: 1.12,
      windFrom: 280,
      gusts: 2.5,
      temperature: 19.4,
    });
    expect(w.conditions.clouds).toBeCloseTo(0.35);
  });

  it('refuse une réponse sans mesure', () => {
    expect(() => parseOpenMeteo({ error: true, reason: 'x' })).toThrow();
  });
});

describe('toConditions', () => {
  it('donne trois forces de pluie selon le code', () => {
    const light = toConditions({ code: 61 }).intensity;
    const moderate = toConditions({ code: 63 }).intensity;
    const heavy = toConditions({ code: 65 }).intensity;
    expect(light).toBeLessThan(moderate);
    expect(moderate).toBeLessThan(heavy);
  });

  it('renforce la pluie avec le cumul mesuré et la révèle si le code l’ignore', () => {
    expect(toConditions({ code: 61, precipitation: 2.5 }).intensity).toBe(1);
    const hidden = toConditions({ code: 3, precipitation: 0.3 });
    expect(hidden.precip).toBe('rain');
    expect(hidden.intensity).toBeGreaterThan(0);
  });

  it('reconnaît neige, orage et brouillard', () => {
    expect(toConditions({ code: 73 }).precip).toBe('snow');
    expect(toConditions({ code: 95 })).toMatchObject({ precip: 'rain', storm: true });
    expect(toConditions({ code: 45 }).fog).toBeGreaterThan(0.5);
    expect(toConditions({ code: 0, visibility: 500 }).fog).toBe(1);
    expect(toConditions({ code: 0, visibility: 20_000 }).fog).toBe(0);
  });

  it('couvre le ciel quand il pleut et borne le vent', () => {
    expect(toConditions({ code: 61, cloudCover: 10 }).clouds).toBeGreaterThanOrEqual(0.75);
    const c = toConditions({ code: 0, windSpeed: 5, windFrom: -90 });
    expect(c.windFrom).toBe(270);
    expect(c.gusts).toBeGreaterThanOrEqual(5);
  });

  it('a un libellé pour chaque préréglage et un repli dégagé', () => {
    for (const preset of Object.values(PRESETS)) expect(WMO_LABELS[preset.code]).toBeTruthy();
    expect(FALLBACK_CONDITIONS.precip).toBe('none');
  });
});
