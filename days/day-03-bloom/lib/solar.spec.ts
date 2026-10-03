import { describe, expect, it } from 'vitest';
import { OGAKI } from './ogaki';
import { moonPhase, sunPosition } from './solar';

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

describe('moonPhase', () => {
  it('reconnaît une pleine lune et une nouvelle lune connues', () => {
    // Pleine lune du 26 septembre 2026 (16 h 49 UTC), nouvelle lune du 11 septembre 2026 (03 h 27 UTC).
    expect(moonPhase(at('2026-09-26T16:49:00Z')).illumination).toBeGreaterThan(0.97);
    expect(moonPhase(at('2026-09-11T03:27:00Z')).illumination).toBeLessThan(0.03);
  });
});
