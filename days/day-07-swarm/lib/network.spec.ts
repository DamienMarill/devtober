import { describe, expect, it } from 'vitest';
import { buildNetwork, cycleMinutes, project, segmentKey, shortName } from './network';

const net = buildNetwork();
const at = (id: string) => net.byId.get(id)!;
const line = (id: number) => net.lines.find((l) => l.id === id)!;

describe('buildNetwork', () => {
  it('a les 5 lignes et les 107 stations du GTFS', () => {
    expect(net.lines.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
    expect(net.stations).toHaveLength(107);
  });

  it('donne un aller et un retour par branche, et deux sens à la boucle', () => {
    expect(line(1).paths).toHaveLength(2);
    expect(line(3).paths).toHaveLength(4);
    expect(line(3).branches).toBe(2);
    expect(line(4).paths.map((p) => p.dir)).toEqual([1, -1]);
  });

  it('fait partir les branches de la 3 de Juvignac', () => {
    const [lattesOrPerols, , other] = line(3).paths;
    expect(lattesOrPerols.stations[0]).toBe(at('juvignac'));
    expect(other.stations[0]).toBe(at('juvignac'));
    expect(line(3).paths[1].stations.at(-1)).toBe(at('juvignac'));
  });

  it('fait repartir la boucle de Garcia Lorca dans les deux sens', () => {
    const [cw, ccw] = line(4).paths;
    expect(cw.stations[0]).toBe(ccw.stations[0]);
    expect(cw.stations[1]).toBe(ccw.stations.at(-1));
    expect(cw.minutes).toHaveLength(cw.stations.length);
    expect(ccw.minutes.reduce((s, m) => s + m, 0)).toBeCloseTo(
      cw.minutes.reduce((s, m) => s + m, 0),
    );
  });

  it('repère les correspondances et les terminus', () => {
    expect(net.stations[at('gare-saint-roch')].lines).toEqual([1, 2, 3, 4]);
    expect(net.stations[at('comedie')].lines).toEqual([1, 2]);
    expect(net.stations[at('jacou')].terminus).toBe(true);
    expect(net.stations[at('corum')].terminus).toBe(false);
  });

  it('sait que la 1 et la 2 partagent le tronçon Comédie – Corum', () => {
    expect(net.segments.get(segmentKey(at('comedie'), at('corum')))).toEqual([1, 2]);
  });

  it('décale les lignes d’un tronçon partagé de part et d’autre', () => {
    const l1 = line(1).paths[0];
    const l2 = line(2).paths[0];
    const k1 = l1.rank[at('comedie')];
    const k2 = l2.rank[at('comedie')];
    const dot =
      l1.offsets[k1 * 2] * l2.offsets[k2 * 2] + l1.offsets[k1 * 2 + 1] * l2.offsets[k2 * 2 + 1];
    expect(dot).toBeLessThan(0);
  });

  it('donne un tour de ligne réaliste', () => {
    expect(cycleMinutes(line(1))).toBeGreaterThan(115);
    expect(cycleMinutes(line(4))).toBeGreaterThan(30);
  });
});

describe('project', () => {
  it('met la Comédie au centre et grossit le centre-ville', () => {
    expect(project(43.608486, 3.879846)).toEqual({ x: 0, y: 0 });
    const near = project(43.6085, 3.884); // ~330 m à l'est
    const far = project(43.6085, 3.95); // ~5,6 km à l'est
    expect(near.x).toBeGreaterThan(0.3);
    expect(far.x / near.x).toBeLessThan(10);
  });
});

describe('shortName', () => {
  it('coupe au tiret ou à la parenthèse, sauf nom court choisi', () => {
    expect(shortName('boutonnet-cite-des-arts', 'Boutonnet - Cité des Arts')).toBe('Boutonnet');
    expect(shortName('universite-montpellier-triolet', 'Université Montpellier - Triolet')).toBe(
      'Triolet',
    );
  });
});
