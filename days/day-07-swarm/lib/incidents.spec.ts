import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Demand } from './demand';
import { IncidentEngine, IncidentSpec, demandWindows, drawDay, routeLength } from './incidents';
import { buildNetwork } from './network';
import { Sim } from './sim';

const net = buildNetwork();
const demand = new Demand(net);
const run = (sim: Sim, minutes: number, check?: () => void) => {
  const end = sim.time + minutes;
  while (sim.time < end) {
    sim.step(CONFIG.step);
    check?.();
  }
};
const withIncident = (spec: IncidentSpec, start = spec.at - 1) =>
  new Sim(net, demand, { start, track: false, incidents: new IncidentEngine(net, [spec]) });

describe('drawDay', () => {
  it('tire les mêmes imprévus avec la même graine, et d’autres avec une autre', () => {
    expect(drawDay(net, 5)).toEqual(drawDay(net, 5));
    expect(drawDay(net, 5)).not.toEqual(drawDay(net, 6));
  });

  it('espace les incidents ponctuels et les garde dans la journée', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { incidents } = drawDay(net, seed);
      const points = incidents.filter((i) => !['strike', 'rain', 'cortege'].includes(i.kind));
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(points.length).toBeLessThanOrEqual(5);
      for (const i of incidents) {
        expect(i.at).toBeGreaterThanOrEqual(CONFIG.day.start);
        expect(i.until).toBeLessThan(CONFIG.day.end);
      }
    }
  });

  it('peut ne tirer qu’un type d’imprévu', () => {
    const { incidents } = drawDay(net, 3, { only: ['car'], count: [1, 1] });
    expect(incidents.map((i) => i.kind)).toEqual(['car']);
    expect(net.segments.size).toBeGreaterThan(0);
  });

  it('renforce la demande pendant la pluie', () => {
    const { incidents } = drawDay(net, 8, { only: ['rain'] });
    expect(demandWindows(incidents)).toEqual([
      { at: incidents[0].at, until: incidents[0].until, factor: 1.15 },
    ]);
  });
});

describe('IncidentEngine', () => {
  it('bloque le tronçon de la voiture, puis le libère', () => {
    const spec = drawDay(net, 3, { only: ['car'], count: [1, 1] }).incidents[0];
    const sim = withIncident(spec);
    run(sim, 2);
    expect(sim.obstructions.blocksEdge(spec.stations[0], spec.stations[1])).toBe(true);
    expect(sim.notices.some((n) => n.kind === 'incident' && n.stage === 'start')).toBe(true);
    run(sim, spec.until - sim.time + 0.5);
    expect(sim.obstructions.edges.size).toBe(0);
  });

  it('immobilise une rame de la ligne en panne', () => {
    const spec = drawDay(net, 4, { only: ['breakdown'], count: [1, 1] }).incidents[0];
    const sim = withIncident(spec);
    run(sim, 2);
    const stuck = sim.trams.filter((t) => t.immobile > 0);
    expect(stuck).toHaveLength(1);
    expect(stuck[0].line.id).toBe(spec.line);
    expect(stuck[0].cause).toBe('breakdown');
  });

  it('fait avancer le cortège au pas, autour de l’Écusson', () => {
    const spec = drawDay(net, 2, { only: ['cortege'] }).incidents[0];
    const engine = new IncidentEngine(net, [spec]);
    const sim = new Sim(net, demand, { start: spec.at - 1, track: false, incidents: engine });
    const total = routeLength(net, spec.stations);
    expect(spec.until - spec.at).toBeCloseTo(
      (total + spec.params.length!) / spec.params.speed!,
      -1,
    );
    run(sim, 2);
    const first = [...engine.active[0].covered];
    expect(first).toContain(net.byId.get('comedie'));
    run(sim, 25);
    expect(engine.active[0].covered).not.toEqual(first);
    expect(engine.active[0].covered.every((s) => sim.obstructions.stations.has(s))).toBe(true);
  });

  it('ralentit les rames pendant la pluie et rend la vitesse après', () => {
    const spec = drawDay(net, 8, { only: ['rain'] }).incidents[0];
    const sim = withIncident(spec);
    run(sim, 2);
    expect(sim.slow).toBe(1.3);
    run(sim, spec.until - sim.time + 0.5);
    expect(sim.slow).toBe(1);
  });

  it('retient des rames au dépôt pendant la grève', () => {
    const spec = drawDay(net, 1, { only: ['strike'] }).incidents[0];
    const sim = new Sim(net, demand, { track: false, incidents: new IncidentEngine(net, [spec]) });
    sim.step(CONFIG.step);
    expect(sim.depot).toBe(27 - spec.params.withhold!);
  });
});
