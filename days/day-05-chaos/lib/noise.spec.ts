import { describe, expect, it } from 'vitest';
import { seeded } from './math';
import { LogisticNoise, SineNoise } from './noise';

describe('LogisticNoise', () => {
  it('reste bornée et continue', () => {
    const n = new LogisticNoise(0.37);
    let prev = n.value;
    for (let i = 0; i < 20_000; i++) {
      n.step(1 / 60, 1.2);
      const v = n.value;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });

  it('deux graines voisines divergent', () => {
    const a = new LogisticNoise(0.3);
    const b = new LogisticNoise(0.3 + 1e-9);
    let gap = 0;
    for (let i = 0; i < 120; i++) {
      a.step(1, 1);
      b.step(1, 1);
      gap = Math.max(gap, Math.abs(a.value - b.value));
    }
    expect(gap).toBeGreaterThan(0.3);
  });
});

describe('SineNoise', () => {
  it('reste dans [-1, 1] et se rejoue avec la même graine', () => {
    const a = new SineNoise(seeded(4));
    const b = new SineNoise(seeded(4));
    for (let t = 0; t < 500; t += 0.37) {
      expect(Math.abs(a.at(t))).toBeLessThanOrEqual(1);
      expect(a.at(t)).toBe(b.at(t));
    }
  });
});
