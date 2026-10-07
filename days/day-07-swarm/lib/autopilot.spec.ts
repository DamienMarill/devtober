import { describe, expect, it } from 'vitest';
import { autopilot, decide, targets } from './autopilot';
import { CONFIG } from './config';
import { Demand } from './demand';
import { buildNetwork } from './network';
import { computeRoutes } from './routing';
import { Sim } from './sim';

const net = buildNetwork();
const routes = computeRoutes(net);
const demand = new Demand(net);
const make = () => new Sim(net, routes, demand, { track: false, demand: false });

describe('autopilot', () => {
  it('répartit toute la flotte entre les lignes, avec un minimum par ligne', () => {
    const goal = targets(make());
    const total = [...goal.values()].reduce((s, n) => s + n, 0);
    expect(Math.abs(total - 83)).toBeLessThanOrEqual(3);
    for (const [id, n] of goal) expect(n).toBeGreaterThanOrEqual(CONFIG.autopilot.minPerLine[id]);
  });

  it('sort d’abord les rames du dépôt', () => {
    const sim = make();
    expect(decide(sim)?.add).toBeDefined();
    expect(autopilot(sim, 3)).toBe(3);
    expect(sim.depot).toBe(24);
  });

  it('renforce la ligne où la foule s’accumule', () => {
    const sim = make();
    while (sim.depot > 0) autopilot(sim, 30);
    const zoo = net.byId.get('cnrs-zoo-de-lunaret')!;
    const clapiers = net.byId.get('clapiers')!;
    for (let i = 0; i < 400; i++) sim.addRider(zoo, clapiers);
    const before = sim.lineStatus(net.lines[4]).active;
    const move = decide(sim);
    expect(move?.remove).toBeDefined();
    expect(move?.remove).not.toBe(5);
    expect(targets(sim).get(5)!).toBeGreaterThan(before);
  });
});
