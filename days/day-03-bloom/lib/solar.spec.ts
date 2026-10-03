import { describe, expect, it } from 'vitest';
import { OGAKI } from './ogaki';
import { moonState, sunPosition } from './solar';

const at = (iso: string) => Date.parse(iso);
const sun = (iso: string) => sunPosition(at(iso), OGAKI.latitude, OGAKI.longitude);

describe('sunPosition', () => {
  // Lever 05:49 et coucher 17:35 (JST) le 3 octobre 2026, d'après Open-Meteo pour le pont Mitokoi.
  it('place le soleil sur l’horizon aux heures de lever et de coucher données par l’API', () => {
    // L'API compte le lever quand le bord du disque passe l'horizon, réfraction comprise : ~ -0,83°.
    expect(sun('2026-10-03T05:49:00+09:00').elevation).toBeCloseTo(-0.83, 0);
    expect(sun('2026-10-03T17:35:00+09:00').elevation).toBeCloseTo(-0.83, 0);
  });

  it('se lève à l’est et se couche un peu au sud de l’ouest début octobre', () => {
    const rise = sun('2026-10-03T05:49:00+09:00');
    const set = sun('2026-10-03T17:35:00+09:00');
    expect(rise.azimuth).toBeGreaterThan(90);
    expect(rise.azimuth).toBeLessThan(100);
    expect(set.azimuth).toBeGreaterThan(260);
    expect(set.azimuth).toBeLessThan(270);
  });

  it('culmine au sud vers midi solaire et passe sous l’horizon à minuit', () => {
    const noon = sun('2026-10-03T11:42:00+09:00');
    expect(noon.azimuth).toBeGreaterThan(170);
    expect(noon.azimuth).toBeLessThan(190);
    expect(noon.elevation).toBeGreaterThan(48);
    expect(noon.elevation).toBeLessThan(52);
    expect(sun('2026-10-04T00:00:00+09:00').elevation).toBeLessThan(-40);
  });
});

describe('moonState', () => {
  const moon = (iso: string) => moonState(at(iso), OGAKI.latitude, OGAKI.longitude);

  it('reconnaît une pleine lune et une nouvelle lune connues', () => {
    // Pleine lune du 26 septembre 2026 (16 h 49 UTC), nouvelle lune du 11 septembre 2026 (03 h 27 UTC).
    expect(moon('2026-09-26T16:49:00Z').illumination).toBeGreaterThan(0.97);
    expect(moon('2026-09-11T03:27:00Z').illumination).toBeLessThan(0.03);
  });

  it('place la pleine lune à l’opposé du soleil : levée à l’est au coucher, couchée à l’ouest à l’aube', () => {
    // Le soleil se couche à 17 h 35 JST (08 h 35 UTC) et se lève à 05 h 49 JST (20 h 49 UTC la veille).
    const rise = moon('2026-09-26T08:35:00Z');
    expect(rise.elevation).toBeGreaterThan(-3);
    expect(rise.elevation).toBeLessThan(6);
    expect(rise.azimuth).toBeGreaterThan(80);
    expect(rise.azimuth).toBeLessThan(100);
    const set = moon('2026-09-26T20:45:00Z');
    expect(set.elevation).toBeGreaterThan(0);
    expect(set.elevation).toBeLessThan(8);
    expect(set.azimuth).toBeGreaterThan(260);
    expect(set.azimuth).toBeLessThan(285);
    // Au milieu de la nuit, haute dans le ciel du sud.
    expect(moon('2026-09-26T14:30:00Z').elevation).toBeGreaterThan(50);
  });

  it('éclaire le côté droit en lune croissante et le côté gauche en lune décroissante', () => {
    // Premier quartier (≈ 18 septembre) vu le soir : le soleil est à l'ouest, côté droit éclairé.
    const waxing = moon('2026-09-18T10:00:00Z');
    expect(waxing.phase).toBeGreaterThan(0.2);
    expect(waxing.phase).toBeLessThan(0.3);
    expect(waxing.brightLimb).toBeGreaterThan(60);
    expect(waxing.brightLimb).toBeLessThan(150);
    // Dernier quartier (≈ 3 octobre) vu au petit matin, le soleil étant à l'est : côté gauche.
    const waning = moon('2026-10-02T20:00:00Z');
    expect(waning.phase).toBeGreaterThan(0.7);
    expect(waning.phase).toBeLessThan(0.8);
    expect(waning.brightLimb).toBeGreaterThan(210);
    expect(waning.brightLimb).toBeLessThan(300);
  });
});
