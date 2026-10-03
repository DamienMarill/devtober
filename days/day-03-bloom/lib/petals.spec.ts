import { describe, expect, it } from 'vitest';
import { PetalEnv, PetalField, Source } from './petals';
import { project } from './projection';
import { seeded } from './random';

/** Une grappe au-dessus de la rivière, à 12 m. */
const [sx, sy] = project(-5, 6, 12);
const SOURCES: Source[] = [{ x: sx, y: sy, r: 30, z: 12 }];
const VIEW = { x: 0, y: 0, w: 1600, h: 1000 };

function env(wind = { x: 0, z: 0 }, extra: Partial<PetalEnv> = {}): PetalEnv {
  return { wind, gust: 0, rain: 0, view: VIEW, time: 0, ...extra };
}

function run(field: PetalField, seconds: number, e: (t: number) => PetalEnv, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) field.step(dt, { ...e(t), time: t });
}

describe('PetalField', () => {
  it('fait naître des pétales sans dépasser le plafond', () => {
    const field = new PetalField(SOURCES, seeded(1));
    field.max = 50;
    run(field, 30, () => env({ x: 0, z: 0 }, { gust: 1 }));
    expect(field.petals.length).toBeGreaterThan(10);
    expect(field.petals.length).toBeLessThanOrEqual(50);
  });

  it('pousse les pétales dans le sens du vent', () => {
    const right = new PetalField(SOURCES, seeded(2));
    const left = new PetalField(SOURCES, seeded(2));
    run(right, 4, () => env({ x: 4, z: 0 }));
    run(left, 4, () => env({ x: -4, z: 0 }));
    const meanVx = (f: PetalField) => f.petals.reduce((s, p) => s + p.vx, 0) / f.petals.length;
    expect(meanVx(right)).toBeGreaterThan(2);
    expect(meanVx(left)).toBeLessThan(-2);
  });

  it('les fait tomber à environ 1 m/s, plus vite sous la pluie', () => {
    const dry = new PetalField(SOURCES, seeded(3));
    const wet = new PetalField(SOURCES, seeded(3));
    run(dry, 3, () => env());
    run(wet, 3, () => env({ x: 0, z: 0 }, { rain: 1 }));
    const meanVy = (f: PetalField) => {
      const air = f.petals.filter((p) => p.age > 1 && p.vy !== 0);
      return air.reduce((s, p) => s + p.vy, 0) / air.length;
    };
    expect(meanVy(dry)).toBeLessThan(-0.6);
    expect(meanVy(dry)).toBeGreaterThan(-1.6);
    expect(meanVy(wet)).toBeLessThan(meanVy(dry));
  });

  it('efface les pétales qui touchent le sol', () => {
    const field = new PetalField(SOURCES, seeded(4));
    run(field, 40, () => env());
    for (const p of field.petals) expect(p.y).toBeGreaterThanOrEqual(0);
    // Après 40 s, aucun pétale du début n'a survécu.
    expect(field.petals.every((p) => p.age < 40)).toBe(true);
  });

  it('n’émet rien sans source visible, sauf depuis le haut du cadre', () => {
    const field = new PetalField([], seeded(5));
    run(field, 5, () => env());
    expect(field.petals.length).toBeGreaterThan(0);
    // Les plus proches passent sous notre nez, jamais derrière nous.
    for (const p of field.petals) expect(p.z).toBeGreaterThan(1);
  });
});
