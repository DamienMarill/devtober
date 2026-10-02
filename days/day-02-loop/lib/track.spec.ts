import { describe, expect, it } from 'vitest';
import {
  LOOP_RADIUS,
  LOOP_SPACING,
  START_AFTER_CROSSING,
  Track,
  elevation,
  figureEight,
  fitBox,
  grow,
} from './track';

const eight = figureEight();
const track = new Track(eight.points);

describe('figureEight', () => {
  it('fait la longueur attendue : quatre demi-droites et deux arcs', () => {
    const theta = Math.asin(LOOP_RADIUS / LOOP_SPACING);
    const expected = 4 * LOOP_SPACING * Math.cos(theta) + 2 * LOOP_RADIUS * (Math.PI + 2 * theta);
    expect(track.length).toBeCloseTo(expected, 0);
  });

  it('part de la ligne de départ, sur la droite qui descend du croisement', () => {
    const start = track.poseAt(0);
    expect(Math.hypot(start.x, start.y)).toBeCloseTo(START_AFTER_CROSSING, 6);
    expect(start.x).toBeGreaterThan(0);
    expect(start.y).toBeGreaterThan(0);
  });

  it('passe deux fois par le croisement, aux distances annoncées, en se croisant', () => {
    const [a, b] = eight.crossings.map((d) => track.poseAt(d));
    for (const p of [a, b]) expect(Math.hypot(p.x, p.y)).toBeLessThan(0.5);
    // Les deux passages ne vont pas dans la même direction.
    expect(Math.abs(Math.sin(a.angle - b.angle))).toBeGreaterThan(0.9);
  });

  it('suit les deux cercles dans les boucles', () => {
    // Au-delà des centres, on est forcément dans un virage : sur le cercle de la boucle.
    const outer = track.points.filter((p) => Math.abs(p.x) >= LOOP_SPACING);
    expect(outer.length).toBeGreaterThan(100);
    for (const p of outer) {
      const loop = eight.loops[p.x < 0 ? 0 : 1];
      expect(Math.hypot(p.x - loop.center.x, p.y - loop.center.y)).toBeCloseTo(LOOP_RADIUS, 6);
    }
    const far = track.points.reduce((a, b) => (b.x > a.x ? b : a));
    expect(far.x).toBeCloseTo(LOOP_SPACING + LOOP_RADIUS, 0);
  });

  it('se referme sans angle : la direction varie peu d’un point à l’autre', () => {
    for (let d = 0; d < track.length; d += 2) {
      const turn = track.poseAt(d + 4).angle - track.poseAt(d).angle;
      expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.1);
    }
  });

  it('est symétrique : la boîte est centrée sur le croisement', () => {
    const { box } = track;
    expect(box.minX).toBeCloseTo(-box.maxX, 0);
    expect(box.minY).toBeCloseTo(-box.maxY, 0);
  });
});

describe('Track', () => {
  it('boucle : une distance négative ou au-delà d’un tour retombe sur le circuit', () => {
    const a = track.poseAt(120);
    expect(track.poseAt(120 + track.length).x).toBeCloseTo(a.x, 6);
    expect(track.poseAt(120 - track.length).y).toBeCloseTo(a.y, 6);
  });

  it('interpole entre deux points', () => {
    const d = (track.cumulative[3] + track.cumulative[4]) / 2;
    const mid = track.poseAt(d);
    expect(mid.x).toBeCloseTo((track.points[3].x + track.points[4].x) / 2, 6);
    expect(mid.y).toBeCloseTo((track.points[3].y + track.points[4].y) / 2, 6);
  });

  it('décale perpendiculairement à la piste, à la bonne distance', () => {
    const pose = track.poseAt(300);
    const right = track.offsetAt(300, 10);
    const left = track.offsetAt(300, -10);
    expect(Math.hypot(right.x - pose.x, right.y - pose.y)).toBeCloseTo(10, 6);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeCloseTo(20, 6);
    const dot =
      (right.x - pose.x) * Math.cos(pose.angle) + (right.y - pose.y) * Math.sin(pose.angle);
    expect(dot).toBeCloseTo(0, 6);
  });

  it('trace une portion de rail entre deux distances, bornes comprises', () => {
    const lane = track.lane(5, 100, 200, 10);
    expect(lane).toHaveLength(11);
    expect(lane[0]).toEqual(track.offsetAt(100, 5));
    expect(lane[10]).toEqual(track.offsetAt(200, 5));
  });
});

describe('elevation', () => {
  const bridge = { center: 500, flat: 40, ramp: 100 };
  const length = 2000;

  it('vaut 1 sur le tablier, 0 loin du pont, et monte en douceur sur les rampes', () => {
    expect(elevation(bridge, length, 500)).toBe(1);
    expect(elevation(bridge, length, 535)).toBe(1);
    expect(elevation(bridge, length, 590)).toBeCloseTo(0.5, 6);
    expect(elevation(bridge, length, 410)).toBeCloseTo(0.5, 6);
    expect(elevation(bridge, length, 640)).toBe(0);
    expect(elevation(bridge, length, 1500)).toBe(0);
  });

  it('tient compte de la boucle (distances au-delà d’un tour)', () => {
    expect(elevation(bridge, length, 500 + 3 * length)).toBe(1);
    expect(elevation({ ...bridge, center: 10 }, length, 1990)).toBe(1);
  });
});

describe('fitBox', () => {
  it('centre la boîte dans la zone en gardant les proportions', () => {
    const box = { minX: 100, minY: 100, maxX: 300, maxY: 200 }; // 200 × 100
    const fit = fitBox(box, 1000, 1000, 50);
    expect(fit.scale).toBeCloseTo(4.5, 6); // (1000 - 100) / 200
    expect(box.minX * fit.scale + fit.tx).toBeCloseTo(50, 6);
    expect(box.maxX * fit.scale + fit.tx).toBeCloseTo(950, 6);
    const top = box.minY * fit.scale + fit.ty;
    const bottom = box.maxY * fit.scale + fit.ty;
    expect(top).toBeCloseTo(1000 - bottom, 6);
  });

  it('grow agrandit la boîte de chaque côté', () => {
    expect(grow({ minX: 0, minY: 0, maxX: 10, maxY: 20 }, 5)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 15,
      maxY: 25,
    });
  });
});
