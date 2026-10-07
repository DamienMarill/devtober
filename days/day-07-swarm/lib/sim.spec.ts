import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Demand } from './demand';
import { buildNetwork } from './network';
import { computeRoutes } from './routing';
import { ScenarioEvent, WEDNESDAY } from './scenario';
import { Sim, SimOptions } from './sim';

const net = buildNetwork();
const routes = computeRoutes(net);
const demand = new Demand(net);
const at = (id: string) => net.byId.get(id)!;
const line = (id: number) => net.lines.find((l) => l.id === id)!;
const make = (options: SimOptions = {}) =>
  new Sim(net, routes, demand, { track: false, ...options });
const run = (sim: Sim, minutes: number, check?: () => void) => {
  for (let t = 0; t < minutes; t += CONFIG.step) {
    sim.step(CONFIG.step);
    check?.();
  }
};

describe('Sim', () => {
  it('ouvre la journée avec la répartition réelle de 6 h et le reste au dépôt', () => {
    const sim = make();
    expect(sim.fleet).toBe(83);
    expect(sim.trams).toHaveLength(56);
    expect(sim.depot).toBe(27);
    expect(sim.lineStatus(line(1)).active).toBe(18);
  });

  it('emmène un voyageur à destination sur une seule ligne', () => {
    const sim = make({ demand: false });
    const r = sim.addRider(at('comedie'), at('odysseum'))!;
    run(sim, 60);
    expect(sim.stats.arrived).toBe(1);
    expect(r.tram).toBeNull();
    expect(sim.stats.waits).toBe(1);
  });

  it('fait changer de ligne à la gare Saint-Roch', () => {
    const sim = make({ demand: false });
    sim.addRider(at('juvignac'), at('jacou'));
    run(sim, 150);
    expect(sim.stats.arrived).toBe(1);
    expect(sim.stats.waits).toBe(2);
  });

  it('sort une rame du dépôt, avec un délai', () => {
    const sim = make({ demand: false });
    expect(sim.addRame(5)).toBe(true);
    expect(sim.depot).toBe(26);
    expect(sim.lineStatus(line(5)).active).toBe(9);
    const before = sim.trams.filter((t) => t.line.id === 5).length;
    run(sim, CONFIG.depot.deploy + 0.2);
    expect(sim.trams.filter((t) => t.line.id === 5).length).toBe(before + 1);
  });

  it('refuse une sortie quand le dépôt est vide', () => {
    const sim = make({ demand: false });
    while (sim.depot > 0) sim.addRame(1);
    expect(sim.addRame(2)).toBe(false);
    expect(sim.notices.at(-1)).toEqual({ kind: 'depot-empty' });
  });

  it('retire une rame : elle finit sa course puis rentre au dépôt', () => {
    const sim = make({ demand: false });
    const depot = sim.depot;
    expect(sim.removeRame(4)).toBe(true);
    expect(sim.lineStatus(line(4)).active).toBe(5);
    run(sim, 45);
    expect(sim.trams.filter((t) => t.line.id === 4)).toHaveLength(5);
    expect(sim.depot).toBe(depot + 1);
  });

  it('annule d’abord une sortie de dépôt pas encore arrivée', () => {
    const sim = make({ demand: false });
    sim.addRame(3);
    sim.removeRame(3);
    expect(sim.depot).toBe(27);
    expect(sim.incoming).toHaveLength(0);
  });

  it('garde les rames espacées et une seule rame par quai', () => {
    const sim = make({ start: 7 * 60 });
    run(sim, 90, () => {
      const docks = new Map<string, number>();
      for (const t of sim.trams) {
        if (t.state !== 'dwell' || !t.platform || t.platform.endsWith(':T')) continue;
        docks.set(t.platform, (docks.get(t.platform) ?? 0) + 1);
      }
      for (const n of docks.values()) expect(n).toBe(1);
    });
    expect(sim.stats.arrived).toBeGreaterThan(500);
  });

  it('ferme une station bloquée : personne n’y attend, aucune rame n’y entre', () => {
    const block: ScenarioEvent = {
      id: 'test',
      at: 6 * 60 + 1,
      until: 6 * 60 + 40,
      lead: 0,
      title: 'test',
      text: 'test',
      effect: { kind: 'block', station: 'comedie' },
    };
    const sim = make({ scenario: [block] });
    const comedie = at('comedie');
    run(sim, 1.2);
    const docked = () =>
      sim.trams.filter((t) => t.state === 'dwell' && t.path.stations[t.k] === comedie).length;
    const before = docked();
    run(sim, 30, () => {
      expect(sim.crowdAt(comedie)).toBe(0);
      expect(docked()).toBeLessThanOrEqual(before);
    });
    run(sim, 20);
    expect(sim.blocked.size).toBe(0);
  });

  it('immobilise une rame en panne', () => {
    const panne: ScenarioEvent = {
      ...WEDNESDAY.find((e) => e.id === 'panne')!,
      at: 6 * 60 + 1,
      until: 6 * 60 + 16,
    };
    const sim = make({ scenario: [panne] });
    run(sim, 2);
    expect(sim.trams.filter((t) => t.broken > 0)).toHaveLength(1);
    expect(sim.notices.some((n) => n.kind === 'start')).toBe(true);
  });

  it('fait abandonner les voyageurs qu’aucune rame ne prend', () => {
    const sim = make({ demand: false });
    sim.trams.length = 0;
    sim.addRider(at('corum'), at('comedie'));
    run(sim, CONFIG.riders.patience[1] + 1);
    expect(sim.stats.abandoned).toBe(1);
    expect(sim.waitingCount()).toBe(0);
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
