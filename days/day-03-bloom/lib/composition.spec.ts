import { describe, expect, it } from 'vitest';
import { LEFT_MASS, Mask, RIGHT_MASS, inside, maskGradient } from './composition';

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
});
