import { describe, expect, it } from 'vitest';
import { CROSSING, FIGURE_EIGHT, Track, fitBox } from './track';

describe('Track', () => {
  const track = new Track(FIGURE_EIGHT);

  it('est fermé : la distance 0 et la longueur totale donnent le même point', () => {
    const start = track.poseAt(0);
    const end = track.poseAt(track.length);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
    expect(track.length).toBeGreaterThan(2000);
  });

  it('part du premier point de contrôle et passe par les autres', () => {
    expect(track.poseAt(0)).toMatchObject(FIGURE_EIGHT[0]);
    for (const control of FIGURE_EIGHT) {
      const nearest = Math.min(
        ...track.points.map((p) => Math.hypot(p.x - control.x, p.y - control.y)),
      );
      expect(nearest).toBeLessThan(1e-9);
    }
  });

  it('passe deux fois par le croisement', () => {
    const passes = track.points.filter(
      (p) => Math.hypot(p.x - CROSSING.x, p.y - CROSSING.y) < 1e-9,
    );
    expect(passes).toHaveLength(2);
  });

  it('boucle : une distance négative ou au-delà d’un tour retombe sur le circuit', () => {
    const a = track.poseAt(120);
    expect(track.poseAt(120 + track.length)).toMatchObject(a);
    expect(track.poseAt(120 - track.length).x).toBeCloseTo(a.x, 6);
  });

  it('interpole entre deux échantillons', () => {
    const d = (track.cumulative[3] + track.cumulative[4]) / 2;
    const mid = track.poseAt(d);
    const a = track.points[3];
    const b = track.points[4];
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
  });

  it('décale perpendiculairement à la piste, à la bonne distance', () => {
    const pose = track.poseAt(300);
    const right = track.offsetAt(300, 10);
    const left = track.offsetAt(300, -10);
    expect(Math.hypot(right.x - pose.x, right.y - pose.y)).toBeCloseTo(10, 6);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeCloseTo(20, 6);
    // Perpendiculaire : produit scalaire nul avec la direction de la piste.
    const dot =
      (right.x - pose.x) * Math.cos(pose.angle) + (right.y - pose.y) * Math.sin(pose.angle);
    expect(dot).toBeCloseTo(0, 6);
  });

  it('calcule la boîte englobante', () => {
    const { box } = track;
    expect(box.minX).toBeLessThan(200);
    expect(box.maxX).toBeGreaterThan(900);
    expect(box.minY).toBeLessThan(80);
    expect(box.maxY).toBeGreaterThan(560);
  });
});

describe('fitBox', () => {
  it('centre la boîte dans la zone en gardant les proportions', () => {
    const box = { minX: 100, minY: 100, maxX: 300, maxY: 200 }; // 200 × 100
    const fit = fitBox(box, 1000, 1000, 50); // zone carrée : la largeur limite
    expect(fit.scale).toBeCloseTo(4.5, 6); // (1000 - 100) / 200
    expect(box.minX * fit.scale + fit.tx).toBeCloseTo(50, 6);
    expect(box.maxX * fit.scale + fit.tx).toBeCloseTo(950, 6);
    const top = box.minY * fit.scale + fit.ty;
    const bottom = box.maxY * fit.scale + fit.ty;
    expect(top).toBeCloseTo(1000 - bottom, 6); // centré verticalement
  });
});
