import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Glow, GlowField } from './glows';
import { seeded } from './math';
import { createParams } from './params';

const noContact = { contact: () => {} };

function spawnMany(field: GlowField, n: number): Glow[] {
  const p = createParams();
  const out: Glow[] = [];
  for (let i = 0; i < n; i++) {
    const g = field.spawn(0, 0, 0, 0, 0.9, 0.5, p)!;
    out.push({ ...g });
    g.active = false;
  }
  return out;
}

describe('GlowField', () => {
  it('ouverture : le premier glow n’est pas coherent, un coherent arrive au plus tard au rang prévu', () => {
    for (let seed = 0; seed < 50; seed++) {
      const glows = spawnMany(new GlowField(seeded(seed)), CONFIG.opening.coherentBy);
      expect(glows[0].coherent).toBe(false);
      expect(glows.some((g) => g.coherent)).toBe(true);
    }
  });

  it('le premier contact donne unstable, puis les proportions prévues', () => {
    const field = new GlowField(seeded(11));
    const [g] = spawnMany(field, 1);
    expect(field.outcomeFor(g)).toBe('unstable');
    const counts = { stable: 0, inert: 0, unstable: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) counts[field.outcomeFor(g)]++;
    expect(counts.stable / n).toBeCloseTo(CONFIG.outcomes.stable, 1);
    expect(counts.inert / n).toBeCloseTo(CONFIG.outcomes.inert, 1);
  });

  it('un glow non coherent se dissipe à l’approche et ne revient pas', () => {
    const field = new GlowField(seeded(3));
    const p = createParams();
    field.step(1 / 60, true, false, 0, 0, 0, 0, p, 0, 0, 0.9, 0.5, noContact);
    const g = field.pool.find((x) => x.active)!;
    expect(g.coherent).toBe(false);
    let total = 0;
    for (let k = 0; k <= 100; k++) {
      const t = k / 100;
      const x = g.x * t;
      const y = g.y * t;
      field.step(1 / 60, true, false, x, y, 0, 0, p, 0, 0, 0.9, 0.5, noContact);
      total += field.dissipated;
    }
    expect(g.residual).toBeLessThan(0.01);
    expect(total).toBeCloseTo(1, 2);
    field.step(1 / 60, true, false, 0, 0, 0, 0, p, 0, 0, 0.9, 0.5, noContact);
    expect(g.residual).toBeLessThan(0.01);
  });
});
