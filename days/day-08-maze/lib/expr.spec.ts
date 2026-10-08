import { describe, expect, it } from 'vitest';
import { evaluate, interpolate } from './expr';

describe('expr', () => {
  const scope = { groupe: 'A+', cholesterol: 190, loyer: 690, empreinte: true };

  it('évalue les conditions du contenu', () => {
    expect(evaluate("groupe != 'O-' || cholesterol >= loyer", scope)).toBe(true);
    expect(evaluate("groupe == 'O-' && cholesterol < loyer", scope)).toBe(false);
    expect(evaluate('!empreinte', scope)).toBe(false);
    expect(evaluate('(loyer - cholesterol) * 2', scope)).toBe(1000);
    expect(evaluate('loyer % 100 == 90', scope)).toBe(true);
    expect(evaluate("len('Jean-Pierre') > len(groupe)", scope)).toBe(true);
    expect(evaluate('max(loyer, cholesterol, 3)', scope)).toBe(690);
  });

  it('refuse une variable inconnue', () => {
    expect(() => evaluate('salaire > 3', scope)).toThrow(/inconnue/);
  });

  it('interpole les variables et les expressions', () => {
    expect(interpolate('Loyer : {loyer} €', scope)).toBe('Loyer : 690 €');
    expect(interpolate('{loyer * 200} €', scope)).toBe('138 000 €');
  });
});
