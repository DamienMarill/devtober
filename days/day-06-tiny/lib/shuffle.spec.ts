import { describe, expect, it } from 'vitest';
import { NEIGHBORS } from './rule';
import { isLively, randomRule, shuffleRule } from './shuffle';
import { seeded } from './seed';
import { parseRule } from './rule';
import { tourStep } from './tour';

describe('randomRule', () => {
  it('ne tire jamais B0 ni de compte impossible', () => {
    const rng = seeded(1);
    for (const neighborhood of ['moore', 'vonNeumann', 'hex'] as const) {
      for (let i = 0; i < 200; i++) {
        const r = randomRule(rng, neighborhood);
        expect(r.birth & 1).toBe(0);
        expect(r.birth).toBeGreaterThan(0);
        expect(r.birth >> (NEIGHBORS[neighborhood] + 1)).toBe(0);
        expect(r.survive >> (NEIGHBORS[neighborhood] + 1)).toBe(0);
        expect(r.states).toBeGreaterThanOrEqual(2);
        expect(r.states).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('isLively', () => {
  it('garde Conway et rejette les règles qui meurent ou saturent', () => {
    expect(isLively(parseRule('B3/S23')!, 1)).toBe(true);
    expect(isLively(parseRule('B8/S')!, 1)).toBe(false);
    expect(isLively(parseRule('B12345678/S012345678')!, 1)).toBe(false);
  });
});

describe('shuffleRule', () => {
  it('rejoue la même règle pour la même graine, dans le voisinage demandé', () => {
    expect(shuffleRule(5, 'hex')).toEqual(shuffleRule(5, 'hex'));
    expect(shuffleRule(5, 'hex').neighborhood).toBe('hex');
  });
});

describe('tourStep', () => {
  it('avance d’une étape toutes les `duration` secondes puis s’arrête', () => {
    expect(tourStep(0, 5, 6)).toBe(0);
    expect(tourStep(6.1, 5, 6)).toBe(1);
    expect(tourStep(29.9, 5, 6)).toBe(4);
    expect(tourStep(30, 5, 6)).toBe(-1);
  });
});
