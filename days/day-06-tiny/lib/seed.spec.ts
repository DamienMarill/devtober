import { describe, expect, it } from 'vitest';
import { DROP_SIZE, isStartId, seeded, sow, startLabel } from './seed';
import { World } from './world';

describe('seeded', () => {
  it('rejoue la même suite pour la même graine', () => {
    const a = seeded(42);
    const b = seeded(42);
    const c = seeded(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(c()).not.toBe(first[0]);
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('sow', () => {
  it('sème une soupe à la densité demandée, reproductible', () => {
    const a = new World(120, 90);
    const b = new World(120, 90);
    sow(a, 'soup', 0.35, 7);
    sow(b, 'soup', 0.35, 7);
    expect(a.cells).toEqual(b.cells);
    expect(a.population / a.size).toBeGreaterThan(0.32);
    expect(a.population / a.size).toBeLessThan(0.38);
    expect(a.generation).toBe(0);
  });

  it('limite la goutte au centre', () => {
    const world = new World(120, 90);
    sow(world, 'drop', 1, 1);
    expect(world.population).toBe(DROP_SIZE * DROP_SIZE);
    expect(world.get(0, 0)).toBe(0);
    expect(world.get(60, 45)).toBe(1);
  });

  it('pose les motifs au centre et efface l’ancien contenu', () => {
    const world = new World(120, 90);
    sow(world, 'soup', 0.5, 1);
    sow(world, 'glider', 0.5, 1);
    expect(world.population).toBe(5);
    sow(world, 'tiny', 0.5, 1);
    expect(world.population).toBeGreaterThan(100);
  });
});

describe('startLabel et isStartId', () => {
  it('nomme les semis', () => {
    expect(startLabel('soup', 0.35)).toBe('Soupe 35 %');
    expect(startLabel('gosper', 0.35)).toBe('Canon de Gosper');
    expect(isStartId('acorn')).toBe(true);
    expect(isStartId('toString')).toBe(false);
  });
});
