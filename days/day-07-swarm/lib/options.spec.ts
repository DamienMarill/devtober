import { describe, expect, it } from 'vitest';
import { parseOptions } from './options';

describe('parseOptions', () => {
  it('lit le débogage, la graine et l’heure de prise de service', () => {
    expect(parseOptions('?debug&seed=42&start=17:30')).toEqual({
      debug: true,
      seed: 42,
      start: 1050,
    });
    expect(parseOptions('?start=8h05').start).toBe(485);
  });

  it('ignore les valeurs invalides', () => {
    expect(parseOptions('?seed=-1&start=3:00')).toEqual({ debug: false, seed: null, start: null });
    expect(parseOptions('?start=bientôt').start).toBeNull();
  });
});
