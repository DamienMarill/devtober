import { describe, expect, it } from 'vitest';
import { PATTERNS } from './patterns';
import { boundingBox, crop, encodeRle, parseRle } from './rle';

const count = (cells: Uint8Array) => cells.reduce((n, s) => n + (s === 1 ? 1 : 0), 0);

describe('parseRle', () => {
  it('lit un fichier complet', () => {
    const p = parseRle('#N Glider\n#C Un commentaire\nx = 3, y = 3, rule = B3/S23\nbob$2bo$3o!')!;
    expect(p.width).toBe(3);
    expect(p.height).toBe(3);
    expect(p.rule).toBe('B3/S23');
    expect([...p.cells]).toEqual([0, 1, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('accepte le corps seul et les lignes coupées', () => {
    const p = parseRle('2o\n$2o!')!;
    expect([p.width, p.height, count(p.cells)]).toEqual([2, 2, 4]);
  });

  it('répète les fins de ligne et ignore ce qui suit !', () => {
    const p = parseRle('o3$o! 5o')!;
    expect(p.height).toBe(4);
    expect(count(p.cells)).toBe(2);
  });

  it('lit les états multiples', () => {
    const p = parseRle('x = 4, y = 1, rule = B2/S/C3\n.AB2pA!')!;
    expect([...p.cells]).toEqual([0, 1, 2, 25, 25]);
  });

  it('garde la taille de l’en-tête et retire la topologie de la règle', () => {
    const p = parseRle('x = 5, y = 4, rule = B3/S23:T64,64\no!')!;
    expect([p.width, p.height, p.rule]).toEqual([5, 4, 'B3/S23']);
  });

  it('refuse le reste', () => {
    expect(parseRle('')).toBeNull();
    expect(parseRle('3z!')).toBeNull();
  });

  it('compte les cellules des motifs célèbres', () => {
    const expected = {
      glider: 5,
      lwss: 9,
      rpentomino: 5,
      acorn: 7,
      diehard: 7,
      gosper: 36,
      pulsar: 48,
    };
    for (const [id, n] of Object.entries(expected)) {
      expect(count(parseRle(PATTERNS[id as keyof typeof PATTERNS].rle)!.cells), id).toBe(n);
    }
    const gun = parseRle(PATTERNS.gosper.rle)!;
    expect([gun.width, gun.height]).toEqual([36, 9]);
    expect(count(parseRle(PATTERNS.replicator.rle)!.cells)).toBe(12);
  });
});

describe('encodeRle', () => {
  it('écrit le corps le plus court', () => {
    // Les morts en fin de ligne sont omis : `bob` devient `bo`.
    expect(encodeRle(parseRle('bob$2bo$3o!')!)).toBe('bo$2bo$3o!');
    expect(
      encodeRle({
        width: 3,
        height: 4,
        cells: new Uint8Array([0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1]),
      }),
    ).toBe('$2o2$2bo!');
  });

  it('fait l’aller-retour avec parseRle', () => {
    for (const { rle } of Object.values(PATTERNS)) {
      const p = parseRle(rle)!;
      const again = parseRle(encodeRle(p))!;
      expect(count(again.cells)).toBe(count(p.cells));
      expect(encodeRle(again)).toBe(encodeRle(p));
    }
  });
});

describe('boundingBox et crop', () => {
  it('trouvent et découpent les cellules vivantes', () => {
    const cells = new Uint8Array(25);
    cells[1 * 5 + 2] = 1;
    cells[3 * 5 + 3] = 1;
    cells[0] = 2;
    const box = boundingBox(cells, 5, 5)!;
    expect(box).toEqual({ x: 2, y: 1, width: 2, height: 3 });
    expect(encodeRle(crop(cells, 5, box))).toBe('o2$bo!');
    expect(boundingBox(new Uint8Array(4), 2, 2)).toBeNull();
  });
});
