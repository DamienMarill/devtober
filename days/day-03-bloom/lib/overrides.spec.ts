import { describe, expect, it } from 'vitest';
import { atOgakiMinutes, formatOgakiTime, ogakiMinutes, spokenOgakiTime } from './clock';
import { parseOverrides } from './overrides';

describe('parseOverrides', () => {
  it('lit toutes les surcharges', () => {
    expect(parseOverrides('?debug&time=18:40&weather=rain&wind=8,270&clouds=90&speed=600')).toEqual(
      {
        debug: true,
        overrides: {
          time: 18 * 60 + 40,
          weather: 'rain',
          wind: { speed: 8, from: 270 },
          clouds: 0.9,
          speed: 600,
        },
      },
    );
  });

  it('ignore ce qui est invalide', () => {
    expect(parseOverrides('?time=25:00&weather=tornado&wind=abc&speed=-3')).toEqual({
      debug: false,
      overrides: {},
    });
  });

  it('accepte 7h05 et ramène le vent dans 0–360', () => {
    expect(parseOverrides('?time=7h05&wind=3,-90').overrides).toEqual({
      time: 425,
      wind: { speed: 3, from: 270 },
    });
  });
});

describe('horloge d’Ōgaki', () => {
  const ms = Date.parse('2026-10-03T21:00:00+09:00');

  it('donne l’heure locale (JST) quelle que soit celle de la machine', () => {
    expect(ogakiMinutes(ms)).toBe(21 * 60);
    expect(formatOgakiTime(ms)).toBe('21:00');
    expect(spokenOgakiTime(ms + 5 * 60_000)).toBe('21 h 05');
  });

  it('place une heure imposée dans la journée d’Ōgaki en cours', () => {
    const dawn = atOgakiMinutes(ms, 5 * 60 + 30);
    expect(dawn).toBe(Date.parse('2026-10-03T05:30:00+09:00'));
  });
});
