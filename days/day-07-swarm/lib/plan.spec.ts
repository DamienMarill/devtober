import { describe, expect, it } from 'vitest';
import { DEVIATIONS } from './deviations';
import { buildNetwork, segmentKey } from './network';
import {
  EMPTY_PLAN,
  LineService,
  OperatingPlan,
  PathRegistry,
  deriveService,
  deviatePath,
  sectionsOf,
} from './plan';
import { resnap } from './resnap';

const net = buildNetwork();
const at = (id: string) => net.byId.get(id)!;
const line = (id: number) => net.lines.find((l) => l.id === id)!;
const names = (ids: readonly number[]) => ids.map((s) => net.stations[s].id);
const ends = (ids: readonly number[]) => [names(ids)[0], names(ids).at(-1)];
const plan = (setup: (p: OperatingPlan) => void) => {
  const p = new OperatingPlan();
  setup(p);
  return p.snapshot();
};

describe('OperatingPlan', () => {
  it('ne compte que les vrais changements', () => {
    const p = new OperatingPlan();
    expect(p.setCut(at('comedie'), true)).toBe(true);
    expect(p.setCut(at('comedie'), true)).toBe(false);
    expect(p.version).toBe(1);
  });

  it('fait primer la coupure sur la non-desserte', () => {
    const p = new OperatingPlan();
    p.setSkip(at('antigone'), true);
    p.setCut(at('antigone'), true);
    expect(p.isSkipped(at('antigone'))).toBe(false);
    expect(p.setSkip(at('antigone'), true)).toBe(false);
  });
});

describe('deriveService', () => {
  it('redonne exactement les parcours du GTFS avec un plan vide', () => {
    const svc = deriveService(net, EMPTY_PLAN, new PathRegistry(net));
    for (const l of net.lines) {
      expect(new Set(svc.get(l.id)!.paths)).toEqual(new Set(l.paths));
    }
    expect(
      names(
        svc
          .get(3)!
          .startsAt.get(at('juvignac'))!
          .map((p) => p.stations.at(-1)!),
      ),
    ).toEqual(['perols-etang-de-l-or', 'lattes-centre']);
  });

  it('coupe le réseau comme le 10 novembre 2022 (manif au centre)', () => {
    const cut = plan((p) =>
      ['louis-blanc-agora-de-la-danse', 'corum', 'comedie', 'gare-saint-roch'].forEach((id) =>
        p.setCut(at(id), true),
      ),
    );
    const sec = (id: number) => sectionsOf(net, line(id), cut).map((s) => ends(s.stations));
    expect(sec(1)).toEqual([
      ['mosson', 'albert-1er-saint-charles'],
      ['du-guesclin', 'gare-sud-de-france'],
    ]);
    expect(sec(2)).toEqual([
      ['saint-jean-de-vedas-centre', 'rondelet'],
      ['beaux-arts', 'jacou'],
    ]);
    const l3 = sectionsOf(net, line(3), cut);
    expect(l3.map((s) => ends(s.stations))).toEqual([
      ['juvignac', 'observatoire'],
      ['place-carnot', 'perols-etang-de-l-or'],
      ['place-carnot', 'lattes-centre'],
    ]);
    expect(l3[0].branches).toEqual([0, 1]);
    expect(sec(4)).toEqual([
      ['observatoire', 'albert-1er-jardin-des-plantes'],
      ['les-aubes', 'rondelet'],
    ]);
    const reg = new PathRegistry(net);
    expect(new Set(deriveService(net, cut, reg).get(5)!.paths)).toEqual(new Set(line(5).paths));
  });

  it('fait alterner les branches de la 3 au terminus provisoire', () => {
    const cut = plan((p) => p.setCut(at('gare-saint-roch'), true));
    const svc = deriveService(net, cut, new PathRegistry(net)).get(3)!;
    const starts = svc.startsAt.get(at('place-carnot'))!;
    expect(starts.map((p) => names(p.stations).at(-1))).toEqual([
      'perols-etang-de-l-or',
      'lattes-centre',
    ]);
    expect(starts.every((p) => p.provisional[0])).toBe(true);
  });

  it('dévie la 1 par Les Aubes et Pompignane, dans les deux sens', () => {
    const dev = plan((p) => p.setDeviation('l1-pompignane', true));
    const svc = deriveService(net, dev, new PathRegistry(net)).get(1)!;
    const fwd = svc.paths.find((p) => p.dir === 1)!;
    const i = fwd.rank[at('corum')];
    expect(names(fwd.stations.slice(i, i + 4))).toEqual([
      'corum',
      'les-aubes',
      'pompignane',
      'place-de-l-europe',
    ]);
    // 2 + 2 + 2 minutes sur la voie de la 4, ralenties par les aiguillages.
    expect(fwd.minutes.slice(i, i + 3)).toEqual([3.2, 3.2, 3.2].map((m) => expect.closeTo(m, 5)));
    expect(fwd.rank[at('comedie')]).toBe(-1);
    expect(fwd.deviation).toBe('l1-pompignane');
    const back = svc.paths.find((p) => p.dir === -1)!;
    expect(back.rank[at('pompignane')]).toBeLessThan(back.rank[at('les-aubes')]);
  });

  it('dessine la déviation sur la voie de la 4', () => {
    const dev = plan((p) => p.setDeviation('l1-pompignane', true));
    const fwd = deriveService(net, dev, new PathRegistry(net)).get(1)!.paths[0];
    const l4 = line(4).paths[0];
    const s = at('pompignane');
    expect(fwd.offsets[fwd.rank[s] * 2]).toBeCloseTo(l4.offsets[l4.rank[s] * 2]);
    expect(fwd.offsets.every(Number.isFinite)).toBe(true);
  });

  it('garde la 1 entière si la déviation contourne la coupure, et la coupe sinon', () => {
    const around = plan((p) => {
      p.setDeviation('l1-pompignane', true);
      p.setCut(at('comedie'), true);
    });
    expect(sectionsOf(net, line(1), around)).toHaveLength(1);
    const blocked = plan((p) => {
      p.setDeviation('l1-pompignane', true);
      p.setCut(at('pompignane'), true);
    });
    expect(sectionsOf(net, line(1), blocked)).toHaveLength(2);
  });

  it('coupe un tronçon sans fermer de station', () => {
    const cut = plan((p) => p.setCutEdge(at('rondelet'), at('gare-saint-roch'), true));
    expect(sectionsOf(net, line(2), cut).map((s) => ends(s.stations))).toEqual([
      ['saint-jean-de-vedas-centre', 'rondelet'],
      ['gare-saint-roch', 'jacou'],
    ]);
    expect(net.segments.has(segmentKey(at('rondelet'), at('gare-saint-roch')))).toBe(true);
  });

  it('dévie une seule rame en gardant son parcours avant et après', () => {
    const reg = new PathRegistry(net);
    const base = line(1).paths[1];
    const one = deviatePath(net, reg, base, DEVIATIONS[0])!;
    expect(one.oneOff).toBe(true);
    expect(one.stations[0]).toBe(base.stations[0]);
    expect(one.stations.at(-1)).toBe(base.stations.at(-1));
    expect(one.rank[at('pompignane')]).toBeLessThan(one.rank[at('les-aubes')]);
  });
});

describe('resnap', () => {
  const reg = new PathRegistry(net);
  const service = (p = EMPTY_PLAN) => deriveService(net, p, reg);
  const l1 = line(1).paths[0];
  const k = (id: string) => l1.rank[at(id)];

  it('ne touche pas une rame dont le parcours est encore en service', () => {
    const snap = resnap(
      { path: l1, k: 3, state: 'run', p: 0.5, turned: true },
      service().get(1)!,
      EMPTY_PLAN,
    );
    expect(snap).toEqual({ kind: 'keep' });
  });

  it('fait reculer une rame qui roule vers une station coupée', () => {
    const cut = plan((p) => p.setCut(at('comedie'), true));
    const snap = resnap(
      { path: l1, k: k('corum'), state: 'run', p: 0.6, turned: true },
      service(cut).get(1)!,
      cut,
    );
    expect(snap.kind).toBe('shunt');
    if (snap.kind !== 'shunt') return;
    expect(names(snap.stations)).toEqual(['comedie', 'corum']);
    expect(snap.p).toBeCloseTo(0.4);
    expect(snap.backward).toBe(true);
  });

  it('fait ressortir une rame à quai dans une station coupée', () => {
    const cut = plan((p) => p.setCut(at('comedie'), true));
    const snap = resnap(
      { path: l1, k: k('comedie'), state: 'dwell', p: 0, turned: true },
      service(cut).get(1)!,
      cut,
    );
    expect(snap.kind === 'shunt' && names(snap.stations)).toEqual(['comedie', 'corum']);
  });

  it('bascule sur la déviation une rame encore avant Corum', () => {
    const dev = plan((p) => p.setDeviation('l1-pompignane', true));
    const svc = service(dev).get(1)!;
    const snap = resnap(
      { path: l1, k: k('louis-blanc-agora-de-la-danse'), state: 'run', p: 0.3, turned: true },
      svc,
      dev,
    );
    expect(snap.kind).toBe('move');
    if (snap.kind === 'move') expect(snap.path.deviation).toBe('l1-pompignane');
  });

  it('laisse finir son tronçon une rame déjà engagée sur l’ancien itinéraire', () => {
    const dev = plan((p) => p.setDeviation('l1-pompignane', true));
    const snap = resnap(
      { path: l1, k: k('gare-saint-roch'), state: 'run', p: 0.3, turned: true },
      service(dev).get(1)!,
      dev,
    );
    expect(snap).toEqual({ kind: 'stale' });
  });

  it('fait d’une station un terminus provisoire pour la rame qui y est à quai', () => {
    const cut = plan((p) => p.setCut(at('louis-blanc-agora-de-la-danse'), true));
    const snap = resnap(
      { path: l1, k: k('albert-1er-saint-charles'), state: 'dwell', p: 0, turned: true },
      service(cut).get(1)!,
      cut,
    );
    expect(snap.kind).toBe('move');
    if (snap.kind === 'move') {
      expect(snap.turned).toBe(false);
      expect(names(snap.path.stations).at(-1)).toBe('albert-1er-saint-charles');
    }
  });

  it('passe une rame de la boucle sur la navette quand on coupe la 4', () => {
    const cut = plan((p) => p.setCut(at('gare-saint-roch'), true));
    const loop = line(4).paths[0];
    const snap = resnap(
      { path: loop, k: 0, state: 'dwell', p: 0, turned: true },
      service(cut).get(4)!,
      cut,
    );
    expect(snap.kind).toBe('move');
    if (snap.kind === 'move') expect(snap.path.loop).toBe(false);
  });

  it('renvoie au dépôt quand la ligne n’a plus de service', () => {
    const empty: LineService = { ...service().get(1)!, paths: [] };
    expect(resnap({ path: l1, k: 2, state: 'run', p: 0, turned: true }, empty, EMPTY_PLAN)).toEqual(
      {
        kind: 'depot',
      },
    );
  });
});
