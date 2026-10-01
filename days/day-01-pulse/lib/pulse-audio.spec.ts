import { averageEnergy } from './pulse-audio';

describe('averageEnergy', () => {
  it('renvoie 0 pour un spectre silencieux', () => {
    expect(averageEnergy(new Uint8Array(16))).toBe(0);
  });

  it('renvoie 1 pour un spectre saturé', () => {
    expect(averageEnergy(new Uint8Array(16).fill(255))).toBe(1);
  });

  it('ignore le premier bin et les 6 derniers (comme slice(1, -6))', () => {
    const bins = new Uint8Array(16);
    bins[0] = 255; // continu
    for (let i = 10; i < 16; i++) bins[i] = 255; // aigus
    expect(averageEnergy(bins)).toBe(0);
    bins[1] = 255; // 1 bin sur les 9 pris en compte (1 à 9)
    expect(averageEnergy(bins)).toBeCloseTo(1 / 9);
  });

  it('renvoie 0 si le spectre est trop court', () => {
    expect(averageEnergy(new Uint8Array(6))).toBe(0);
  });
});
