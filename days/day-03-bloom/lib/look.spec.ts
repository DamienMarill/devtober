import { describe, expect, it } from 'vitest';
import { luminance, parseHex } from './color';
import { cityLights, computeLook } from './look';
import { OGAKI } from './ogaki';
import { moonState } from './solar';
import { toConditions } from './weather';

const at = (iso: string) => Date.parse(iso);
// Lever et coucher du 3 octobre 2026 (Open-Meteo).
const SUNRISES = [at('2026-10-03T05:49:32+09:00')];
const SUNSETS = [at('2026-10-03T17:35:09+09:00')];

function look(elevation: number, code = 0, clouds?: number) {
  return computeLook({
    sun: { elevation, azimuth: 250 },
    moon: moonState(at('2026-09-26T09:30:00Z'), OGAKI.latitude, OGAKI.longitude),
    lights: { lanterns: elevation < 0 ? 1 : 0 },
    conditions: toConditions({ code, cloudCover: clouds }),
  });
}

describe('cityLights', () => {
  it('allume les lanternes au coucher du soleil donné par l’API et les garde toute la nuit', () => {
    expect(cityLights(at('2026-10-03T15:00:00+09:00'), 20, SUNRISES, SUNSETS).lanterns).toBe(0);
    expect(cityLights(at('2026-10-03T18:30:00+09:00'), -10, SUNRISES, SUNSETS).lanterns).toBe(1);
    expect(cityLights(at('2026-10-03T22:30:00+09:00'), -30, SUNRISES, SUNSETS).lanterns).toBe(1);
    expect(cityLights(at('2026-10-03T03:00:00+09:00'), -40, [], SUNSETS).lanterns).toBe(1);
    expect(cityLights(at('2026-10-03T06:30:00+09:00'), 5, SUNRISES, SUNSETS).lanterns).toBe(0);
  });

  it('se rabat sur la hauteur du soleil sans données', () => {
    expect(cityLights(at('2026-10-03T19:00:00+09:00'), -12, [], []).lanterns).toBe(1);
    expect(cityLights(at('2026-10-03T12:00:00+09:00'), 50, [], []).lanterns).toBe(0);
  });
});

describe('computeLook', () => {
  it('assombrit et bleuit le ciel la nuit, sans laisser les fleurs dans le noir', () => {
    const day = look(40);
    const night = look(-25);
    const sky = (l: ReturnType<typeof look>) => luminance(parseHex(l.vars['--sky-top']));
    expect(sky(night)).toBeLessThan(sky(day) / 10);
    expect(night.stars).toBeGreaterThan(0.5);
    expect(day.stars).toBe(0);
    expect(Math.min(...night.canopy.ambient)).toBeGreaterThanOrEqual(0.2);
  });

  it('désature sous un ciel couvert et voile le lointain dans le brouillard', () => {
    expect(look(40, 3, 100).canopy.desaturate).toBeGreaterThan(look(40, 0, 0).canopy.desaturate);
    expect(look(40, 45).canopy.far).toBeGreaterThan(look(40, 0).canopy.far);
  });

  it('montre le soleil au-dessus de l’horizon et le cache dessous', () => {
    expect(look(10).sun.alpha).toBeGreaterThan(0.5);
    expect(look(-6).sun.alpha).toBe(0);
  });

  it('pose la lune là où elle est, de nuit seulement et au-dessus de l’horizon', () => {
    const moonLook = (sunElevation: number, iso: string) => {
      const moon = moonState(at(iso), OGAKI.latitude, OGAKI.longitude);
      return computeLook({
        sun: { elevation: sunElevation, azimuth: 250 },
        moon,
        lights: { lanterns: 1 },
        conditions: toConditions({ code: 0 }),
      }).moon;
    };
    // Pleine lune qui se lève à l'est (17 h 30 JST) : sous l'horizon à l'ouest, rien à voir.
    const rising = moonLook(-12, '2026-09-26T09:30:00Z');
    expect(rising.alpha).toBeGreaterThan(0.5);
    // Plus tard, elle est plus haute : donc plus haut dans le ciel (y plus petit).
    const higher = moonLook(-40, '2026-09-26T12:00:00Z');
    expect(higher.y).toBeLessThan(rising.y);
    // Après son coucher (6 h 30 JST, soleil encore bas) : elle a disparu.
    expect(moonLook(-3, '2026-09-26T21:30:00Z').alpha).toBe(0);
    // En plein jour, même au-dessus de l'horizon, pas de lune.
    expect(moonLook(45, '2026-09-26T03:00:00Z').alpha).toBe(0);
  });
});
