import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  DensityField,
  audioTime,
  episodeClearing,
  episodeDuration,
  episodeOffset,
  expectedShift,
  shapeFor,
} from './density';

const E = CONFIG.episode;

describe('épisodes', () => {
  for (const outcome of ['stable', 'unstable'] as const) {
    it(`courbe continue de bout en bout (${outcome})`, () => {
      const s = shapeFor(outcome, 0, 3);
      const end = episodeDuration(s);
      let prev = episodeOffset(s, 0);
      for (let t = 0.001; t <= end + 0.5; t += 0.001) {
        const v = episodeOffset(s, t);
        expect(Math.abs(v - prev)).toBeLessThan(0.01);
        prev = v;
      }
      expect(episodeOffset(s, end)).toBeCloseTo(s.final, 6);
      expect(episodeClearing(s, end)).toBeCloseTo(0, 6);
    });
  }

  it('stable et unstable identiques jusqu’à la fin du palier', () => {
    const a = shapeFor('stable', 0, 2.7);
    const b = shapeFor('unstable', 0, 2.7);
    for (let t = 0; t <= E.descend + 2.7; t += 0.05) {
      expect(episodeOffset(a, t)).toBeCloseTo(episodeOffset(b, t), 9);
      expect(episodeClearing(a, t)).toBeCloseTo(episodeClearing(b, t), 9);
    }
  });

  it('unstable finit au-dessus du départ, stable en dessous', () => {
    expect(shapeFor('unstable', 0, 3).final).toBeGreaterThan(0);
    expect(shapeFor('stable', 0, 3).final).toBeLessThan(0);
  });

  it('chaque épisode creuse moins et remonte plus', () => {
    const first = shapeFor('unstable', 0, 3);
    const later = shapeFor('unstable', 4, 3);
    expect(later.depth).toBeLessThan(first.depth);
    expect(later.final).toBeGreaterThan(first.final);
    expect(Math.abs(shapeFor('stable', 4, 3).final)).toBeLessThan(
      Math.abs(shapeFor('stable', 0, 3).final),
    );
  });

  it('la variation moyenne par glow atteint reste positive', () => {
    for (let n = 0; n < 12; n++) expect(expectedShift(n)).toBeGreaterThan(0);
  });

  it('l’audio est en avance à partir du palier, sans saut', () => {
    expect(audioTime(E.descend / 2)).toBe(E.descend / 2);
    expect(audioTime(E.descend + 1)).toBe(E.descend + 1 + E.audioLead);
    expect(E.hold[0]).toBeGreaterThan(E.audioLead);
  });
});

describe('DensityField', () => {
  it('monte avec le temps seulement horloge lancée', () => {
    const f = new DensityField();
    for (let i = 0; i < 600; i++) f.update(1 / 60, false);
    expect(f.value).toBe(0);
    for (let i = 0; i < 600; i++) f.update(1 / 60, true);
    expect(f.value).toBeCloseTo(CONFIG.density.rate * 10, 4);
  });

  it('applique les ajouts en douceur', () => {
    const f = new DensityField();
    f.add(0.1);
    f.update(1 / 60, false);
    expect(f.value).toBeGreaterThan(0);
    expect(f.value).toBeLessThan(0.01);
    for (let i = 0; i < 600; i++) f.update(1 / 60, false);
    expect(f.value).toBeCloseTo(0.1, 3);
  });

  it('intègre le décalage final et accélère après un unstable', () => {
    const f = new DensityField();
    f.force(0.4);
    f.begin('unstable', 2);
    const s = f.episode!;
    for (let t = 0; t < episodeDuration(s) + 0.1; t += 1 / 60) f.update(1 / 60, true);
    expect(f.episode).toBeNull();
    expect(f.level).toBeCloseTo(0.4 + s.final, 3);
    expect(f.rateFactor).toBeCloseTo(CONFIG.density.rateGain, 6);
  });

  it('reste dans [0, 1]', () => {
    const f = new DensityField();
    f.force(0.02);
    f.begin('stable', 2);
    for (let i = 0; i < 60 * 12; i++) {
      f.update(1 / 60, true);
      expect(f.value).toBeGreaterThanOrEqual(0);
    }
    f.force(1);
    f.add(0.5);
    for (let i = 0; i < 600; i++) f.update(1 / 60, true);
    expect(f.value).toBe(1);
  });
});
