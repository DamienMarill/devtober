import { describe, expect, it } from 'vitest';
import { TREES, canopyMask, growTree, treesOf } from './sakura';

describe('sakura', () => {
  it('fait toujours pousser le même arbre pour la même graine', () => {
    const spec = TREES.find((t) => t.layer === 'mid')!;
    const a = growTree(spec);
    const b = growTree(spec);
    expect(a.umbels.length).toBeGreaterThan(100);
    expect(a.umbels.length).toBe(b.umbels.length);
    expect(a.umbels[42]).toEqual(b.umbels[42]);
  });

  it('garde les fleurs des arbres proches dans les masses du croquis', () => {
    const mask = canopyMask();
    for (const tree of treesOf('right')) {
      const outside = tree.umbels.filter((u) => mask.at(u.x, u.y) < 0.02);
      expect(outside).toHaveLength(0);
    }
  });

  it('donne des bouquets de 2 à 5 fleurs, éclairés entre 0 et 1', () => {
    for (const tree of treesOf('left')) {
      for (const u of tree.umbels) {
        expect(u.count).toBeGreaterThanOrEqual(2);
        expect(u.count).toBeLessThanOrEqual(5);
        expect(u.light).toBeGreaterThanOrEqual(0);
        expect(u.light).toBeLessThanOrEqual(1);
      }
    }
  });
});
