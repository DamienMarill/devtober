import { describe, expect, it } from 'vitest';
import {
  BRIDGE_FACE,
  LEFT_MASS,
  Mask,
  RIGHT_MASS,
  homography,
  inside,
  maskGradient,
} from './composition';

describe('composition', () => {
  it('laisse le pont et le creux du ciel hors des masses de fleurs', () => {
    const mask = new Mask([LEFT_MASS, RIGHT_MASS]);
    // Le milieu du pont, le ciel au-dessus des montagnes : rien.
    expect(mask.at(720, 560)).toBe(0);
    expect(mask.at(760, 120)).toBe(0);
    // Les côtés et le bas : des fleurs.
    expect(mask.at(80, 600)).toBeCloseTo(1);
    expect(mask.at(1500, 600)).toBeCloseTo(1);
    // Hors de la grille, on prolonge le bord : sur les côtés, la masse ; au-dessus, le ciel.
    expect(mask.at(-2000, 500)).toBeCloseTo(1);
    expect(mask.at(760, -2000)).toBe(0);
  });

  it('teste l’appartenance à un polygone', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(inside(square, 5, 5)).toBe(true);
    expect(inside(square, 15, 5)).toBe(false);
  });

  it('indique la direction de la masse depuis son bord', () => {
    const mask = new Mask([LEFT_MASS, RIGHT_MASS]);
    // Juste à droite du bord gauche de la trouée : la masse est à gauche (angle négatif).
    const toward = maskGradient(mask, 530, 600);
    expect(toward).toBeDefined();
    expect(Math.sin(toward!)).toBeLessThan(0);
  });

  it('envoie le carré unité sur la face du pont', () => {
    const face = homography(BRIDGE_FACE);
    BRIDGE_FACE.forEach((corner, i) => {
      const [u, v] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ][i];
      const [x, y] = face(u, v);
      expect(x).toBeCloseTo(corner[0], 6);
      expect(y).toBeCloseTo(corner[1], 6);
    });
  });
});
