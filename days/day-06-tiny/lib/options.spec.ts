import { describe, expect, it } from 'vitest';
import { MAX_CELLS_PARAM, ShareState, drawingOf, parseOptions, toQueryParams } from './options';
import { CONWAY, parseRule } from './rule';

/** Une adresse à partir des paramètres (comme le ferait le routeur). */
function search(params: Record<string, string | null>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null) out.set(k, v);
  return `?${out}`;
}

describe('parseOptions', () => {
  it('lit règle, semis, densité, graine et debug', () => {
    const o = parseOptions('?debug&rule=B36/S23&start=soup&density=0.4&seed=1234');
    expect(o).toEqual({
      debug: true,
      rule: parseRule('B36/S23'),
      start: 'soup',
      density: 0.4,
      seed: 1234,
    });
  });

  it('accepte la règle encodée', () => {
    expect(parseOptions('?rule=B2%2FS%2FC3').rule).toEqual(parseRule('B2/S/C3'));
  });

  it('ignore les valeurs invalides', () => {
    expect(parseOptions('?rule=nope&start=lol&density=3&seed=-1&cells=1.2.zz')).toEqual({
      debug: false,
    });
  });

  it('lit un dessin', () => {
    expect(parseOptions('?cells=10.20.bob$2bo$3o!').drawing).toEqual({
      x: 10,
      y: 20,
      rle: 'bob$2bo$3o!',
    });
  });
});

describe('toQueryParams', () => {
  const base: ShareState = {
    rule: CONWAY,
    start: 'tiny',
    density: 0.35,
    seed: null,
    drawing: null,
  };

  it('donne une adresse nue pour l’état par défaut', () => {
    expect(Object.values(toQueryParams(base)).every((v) => v === null)).toBe(true);
  });

  it('omet le semis et la densité par défaut de la souche', () => {
    const q = toQueryParams({
      ...base,
      rule: parseRule('B3678/S34678')!,
      start: 'soup',
      density: 0.5,
      seed: 9,
    });
    expect(q).toEqual({ rule: 'B3678/S34678', start: null, density: null, seed: '9', cells: null });
  });

  it('écrit ce qui s’écarte des valeurs par défaut', () => {
    const q = toQueryParams({ ...base, start: 'soup', density: 0.123, seed: 42 });
    expect(q).toEqual({ rule: null, start: 'soup', density: '0.12', seed: '42', cells: null });
  });

  it('remplace le semis par le dessin', () => {
    const q = toQueryParams({
      ...base,
      start: 'soup',
      seed: 3,
      drawing: { x: 1, y: 2, rle: 'o!' },
    });
    expect(q).toEqual({ rule: null, start: null, density: null, seed: null, cells: '1.2.o!' });
  });

  it('fait l’aller-retour avec parseOptions', () => {
    const state: ShareState = {
      rule: parseRule('B2/S345/C4H')!,
      start: 'drop',
      density: 0.6,
      seed: 77,
      drawing: null,
    };
    const o = parseOptions(search(toQueryParams(state)));
    expect({ ...state, ...o, debug: undefined }).toEqual({ ...state, debug: undefined });
  });
});

describe('drawingOf', () => {
  it('découpe le dessin et refuse ce qui est trop long', () => {
    const cells = new Uint8Array(10 * 10);
    cells[3 * 10 + 4] = 1;
    cells[3 * 10 + 5] = 1;
    expect(drawingOf(cells, 10, 10)).toEqual({ x: 4, y: 3, rle: '2o!' });
    expect(drawingOf(new Uint8Array(100), 10, 10)).toBeNull();
    // Une cellule sur trois en quinconce : un corps RLE bien plus long que le plafond.
    const noisy = new Uint8Array(120 * 90).map((_, i) => ((i * 7919) % 3 === 0 ? 1 : 0));
    expect(drawingOf(noisy, 120, 90)).toBeNull();
    expect(MAX_CELLS_PARAM).toBeLessThan(2000);
  });
});
