import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Demand } from './demand';
import { Duel } from './duel';
import { buildNetwork } from './network';
import { noteVsGhost } from './score';

const net = buildNetwork();
const demand = new Demand(net);

describe('Duel', () => {
  it('donne exactement le score du fantôme à un joueur qui ne fait que le pilote automatique', () => {
    const duel = new Duel(net, demand, { seed: 12 });
    while (duel.time < 11 * 60) duel.step(CONFIG.step, true);
    expect(duel.player.stats.spawned).toBe(duel.ghost.stats.spawned);
    expect(duel.player.points).toBe(duel.ghost.points);
    const perfect = duel.player.stats.spawned * CONFIG.riderSize;
    expect(noteVsGhost(duel.player.points, duel.ghost.points, perfect)).toBe(10);
  });

  it('fait subir les mêmes imprévus aux deux camps', () => {
    const duel = new Duel(net, demand, { seed: 21 });
    while (duel.time < 12 * 60) duel.step(CONFIG.step);
    expect(duel.player.depot + duel.player.withheld).toBeGreaterThanOrEqual(0);
    expect(duel.player.withheld).toBe(duel.ghost.withheld);
    expect(duel.incidentDeltas().length).toBe(
      duel.day.incidents.filter((i) => i.at <= duel.time).length,
    );
  });
});

describe('noteVsGhost', () => {
  it('vaut 10 à égalité, 20 au score parfait, et reste bornée', () => {
    expect(noteVsGhost(500, 500, 1000)).toBe(10);
    expect(noteVsGhost(1000, 500, 1000)).toBe(20);
    expect(noteVsGhost(-5000, 500, 1000)).toBe(0);
    expect(noteVsGhost(700, 500, 1000)).toBeGreaterThan(noteVsGhost(600, 500, 1000));
  });
});
