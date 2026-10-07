import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Demand } from './demand';
import { DemandStream, Spawn } from './demand-stream';
import { buildNetwork } from './network';
import { WEDNESDAY } from './scenario';

const net = buildNetwork();
const demand = new Demand(net);
const run = (stream: DemandStream, from: number, minutes: number) => {
  const out: Spawn[] = [];
  for (let t = from; t < from + minutes; t += CONFIG.step)
    stream.advance(t + CONFIG.step, CONFIG.step, out);
  return out;
};

describe('DemandStream', () => {
  it('rejoue exactement les mêmes voyageurs avec la même graine', () => {
    const a = run(new DemandStream(net, demand, { seed: 4 }), 480, 30);
    const b = run(new DemandStream(net, demand, { seed: 4 }), 480, 30);
    expect(a.length).toBeGreaterThan(100);
    expect(b).toEqual(a);
  });

  it('ne se mélange pas quand deux flux partagent la même Demand', () => {
    const solo = run(new DemandStream(net, demand, { seed: 9, scenario: WEDNESDAY }), 1100, 20);
    const a = new DemandStream(net, demand, { seed: 9, scenario: WEDNESDAY });
    const b = new DemandStream(net, demand, { seed: 1 });
    const out: Spawn[] = [];
    for (let t = 1100; t < 1120; t += CONFIG.step) {
      a.advance(t + CONFIG.step, CONFIG.step, out);
      b.advance(t + CONFIG.step, CONFIG.step, []);
    }
    expect(out).toEqual(solo);
  });

  it('augmente la demande pendant un épisode de pluie', () => {
    const dry = run(new DemandStream(net, demand, { seed: 2 }), 600, 60).length;
    const wet = run(
      new DemandStream(net, demand, { seed: 2, windows: [{ at: 0, until: 2000, factor: 1.15 }] }),
      600,
      60,
    ).length;
    expect(wet / dry).toBeGreaterThan(1.08);
    expect(wet / dry).toBeLessThan(1.22);
  });

  it('attire du monde vers le stade avant le match', () => {
    const stade = net.byId.get('stade-de-la-mosson')!;
    const out = run(
      new DemandStream(net, demand, { seed: 3, scenario: WEDNESDAY }),
      18 * 60 + 35,
      40,
    );
    expect(out.filter((s) => s.dest === stade).length / out.length).toBeGreaterThan(0.1);
  });
});
