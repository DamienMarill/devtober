import { describe, expect, it } from 'vitest';
import { Gusts, screenWind, windLabel, windStrength } from './wind';

describe('screenWind (regard vers l’ouest : la droite de l’écran est le nord)', () => {
  it('un vent du nord pousse vers la gauche', () => {
    expect(screenWind(5, 0)).toEqual({ x: -5, z: 0 });
  });
  it('un vent du sud pousse vers la droite', () => {
    expect(screenWind(5, 180)).toEqual({ x: 5, z: 0 });
  });
  it('un vent d’est pousse vers le pont, loin de nous', () => {
    expect(screenWind(5, 90)).toEqual({ x: 0, z: 5 });
  });
  it('un vent d’ouest souffle vers nous', () => {
    expect(screenWind(5, 270)).toEqual({ x: 0, z: -5 });
  });
  it('suit le cap de l’observateur', () => {
    // Regard vers le nord : un vent d'ouest pousse vers la droite (l'est).
    expect(screenWind(5, 270, 0)).toEqual({ x: 5, z: 0 });
  });
});

describe('windLabel / windStrength', () => {
  it('nomme la provenance', () => {
    expect(windLabel(270)).toBe("vent d'ouest");
    expect(windLabel(359)).toBe('vent du nord');
    expect(windLabel(135)).toBe('vent du sud-est');
  });
  it('qualifie la force', () => {
    expect(windStrength(0.2)).toBe('calme');
    expect(windStrength(2)).toBe('faible');
    expect(windStrength(10)).toBe('fort');
  });
});

describe('Gusts', () => {
  it('reste entre 0 et 1, monte parfois, et ne dépend que de la graine', () => {
    const gusts = new Gusts(7);
    const values = Array.from({ length: 2000 }, (_, i) => gusts.at(i * 0.25));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.max(...values)).toBeGreaterThan(0.6);
    // Au calme la moitié du temps environ : les rafales sont des bouffées.
    expect(values.filter((v) => v < 0.05).length).toBeGreaterThan(400);
    expect(new Gusts(7).at(42)).toBe(gusts.at(42));
  });
  it('va du vent moyen aux rafales', () => {
    const gusts = new Gusts(1);
    for (let t = 0; t < 200; t += 1.7) {
      const v = gusts.speed(t, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});
