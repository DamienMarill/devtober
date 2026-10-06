import { describe, expect, it } from 'vitest';
import { CONWAY, formatRule, normalize, parseRule, sameRule, transitionTable } from './rule';

describe('parseRule', () => {
  it('lit la notation B/S, dans les deux ordres', () => {
    expect(parseRule('B3/S23')).toEqual(CONWAY);
    expect(parseRule('s23/b3')).toEqual(CONWAY);
    expect(parseRule(' b3 / s23 ')).toEqual(CONWAY);
  });

  it('lit la notation S/B sans lettres (MCell, Golly)', () => {
    expect(parseRule('23/3')).toEqual(CONWAY);
    expect(formatRule(parseRule('/2')!)).toBe('B2/S');
  });

  it('lit les règles Generations, avec ou sans préfixe', () => {
    for (const text of ['B2/S/C3', 'B2/S/G3', 'B2/S/3', '/2/3']) {
      expect(parseRule(text)).toEqual({
        birth: 0b100,
        survive: 0,
        states: 3,
        neighborhood: 'moore',
      });
    }
    expect(formatRule(parseRule('345/2/4')!)).toBe('B2/S345/C4');
  });

  it('lit les suffixes de voisinage', () => {
    expect(parseRule('B2/S34H')?.neighborhood).toBe('hex');
    expect(parseRule('B2/S/C3V')?.neighborhood).toBe('vonNeumann');
  });

  it('retire B0 et les comptes impossibles pour le voisinage', () => {
    expect(formatRule(parseRule('B0123478/S01234678')!)).toBe('B123478/S01234678');
    expect(formatRule(parseRule('B1357/S02468V')!)).toBe('B13/S024V');
  });

  it('refuse ce qui n’est pas une règle', () => {
    for (const text of ['', 'B3', 'B9/S23', 'B3/S23/C99', 'B3/23', 'hello', 'B3/S23/C3/x']) {
      expect(parseRule(text)).toBeNull();
    }
  });
});

describe('formatRule', () => {
  it('écrit la forme canonique', () => {
    expect(formatRule(CONWAY)).toBe('B3/S23');
    expect(formatRule({ birth: 0b100, survive: 0b11100, states: 4, neighborhood: 'hex' })).toBe(
      'B2/S234/C4H',
    );
  });

  it('fait l’aller-retour avec parseRule', () => {
    for (const text of [
      'B36/S23',
      'B3678/S34678',
      'B2/S/C3',
      'B34678/S234/C24',
      'B2/S34H',
      'B/S',
    ]) {
      expect(formatRule(parseRule(text)!)).toBe(text);
    }
  });

  it('ignore les interrupteurs sans effet', () => {
    const vonNeumann = { ...CONWAY, birth: 0b1000 | (1 << 7), neighborhood: 'vonNeumann' as const };
    expect(formatRule(vonNeumann)).toBe('B3/S23V');
    expect(sameRule({ ...CONWAY, birth: CONWAY.birth | 1 }, CONWAY)).toBe(true);
  });
});

describe('normalize', () => {
  it('borne le nombre d’états', () => {
    expect(normalize({ ...CONWAY, states: 1 }).states).toBe(2);
    expect(normalize({ ...CONWAY, states: 99 }).states).toBe(24);
  });
});

describe('transitionTable', () => {
  it('range naissance puis survie', () => {
    const table = transitionTable(CONWAY);
    expect([...table.slice(0, 9)]).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect([...table.slice(9)]).toEqual([0, 0, 1, 1, 0, 0, 0, 0, 0]);
  });
});
