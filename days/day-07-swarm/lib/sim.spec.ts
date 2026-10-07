import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Demand, mulberry32 } from './demand';
import { checkInvariants } from './invariants';
import { buildNetwork } from './network';
import { Sim, SimOptions, Tram } from './sim';

const net = buildNetwork();
const demand = new Demand(net);
const at = (id: string) => net.byId.get(id)!;
const line = (id: number) => net.lines.find((l) => l.id === id)!;
const make = (options: SimOptions = {}) => new Sim(net, demand, { track: false, ...options });
const run = (sim: Sim, minutes: number, check?: () => void) => {
  const end = sim.time + minutes;
  while (sim.time < end) {
    sim.step(CONFIG.step);
    check?.();
  }
};
const docked = (sim: Sim, station: number, lineId?: number) =>
  sim.trams.filter(
    (t) =>
      t.state === 'dwell' &&
      t.path.stations[t.k] === station &&
      (lineId === undefined || t.line.id === lineId),
  ).length;
const invariants = (sim: Sim) => () => expect(checkInvariants(sim)).toEqual([]);

describe('Sim : rames et voyageurs', () => {
  it('ouvre la journée avec la répartition réelle de 6 h et le reste au dépôt', () => {
    const sim = make();
    expect(sim.fleet).toBe(83);
    expect(sim.trams).toHaveLength(56);
    expect(sim.depot).toBe(27);
    expect(sim.lineStatus(line(1)).active).toBe(18);
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('emmène un voyageur à destination sur une seule ligne', () => {
    const sim = make({ demand: false });
    // Depuis Corum, la 4 puis la 1 par Pompignane serait plus rapide : on part de la Comédie.
    sim.addRider(at('comedie'), at('odysseum'));
    run(sim, 60);
    expect(sim.stats.arrived).toBe(1);
    expect(sim.stats.waits).toBe(1);
  });

  it('fait changer de ligne à la gare Saint-Roch', () => {
    const sim = make({ demand: false });
    sim.addRider(at('juvignac'), at('jacou'));
    run(sim, 150);
    expect(sim.stats.arrived).toBe(1);
    expect(sim.stats.waits).toBe(2);
  });

  it('fait marcher un voyageur entre deux stations proches', () => {
    const sim = make({ demand: false });
    sim.addRider(at('comedie'), at('gare-saint-roch'));
    expect(sim.walkers).toHaveLength(1);
    run(sim, 10);
    expect(sim.stats.walked).toBe(1);
    expect(sim.points).toBe(0);
  });

  it('sort une rame du dépôt, avec un délai, et en annule une pas encore partie', () => {
    const sim = make({ demand: false });
    expect(sim.addRame(5)).toBe(true);
    expect(sim.lineStatus(line(5)).active).toBe(9);
    const before = sim.trams.filter((t) => t.line.id === 5).length;
    run(sim, CONFIG.depot.deploy + 0.2);
    expect(sim.trams.filter((t) => t.line.id === 5).length).toBe(before + 1);
    sim.addRame(3);
    sim.removeRame(3);
    expect(sim.depot).toBe(26);
  });

  it('retire une rame : elle finit sa course puis rentre au dépôt', () => {
    const sim = make({ demand: false });
    const depot = sim.depot;
    sim.removeRame(4);
    run(sim, 45);
    expect(sim.trams.filter((t) => t.line.id === 4)).toHaveLength(5);
    expect(sim.depot).toBe(depot + 1);
  });

  it('garde des comptes justes et une seule rame par quai, en pleine pointe', () => {
    const sim = make({ start: 7 * 60 });
    run(sim, 60, invariants(sim));
    expect(sim.stats.arrived).toBeGreaterThan(400);
  });

  it('fait abandonner les voyageurs qu’aucune rame ne prend, et compte les points', () => {
    const sim = make({ demand: false });
    for (const t of [...sim.trams]) sim.order(t.id, 'depot');
    run(sim, 3);
    sim.addRider(at('corum'), at('odysseum'), 12);
    run(sim, 13);
    expect(sim.stats.abandoned).toBe(1);
    expect(sim.stats.late).toBe(1);
    expect(sim.points).toBe(-4 * CONFIG.riderSize);
  });

  it('rejoue la même journée avec la même graine', () => {
    const a = make({ seed: 3 });
    const b = make({ seed: 3 });
    run(a, 30);
    run(b, 30);
    expect(a.stats.spawned).toBe(b.stats.spawned);
    expect(a.stats.arrived).toBe(b.stats.arrived);
  });
});

describe('Sim : plan d’exploitation', () => {
  it('coupe la Comédie : plus aucune rame n’y entre, puis le service reprend', () => {
    const sim = make({ start: 9 * 60 });
    const comedie = at('comedie');
    sim.setCut(comedie, true);
    run(sim, 2);
    run(sim, 30, () => {
      expect(docked(sim, comedie)).toBe(0);
      expect(checkInvariants(sim)).toEqual([]);
    });
    expect(sim.crowdAt(comedie)).toBe(0);
    sim.setCut(comedie, false);
    let seen = 0;
    run(sim, 20, () => (seen += docked(sim, comedie)));
    expect(seen).toBeGreaterThan(0);
  });

  it('dévie la 1 par Pompignane : elle ne s’arrête plus à la Comédie mais à Pompignane', () => {
    const sim = make({ start: 9 * 60 });
    sim.setDeviation('l1-pompignane', true);
    let pompignane = 0;
    let comedie = 0;
    // Les rames déjà engagées entre Corum et Place de l'Europe finissent leur tronçon.
    run(sim, 16);
    run(sim, 40, () => {
      pompignane += docked(sim, at('pompignane'), 1);
      comedie += docked(sim, at('comedie'), 1);
      expect(checkInvariants(sim)).toEqual([]);
    });
    expect(pompignane).toBeGreaterThan(0);
    expect(comedie).toBe(0);
  });

  it('passe sans s’arrêter dans une station non desservie', () => {
    const sim = make({ start: 9 * 60 });
    sim.setSkip(at('antigone'), true);
    run(sim, 3);
    let stops = 0;
    run(sim, 30, () => (stops += docked(sim, at('antigone'))));
    expect(stops).toBe(0);
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('fait tourner la 4 en navettes quand on coupe la gare, sans blocage', () => {
    const sim = make({ start: 9 * 60 });
    sim.setCut(at('gare-saint-roch'), true);
    run(sim, 60, invariants(sim));
    expect(sim.stats.watchdog).toBe(0);
    expect(sim.trams.filter((t) => t.line.id === 4 && !t.path.loop).length).toBeGreaterThan(3);
  });

  it('survit à une journée de décisions au hasard', () => {
    const sim = make({ start: 7 * 60 });
    const rng = mulberry32(11);
    const stations = net.stations.map((s) => s.index);
    let clock = 0;
    run(sim, 6 * 60, () => {
      expect(checkInvariants(sim)).toEqual([]);
      clock += CONFIG.step;
      if (clock < 3) return;
      clock = 0;
      const r = rng();
      const s = stations[Math.floor(rng() * stations.length)];
      if (r < 0.35) sim.setCut(s, !sim.plan.isCut(s));
      else if (r < 0.55) sim.setSkip(s, !sim.plan.isSkipped(s));
      else if (r < 0.65) sim.setDeviation('l1-pompignane', rng() < 0.5);
      else {
        const t = sim.trams[Math.floor(rng() * sim.trams.length)];
        const kinds = ['hold', 'turnBack', 'deadhead', 'deviate', 'depot'] as const;
        if (t) sim.order(t.id, kinds[Math.floor(rng() * kinds.length)]);
      }
    });
    expect(sim.stats.watchdog).toBe(0);
    expect(sim.stats.arrived).toBeGreaterThan(1000);
  });
});

describe('Sim : ordres aux rames', () => {
  const runningTram = (sim: Sim, lineId: number) =>
    sim.trams.find(
      (t) =>
        t.line.id === lineId && t.state === 'run' && t.k > 2 && t.k < t.path.stations.length - 4,
    )!;

  it('retient une rame au moins 2 minutes à sa prochaine station', () => {
    const sim = make({ start: 9 * 60 });
    const t = runningTram(sim, 2);
    const station = t.path.stations[t.k + 1];
    expect(sim.order(t.id, 'hold').ok).toBe(true);
    let arrived = -1;
    let left = -1;
    run(sim, 10, () => {
      const here = t.state === 'dwell' && t.path.stations[t.k] === station;
      if (here && arrived < 0) arrived = sim.time;
      if (!here && arrived >= 0 && left < 0) left = sim.time;
    });
    expect(left - arrived).toBeGreaterThanOrEqual(CONFIG.orders.hold - 0.06);
  });

  it('fait demi-tour au prochain arrêt', () => {
    const sim = make({ start: 9 * 60 });
    const t = runningTram(sim, 1);
    const dir = t.path.dir;
    sim.order(t.id, 'turnBack');
    run(sim, 6);
    expect(t.path.dir).toBe(-dir);
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('roule à vide et sans arrêt en haut-le-pied', () => {
    const sim = make({ start: 9 * 60 });
    const t = runningTram(sim, 1);
    sim.order(t.id, 'deadhead');
    run(sim, 4);
    expect(t.mode).toBe('deadhead');
    expect(t.riders).toHaveLength(0);
    const k = t.k;
    run(sim, 6);
    expect(t.k > k || t.path.dir !== 1).toBe(true);
  });

  it('dévie une seule rame, puis la remet dans le service à son terminus', () => {
    const sim = make({ start: 9 * 60 });
    const t = sim.trams.find(
      (x: Tram) => x.line.id === 1 && x.path.dir === 1 && x.k < x.path.rank[at('corum')] - 2,
    )!;
    expect(sim.order(t.id, 'deviate').ok).toBe(true);
    expect(t.path.deviation).toBe('l1-pompignane');
    expect(sim.trams.filter((x) => x.path.deviation).length).toBe(1);
    run(sim, 150, invariants(sim));
    expect(t.path.deviation).toBeNull();
  });

  it('renvoie une rame au dépôt et refuse un ordre impossible', () => {
    const sim = make({ start: 9 * 60 });
    const t = runningTram(sim, 5);
    const n = sim.trams.length;
    sim.order(t.id, 'depot');
    expect(sim.order(t.id, 'hold')).toEqual({ ok: false, reason: 'Un ordre est déjà en cours' });
    run(sim, 6);
    expect(sim.trams).toHaveLength(n - 1);
    expect(sim.tramActions(sim.trams.find((x) => x.line.id === 2)!).deviate.ok).toBe(false);
  });
});

describe('Sim : obstructions', () => {
  it('bloque une station : aucune rame n’y entre', () => {
    const sim = make({ start: 9 * 60 });
    const corum = at('corum');
    run(sim, 1);
    sim.obstructions.set('test', { stations: [corum] });
    const before = docked(sim, corum);
    run(sim, 20, () => expect(docked(sim, corum)).toBeLessThanOrEqual(before));
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('bloque un tronçon : les rames qui y sont restent sur place', () => {
    const sim = make({ start: 9 * 60 });
    const t = sim.trams.find((x) => x.state === 'run' && x.p < 0.5)!;
    const [a, b] = [t.path.stations[t.k], t.path.stations[t.k + 1]];
    sim.obstructions.set('voiture', { edges: [[a, b]] });
    const p = t.p;
    run(sim, 10);
    expect(t.p).toBe(p);
    sim.obstructions.clear('voiture');
    run(sim, 5);
    expect(t.k !== sim.trams.find((x) => x === t)!.k || t.p > p || t.state === 'dwell').toBe(true);
  });

  it('fige les rames d’une zone sans courant', () => {
    const sim = make({ start: 9 * 60 });
    const zone = line(1).paths[0].stations.slice(10, 14);
    sim.obstructions.set('courant', { stations: zone, freeze: true });
    const frozen = sim.trams.filter(
      (t) =>
        zone.includes(t.path.stations[t.k]) &&
        (t.state === 'dwell' || zone.includes(t.path.stations[t.k + 1])),
    );
    const before = frozen.map((t) => [t.k, t.p, t.state]);
    run(sim, 10);
    expect(frozen.map((t) => [t.k, t.p, t.state])).toEqual(before);
  });
});
