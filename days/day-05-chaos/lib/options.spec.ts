import { describe, expect, it } from 'vitest';
import { parseOptions } from './options';

describe('parseOptions', () => {
  it('lit debug, density et seed', () => {
    expect(parseOptions('?debug&density=0.6&seed=42')).toEqual({
      debug: true,
      density: 0.6,
      seed: 42,
    });
  });

  it('ignore density hors debug et les valeurs invalides', () => {
    expect(parseOptions('?density=0.6')).toEqual({ debug: false, density: null, seed: null });
    expect(parseOptions('?debug&density=2&seed=abc')).toEqual({
      debug: true,
      density: null,
      seed: null,
    });
  });
});
