import { describe, expect, it } from 'vitest';
import { buildNetwork } from './network';
import { computeRoutes } from './routing';

const net = buildNetwork();
const routes = computeRoutes(net);
const at = (id: string) => net.byId.get(id)!;
const route = (a: string, b: string) => routes[at(a)][at(b)];

describe('computeRoutes', () => {
  it('relie toutes les stations entre elles', () => {
    for (let o = 0; o < net.stations.length; o++) {
      for (let d = 0; d < net.stations.length; d++) {
        expect(routes[o][d].length > 0).toBe(o !== d);
      }
    }
  });

  it('va de Lapeyronie à Odysseum sans changer de ligne', () => {
    expect(route('hopital-lapeyronie', 'odysseum')).toEqual([
      { line: 1, from: at('hopital-lapeyronie'), to: at('odysseum'), dir: 0 },
    ]);
  });

  it('préfère la 3, plus directe, pour aller de Mosson à Port Marianne', () => {
    expect(route('mosson', 'port-marianne').map((l) => l.line)).toEqual([3]);
  });

  it('change à la gare Saint-Roch entre Juvignac et Jacou', () => {
    const legs = route('juvignac', 'jacou');
    expect(legs.map((l) => l.line)).toEqual([3, 2]);
    expect(legs[0].to).toBe(at('gare-saint-roch'));
    expect(legs[1].from).toBe(at('gare-saint-roch'));
  });

  it('change de branche à Soriech entre Pérols et Lattes', () => {
    const legs = route('perols-etang-de-l-or', 'lattes-centre');
    expect(legs.map((l) => l.line)).toEqual([3, 3]);
    expect(legs[0].to).toBe(at('soriech'));
  });

  it('prend le sens le plus court sur la boucle de la 4', () => {
    expect(route('garcia-lorca', 'la-rauze')[0].dir).toBe(-1);
    expect(route('garcia-lorca', 'restanque')[0].dir).toBe(1);
  });

  it('enchaîne des morceaux qui se suivent', () => {
    const legs = route('clapiers', 'perols-etang-de-l-or');
    expect(legs[0].from).toBe(at('clapiers'));
    expect(legs.at(-1)!.to).toBe(at('perols-etang-de-l-or'));
    for (let i = 1; i < legs.length; i++) expect(legs[i].from).toBe(legs[i - 1].to);
  });
});
