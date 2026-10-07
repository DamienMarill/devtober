import { describe, expect, it } from 'vitest';
import { Demand, hourly, mulberry32 } from './demand';
import { buildNetwork } from './network';

const net = buildNetwork();
const demand = new Demand(net);
const at = (id: string) => net.byId.get(id)!;

describe('hourly', () => {
  it('vaut la valeur de l’heure en son milieu et interpole entre deux', () => {
    const curve = Array.from({ length: 24 }, (_, h) => h);
    expect(hourly(curve, 8 * 60 + 30)).toBeCloseTo(8);
    expect(hourly(curve, 9 * 60)).toBeCloseTo(8.5);
    expect(hourly(curve, 24 * 60 + 30)).toBeCloseTo(0);
  });
});

describe('mulberry32', () => {
  it('rejoue la même suite avec la même graine', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('Demand', () => {
  it('fait partir les gens de chez eux le matin et de la fac le soir', () => {
    const home = at('celleneuve');
    const campus = at('universite-paul-valery');
    expect(demand.emission(home, 8 * 60) / demand.emission(home, 18 * 60)).toBeGreaterThan(1.5);
    expect(demand.emission(campus, 17 * 60) / demand.emission(campus, 8 * 60)).toBeGreaterThan(3);
  });

  it('pèse plus lourd la gare Saint-Roch qu’un arrêt de quartier', () => {
    expect(demand.weight[at('gare-saint-roch')]).toBeGreaterThan(
      3 * demand.weight[at('saint-cleophas')],
    );
  });

  it('ne tire jamais l’origine comme destination', () => {
    const rng = mulberry32(1);
    const boost = new Float64Array(net.stations.length).fill(1);
    for (let i = 0; i < 500; i++) expect(demand.pick(5, 8 * 60, rng, boost)).not.toBe(5);
  });

  it('suit les coups de pouce des événements', () => {
    const rng = mulberry32(2);
    const boost = new Float64Array(net.stations.length).fill(1);
    const stade = at('stade-de-la-mosson');
    boost[stade] = 400;
    let hits = 0;
    for (let i = 0; i < 400; i++) if (demand.pick(0, 19 * 60, rng, boost, 1) === stade) hits++;
    expect(hits).toBeGreaterThan(200);
  });
});
