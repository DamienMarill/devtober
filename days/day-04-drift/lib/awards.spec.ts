import { describe, expect, it } from 'vitest';
import raw from '../derapawards-2026.json';
import {
  Awards,
  Mois,
  ceremonyNumber,
  checkAwards,
  domain,
  findCandidat,
  mentions,
  monthLabel,
  podium,
  roman,
  shortName,
} from './awards';

const awards = raw as unknown as Awards;

describe('le JSON des Dérapawards', () => {
  it('est cohérent : top 3 présents, notes = somme des critères, liens connus', () => {
    expect(checkAwards(awards)).toEqual([]);
  });

  it('donne un podium de trois pour chaque mois', () => {
    for (const mois of awards.mois) expect(podium(mois)).toHaveLength(3);
  });
});

describe('palmarès', () => {
  const janvier = awards.mois[0] as Mois;

  it('garde l’ordre du top 3 du JSON', () => {
    expect(podium(janvier).map((c) => c.id)).toEqual(janvier.top3);
  });

  it('classe les mentions par kilométrage décroissant, sans le podium', () => {
    const list = mentions(janvier);
    expect(list.length).toBe(janvier.candidats.length - 3);
    expect(list.some((c) => janvier.top3.includes(c.id))).toBe(false);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].kilometrage.note).toBeGreaterThanOrEqual(list[i].kilometrage.note);
    }
  });

  it('retrouve un candidat dans son mois', () => {
    const place = findCandidat(awards, janvier.top3[0]);
    expect(place?.mois.mois).toBe('2026-01');
    expect(findCandidat(awards, 'inconnu')).toBeUndefined();
  });

  it('repère un lien cassé', () => {
    const copy = structuredClone(awards);
    copy.mois[0].candidats[0].declenche.push('n-importe-quoi');
    expect(checkAwards(copy)).toHaveLength(1);
  });
});

describe('libellés', () => {
  it('écrit les chiffres romains', () => {
    expect([1, 3, 4, 9, 10].map(roman)).toEqual(['I', 'III', 'IV', 'IX', 'X']);
  });

  it('numérote les cérémonies à partir de janvier', () => {
    expect(ceremonyNumber(awards, '2026-01')).toBe(1);
    expect(ceremonyNumber(awards, '2026-09')).toBe(9);
  });

  it('met le mois en français', () => {
    expect(monthLabel('2026-03')).toBe('mars 2026');
  });

  it('raccourcit un nom et une source', () => {
    expect(shortName('Donald Trump, président des États-Unis')).toBe('Donald Trump');
    expect(shortName('CNews ; Jean Doridot, psychologue')).toBe('CNews');
    expect(domain('https://www.lcp.fr/actualites/x')).toBe('lcp.fr');
  });
});
