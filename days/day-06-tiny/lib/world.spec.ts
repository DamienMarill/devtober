import { describe, expect, it } from 'vitest';
import { parseRle } from './rle';
import { CONWAY, parseRule } from './rule';
import { stamp } from './seed';
import { World } from './world';

/** Les coordonnées des cellules vivantes, triées. */
function alive(world: World): string[] {
  const out: string[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) if (world.get(x, y) === 1) out.push(`${x},${y}`);
  }
  return out;
}

type Offsets = readonly (readonly [number, number])[];
const CROSS: Offsets = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
const HEX: Offsets = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];
const NE_SW: Offsets = [
  [1, -1],
  [-1, 1],
];

function withPattern(rle: string, width = 16, height = 16): World {
  const world = new World(width, height);
  stamp(world, parseRle(rle)!, width / 2, height / 2);
  return world;
}

describe('World', () => {
  it('garde le bloc immobile', () => {
    const world = withPattern('2o$2o!');
    const before = alive(world);
    world.step(CONWAY);
    expect(alive(world)).toEqual(before);
    expect(world.births).toBe(0);
    expect(world.deaths).toBe(0);
  });

  it('fait osciller le clignotant sur une période de 2', () => {
    const world = withPattern('3o!');
    const before = alive(world);
    world.step(CONWAY);
    expect(alive(world)).not.toEqual(before);
    expect(world.population).toBe(3);
    expect(world.births).toBe(2);
    expect(world.deaths).toBe(2);
    world.step(CONWAY);
    expect(alive(world)).toEqual(before);
  });

  it('déplace le planeur d’une case en diagonale toutes les 4 générations', () => {
    const world = withPattern('bob$2bo$3o!');
    const shifted = alive(world).map((c) => {
      const [x, y] = c.split(',').map(Number);
      return `${x + 1},${y + 1}`;
    });
    for (let i = 0; i < 4; i++) world.step(CONWAY);
    expect(alive(world).sort()).toEqual(shifted.sort());
    expect(world.generation).toBe(4);
  });

  it('replie les bords : le planeur fait le tour du tore', () => {
    const world = withPattern('bob$2bo$3o!', 8, 8);
    const before = alive(world);
    for (let i = 0; i < 32; i++) world.step(CONWAY);
    expect(alive(world)).toEqual(before);
  });

  it('fait vieillir les cellules d’une règle Generations (Brian’s Brain)', () => {
    const brain = parseRule('B2/S/C3')!;
    const world = new World(8, 8);
    world.set(3, 3, 1);
    world.set(4, 3, 1);
    world.step(brain);
    // Les deux vivantes s'épuisent (état 2) ; les cellules à exactement 2 voisins naissent.
    expect(world.get(3, 3)).toBe(2);
    expect(world.get(4, 3)).toBe(2);
    expect(world.get(3, 2)).toBe(1);
    expect(world.get(4, 4)).toBe(1);
    world.step(brain);
    expect(world.get(3, 3)).toBe(0);
  });

  it('compte 4 voisins en von Neumann et 6 en hexagonal', () => {
    // Une morte entourée de toutes ses voisines naît avec B4 (croix) ou B6 (hexagonal).
    const born = (text: string, cells: Offsets) => {
      const world = new World(8, 8);
      for (const [x, y] of cells) world.set(4 + x, 4 + y, 1);
      world.step(parseRule(text)!);
      return world.get(4, 4);
    };
    expect(born('B4/SV', CROSS)).toBe(1);
    expect(born('B4/S', CROSS)).toBe(1);
    expect(born('B6/SH', HEX)).toBe(1);
    // Les coins nord-est et sud-ouest ne sont pas voisins en hexagonal.
    expect(born('B2/SH', NE_SW)).toBe(0);
    expect(born('B2/S', NE_SW)).toBe(1);
  });

  it('tient à jour la population quand on dessine', () => {
    const world = new World(8, 8);
    world.set(1, 1, 1);
    world.set(1, 1, 1);
    world.set(2, 1, 1);
    expect(world.population).toBe(2);
    world.set(1, 1, 0);
    expect(world.population).toBe(1);
    world.set(-1, -1, 1);
    expect(world.get(7, 7)).toBe(1);
  });
});
