import { describe, expect, it } from 'vitest';
import { responder } from './bots';
import { CONFIG } from './config';
import { Demand } from './demand';
import { Duel } from './duel';
import { IncidentKind, drawDay } from './incidents';
import { buildNetwork } from './network';
import { Sim } from './sim';

/**
 * L'équilibrage du jeu, mesuré : sur chaque imprévu, un régulateur qui utilise les bons outils doit faire mieux
 * que le fantôme (le pilote automatique seul), et les outils mal employés doivent coûter des points. Les deux
 * camps répartissent leurs rames au pilote automatique : seule la réponse à l'imprévu change.
 */
const net = buildNetwork();
const demand = new Demand(net);

/** Points du joueur moins ceux du fantôme, sur un imprévu (de 30 min avant à 45 min après). */
function incidentDelta(kind: IncidentKind, seed: number, cutShort = false): number {
  const day = drawDay(net, seed, { only: [kind], count: [1, 1] });
  const spec = day.incidents[0];
  const duel = new Duel(net, demand, { seed, day, start: spec.at - 30 });
  const bot = responder(net, { cutShort });
  let clock = 1;
  while (duel.time < spec.until + 45) {
    duel.step(CONFIG.step, true);
    clock += CONFIG.step;
    if (clock >= 1) {
      clock = 0;
      bot.act(duel.player);
    }
  }
  return duel.player.points - duel.ghost.points;
}

/** Une politique sans imprévu, de 9 h à 12 h : ce que coûte un outil utilisé sans raison. */
function idleDelta(seed: number, policy: (sim: Sim, minute: number) => void): number {
  const duel = new Duel(net, demand, {
    seed,
    day: { evening: 'match', incidents: [] },
    start: 9 * 60,
  });
  let minute = 0;
  let clock = 1;
  while (duel.time < 12 * 60) {
    duel.step(CONFIG.step, true);
    clock += CONFIG.step;
    if (clock >= 1) {
      clock = 0;
      policy(duel.player, minute++);
    }
  }
  return duel.player.points - duel.ghost.points;
}

const seeds = [1, 2, 3, 4];
/** Chaque cas simule plusieurs heures en double : on laisse le temps. */
const SLOW = 30_000;

describe('équilibrage : les bons outils battent le fantôme', () => {
  for (const kind of ['car', 'package', 'power', 'cortege'] as const) {
    it(
      `face à « ${kind} »`,
      () => {
        const deltas = seeds.map((s) => incidentDelta(kind, s));
        expect(deltas.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
        expect(deltas.filter((d) => d > 0).length).toBeGreaterThanOrEqual(3);
      },
      SLOW,
    );
  }
});

describe('équilibrage : les outils ont un coût', () => {
  it(
    'couper pour un accrochage de 10 minutes coûte plus que d’attendre',
    () => {
      const deltas = [1, 2].map((s) => incidentDelta('scooter', s, true));
      expect(deltas.every((d) => d < 0)).toBe(true);
    },
    SLOW,
  );

  it(
    'couper la Comédie sans raison fait perdre des points',
    () => {
      const comedie = net.byId.get('comedie')!;
      const d = idleDelta(1, (sim, m) => {
        if (m === 0) sim.setCut(comedie, true);
        if (m === 30) sim.setCut(comedie, false);
      });
      expect(d).toBeLessThan(0);
    },
    SLOW,
  );

  it(
    'laisser la déviation toute la matinée ne rapporte rien',
    () => {
      const d = idleDelta(1, (sim, m) => {
        if (m === 0) sim.setDeviation('l1-pompignane', true);
      });
      expect(d).toBeLessThan(0);
    },
    SLOW,
  );
});
