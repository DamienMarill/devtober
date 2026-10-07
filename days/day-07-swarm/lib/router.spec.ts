import { describe, expect, it } from 'vitest';
import { buildNetwork } from './network';
import { EMPTY_PLAN, OperatingPlan, PathRegistry, deriveService } from './plan';
import { Leg, Router, RouterInput } from './router';

const net = buildNetwork();
const at = (id: string) => net.byId.get(id)!;
const allPaths = (svc = deriveService(net, EMPTY_PLAN, new PathRegistry(net))) =>
  [...svc.values()].flatMap((s) => s.paths);
const input = (over: Partial<RouterInput> = {}): RouterInput => ({
  paths: allPaths(),
  stops: () => true,
  walkFactor: 1,
  version: 1,
  ...over,
});
const make = (over: Partial<RouterInput> = {}, opts?: { walk?: boolean }) => {
  const r = new Router(net, opts);
  r.sync(input(over));
  return r;
};
const rides = (legs: readonly Leg[] | null) =>
  (legs ?? []).filter((l) => l.kind === 'ride').map((l) => (l.kind === 'ride' ? l.line : 0));

describe('Router', () => {
  const router = make({}, { walk: false });

  it('relie toutes les stations entre elles, même sans marcher', () => {
    for (let o = 0; o < net.stations.length; o++) {
      for (let d = 0; d < net.stations.length; d++) {
        expect(router.route(o, d)!.length > 0).toBe(o !== d);
      }
    }
  });

  it('va de Lapeyronie à Odysseum sans changer de ligne', () => {
    expect(router.route(at('hopital-lapeyronie'), at('odysseum'))).toEqual([
      { kind: 'ride', line: 1, from: at('hopital-lapeyronie'), to: at('odysseum'), dir: 0 },
    ]);
  });

  it('préfère la 3, plus directe, pour aller de Mosson à Port Marianne', () => {
    expect(rides(router.route(at('mosson'), at('port-marianne')))).toEqual([3]);
  });

  it('change à la gare Saint-Roch entre Juvignac et Jacou', () => {
    const legs = router.route(at('juvignac'), at('jacou'))!;
    expect(rides(legs)).toEqual([3, 2]);
    expect(legs[0].to).toBe(at('gare-saint-roch'));
  });

  it('change de branche à Soriech entre Pérols et Lattes', () => {
    const legs = router.route(at('perols-etang-de-l-or'), at('lattes-centre'))!;
    expect(rides(legs)).toEqual([3, 3]);
    expect(legs[0].to).toBe(at('soriech'));
  });

  it('prend le sens le plus court sur la boucle de la 4', () => {
    const dir = (to: string) => {
      const leg = router.route(at('garcia-lorca'), at(to))![0];
      return leg.kind === 'ride' ? leg.dir : null;
    };
    expect(dir('la-rauze')).toBe(-1);
    expect(dir('restanque')).toBe(1);
  });

  it('marche entre deux stations proches plutôt que d’attendre', () => {
    const walking = make();
    expect(walking.route(at('comedie'), at('gare-saint-roch'))).toEqual([
      expect.objectContaining({ kind: 'walk', from: at('comedie'), to: at('gare-saint-roch') }),
    ]);
  });

  it('fait marcher jusqu’à une station ouverte quand l’origine est fermée', () => {
    const closed = at('comedie');
    const r = make({ stops: (s) => s !== closed });
    const legs = r.route(closed, at('odysseum'))!;
    expect(legs[0].kind).toBe('walk');
    expect(legs.some((l) => l.kind === 'ride')).toBe(true);
  });

  it('suit le plan : avec la Comédie coupée, Mosson → Odysseum reste possible et contigu', () => {
    const p = new OperatingPlan();
    p.setCut(at('comedie'), true);
    const snap = p.snapshot();
    const r = make({
      paths: allPaths(deriveService(net, snap, new PathRegistry(net))),
      stops: (s) => !snap.cut.has(s),
    });
    const legs = r.route(at('mosson'), at('odysseum'))!;
    expect(legs[0].from).toBe(at('mosson'));
    expect(legs.at(-1)!.to).toBe(at('odysseum'));
    for (let i = 1; i < legs.length; i++) expect(legs[i].from).toBe(legs[i - 1].to);
    expect(legs.some((l) => l.from === at('comedie') || l.to === at('comedie'))).toBe(false);
  });

  it('va de Stade Philippidès à Pompignane sans changer quand la 1 est déviée', () => {
    expect(rides(router.route(at('stade-philippides'), at('pompignane')))).not.toEqual([1]);
    const p = new OperatingPlan();
    p.setDeviation('l1-pompignane', true);
    const r = make(
      { paths: allPaths(deriveService(net, p.snapshot(), new PathRegistry(net))) },
      { walk: false },
    );
    expect(rides(r.route(at('stade-philippides'), at('pompignane')))).toEqual([1]);
  });

  it('ne recalcule qu’une fois par origine et par version', () => {
    const r = make();
    r.route(at('mosson'), at('jacou'));
    r.route(at('mosson'), at('odysseum'));
    expect(r.counters.dijkstras).toBe(1);
    r.sync(input({ version: 2 }));
    r.route(at('mosson'), at('jacou'));
    expect(r.counters.dijkstras).toBe(2);
  });

  it('calcule toute la table en moins de 30 ms', () => {
    const r = make({ version: 7 });
    const t0 = performance.now();
    for (let o = 0; o < net.stations.length; o++) r.route(o, (o + 50) % net.stations.length);
    expect(performance.now() - t0).toBeLessThan(30);
  });
});
