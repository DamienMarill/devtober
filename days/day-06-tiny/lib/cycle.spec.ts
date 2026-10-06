import { describe, expect, it } from 'vitest';
import { CycleWatch, hashCells } from './cycle';
import { parseRle } from './rle';
import { CONWAY } from './rule';
import { stamp } from './seed';
import { World } from './world';

function run(rle: string, generations: number) {
  const world = new World(20, 20);
  stamp(world, parseRle(rle)!, 10, 10);
  const watch = new CycleWatch();
  let verdict = watch.push(world.cells, world.population);
  for (let i = 0; i < generations; i++) {
    world.step(CONWAY);
    verdict = watch.push(world.cells, world.population);
  }
  return verdict;
}

describe('CycleWatch', () => {
  it('reconnaît un monde figé', () => {
    expect(run('2o$2o!', 2)).toEqual({ kind: 'still' });
  });

  it('reconnaît un oscillateur et sa période', () => {
    expect(run('3o!', 4)).toEqual({ kind: 'oscillator', period: 2 });
    expect(
      run(
        '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!',
        8,
      ),
    ).toEqual({ kind: 'oscillator', period: 3 });
  });

  it('reconnaît l’extinction', () => {
    expect(run('o!', 1)).toEqual({ kind: 'extinct' });
  });

  it('laisse vivre un planeur qui voyage', () => {
    expect(run('bob$2bo$3o!', 12)).toEqual({ kind: 'alive' });
  });

  it('oublie tout après reset', () => {
    const watch = new CycleWatch();
    const cells = new Uint8Array([1, 0]);
    watch.push(cells, 1);
    watch.reset();
    expect(watch.push(cells, 1)).toEqual({ kind: 'alive' });
  });

  it('distingue deux grilles différentes', () => {
    expect(hashCells(new Uint8Array([1, 0]))).not.toBe(hashCells(new Uint8Array([0, 1])));
  });
});
