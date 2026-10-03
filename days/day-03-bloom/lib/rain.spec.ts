import { describe, expect, it } from 'vitest';
import { RainEnv, RainField, streak } from './rain';
import { seeded } from './random';

const VIEW = { x: 0, y: 0, w: 1600, h: 1000 };
const env = (extra: Partial<RainEnv> = {}): RainEnv => ({
  precip: 'rain',
  intensity: 0.8,
  wind: { x: 0, z: 0 },
  view: VIEW,
  time: 0,
  ...extra,
});

function run(field: RainField, seconds: number, e: RainEnv, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) field.step(dt, { ...e, time: t });
}

describe('RainField', () => {
  it('ne fait rien tomber sans précipitation', () => {
    const field = new RainField(seeded(1));
    run(field, 2, env({ precip: 'none' }));
    expect(field.drops).toHaveLength(0);
    run(field, 2, env({ intensity: 0 }));
    expect(field.drops).toHaveLength(0);
  });

  it('suit l’intensité, puis se vide quand la pluie cesse', () => {
    const field = new RainField(seeded(2));
    run(field, 3, env({ intensity: 1 }));
    const heavy = field.drops.length;
    expect(heavy).toBeGreaterThan(400);
    run(field, 3, env({ intensity: 0.2 }));
    expect(field.drops.length).toBeLessThan(heavy / 2);
    run(field, 3, env({ precip: 'none' }));
    expect(field.drops).toHaveLength(0);
  });

  it('fait tomber la neige moins vite que la pluie', () => {
    const rain = new RainField(seeded(3));
    const snow = new RainField(seeded(3));
    run(rain, 1, env());
    run(snow, 1, env({ precip: 'snow' }));
    const mean = (f: RainField) => f.drops.reduce((s, d) => s + d.fall, 0) / f.drops.length;
    expect(mean(snow)).toBeLessThan(mean(rain) / 3);
  });

  it('penche les gouttes dans le sens du vent', () => {
    const drop = { x: 0, y: 5, z: 10, fall: 7, wobble: 0 };
    const [x0, , x1] = streak(drop, { x: 5, z: 0 });
    expect(x0).toBeGreaterThan(x1); // la goutte vient de la gauche : le vent la pousse à droite
  });
});
