import { describe, expect, it } from 'vitest';
import { luminance, parseHex } from './color';
import { cityLights, computeLook } from './look';
import { moonPhase } from './solar';
import { toConditions } from './weather';

const at = (iso: string) => Date.parse(iso);
// Lever et coucher du 3 octobre 2026 (Open-Meteo).
const SUNRISES = [at('2026-10-03T05:49:32+09:00')];
const SUNSETS = [at('2026-10-03T17:35:09+09:00')];

function look(elevation: number, code = 0, clouds?: number) {
  return computeLook({
    sun: { elevation, azimuth: 250 },
    moon: moonPhase(at('2026-10-03T12:00:00Z')),
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
});
