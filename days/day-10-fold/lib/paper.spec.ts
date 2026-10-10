import { describe, expect, it } from 'vitest';
import { area, overlaps, v } from './geometry';
import { MODELS } from './models';
import {
  bounds,
  depths,
  Folder,
  initialState,
  prepare,
  resolve,
  sheet,
  showsFront,
  topAt,
  worldPoly,
} from './paper';

/** Plie tout le modèle et renvoie l'état final. */
function foldAll(id: string) {
  const model = MODELS.find((m) => m.id === id)!;
  const folder = new Folder(model.sheet, model.steps);
  while (!folder.done) folder.commit(folder.next()!);
  return folder.state;
}

describe('le moteur de pliage', () => {
  it('amène un coin sur l’autre : la feuille en deux fait deux couches, retournées l’une sur l’autre', () => {
    const s0 = initialState('diamond');
    const m = prepare(s0, {
      kind: 'fold',
      id: 'half',
      text: '',
      folds: [{ from: sheet(0, Math.SQRT2), to: sheet(0, -Math.SQRT2) }],
    });
    expect(m.facets).toHaveLength(2);
    expect(m.result.facets.filter(showsFront)).toHaveLength(1);
    expect(Math.max(...m.depth1)).toBe(1);
    const top = resolve(m.result, sheet(0, Math.SQRT2));
    expect(top.x).toBeCloseTo(0, 9);
    expect(top.y).toBeCloseTo(-Math.SQRT2, 9);
  });

  it('une marque de pli laisse la feuille à plat, mais coupée et marquée', () => {
    const m = prepare(initialState('square'), {
      kind: 'fold',
      id: 'c',
      text: '',
      crease: true,
      folds: [{ from: sheet(-1, 1), to: sheet(1, 1) }],
    });
    expect(m.result.facets).toHaveLength(2);
    expect(m.result.facets.every(showsFront)).toBe(true);
    expect(m.result.creases).toHaveLength(1);
  });
});

describe.each(MODELS.map((m) => [m.name, m] as const))('%s', (_, model) => {
  it('se plie jusqu’au bout, chaque étape fait bouger quelque chose', () => {
    const folder = new Folder(model.sheet, model.steps);
    while (!folder.done) {
      const motion = folder.next()!;
      expect(motion.turns.some(Boolean), motion.step.id).toBe(true);
      expect(
        Math.hypot(motion.drop.x - motion.grab.x, motion.drop.y - motion.grab.y),
        motion.step.id,
      ).toBeGreaterThan(0.05);
      folder.commit(motion);
    }
    const state = folder.state;
    // La surface totale de papier ne change pas : 4 (un carré de côté 2).
    const total = state.facets.reduce((s, f) => s + Math.abs(area(f.poly)), 0);
    expect(total).toBeCloseTo(4, 6);
  });

  it('s’annule étape par étape jusqu’à la feuille de départ', () => {
    const folder = new Folder(model.sheet, model.steps);
    while (!folder.done) folder.commit(folder.next()!);
    while (folder.undo());
    expect(folder.state.facets).toHaveLength(1);
    expect(folder.index).toBe(0);
  });
});

describe('les formes finales', () => {
  it('le chien : les oreilles pendent de chaque côté de la tête', () => {
    const b = bounds(foldAll('chien'));
    expect(b.minX).toBeLessThan(-0.6);
    expect(b.maxX).toBeGreaterThan(0.6);
    expect(b.maxY).toBeCloseTo(0, 6);
    // Le menton : à mi-chemin entre la pointe (−√2) et le museau (−0,62).
    expect(b.minY).toBeCloseTo(-(Math.SQRT2 + 0.62) / 2, 9);
  });

  it('le gobelet : bord du haut horizontal à 2√2 − 2', () => {
    const b = bounds(foldAll('gobelet'));
    expect(b.maxY).toBeCloseTo(2 * Math.SQRT2 - 2, 6);
    expect(b.minY).toBeCloseTo(0, 6);
  });

  it('le gobelet : le rabat du devant disparaît dans la poche, sous les rabats des côtés', () => {
    const state = foldAll('gobelet');
    for (const y of [0.35, 0.5, 0.7]) {
      const hit = topAt(state, v(0, y))!;
      expect(hit.facet.tags.has('front')).toBe(false);
      expect(hit.facet.tags.has('left') || hit.facet.tags.has('right')).toBe(true);
    }
  });

  it('le cœur : symétrique, pointe en bas', () => {
    const b = bounds(foldAll('coeur'));
    expect(b.minX).toBeCloseTo(-b.maxX, 6);
    expect(b.minY).toBeCloseTo(-0.25, 6);
    expect(b.maxY).toBeCloseTo(0.75, 6);
  });

  it('le kabuto : deux cornes qui dépassent du casque', () => {
    const state = foldAll('kabuto');
    // Le haut du casque est un triangle |x| ≤ −y : les pointes des cornes sont bien en dehors.
    for (const x of [-0.3, 0.3]) {
      expect(topAt(state, v(x, -0.13))).not.toBeNull();
      expect(Math.abs(x)).toBeGreaterThan(0.1);
    }
    expect(topAt(state, v(0, 0.05))).toBeNull();
  });

  it('l’avion : les ailes finissent à la verticale de part et d’autre du corps', () => {
    const state = foldAll('avion');
    const bent = state.facets.filter((f) => f.bends.length);
    expect(bent.some((f) => f.bends[0].angle > 0)).toBe(true);
    expect(bent.some((f) => f.bends[0].angle < 0)).toBe(true);
  });

  it('des facettes qui se recouvrent n’ont jamais la même hauteur', () => {
    for (const m of MODELS) {
      const state = foldAll(m.id);
      const d = depths(state.facets);
      const polys = state.facets.map(worldPoly);
      for (let i = 0; i < polys.length; i++)
        for (let j = i + 1; j < polys.length; j++)
          if (overlaps(polys[i], polys[j])) expect(d[i], `${m.id} ${i}/${j}`).not.toBe(d[j]);
    }
  });
});
