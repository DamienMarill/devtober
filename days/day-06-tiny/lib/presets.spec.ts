import { describe, expect, it } from 'vitest';
import { PRESETS, findPreset, presetById, presetRule } from './presets';
import { CONWAY, formatRule, parseRule } from './rule';
import { isStartId } from './seed';

describe('PRESETS', () => {
  it('écrit chaque règle sous sa forme canonique', () => {
    for (const p of PRESETS) expect(formatRule(presetRule(p)), p.id).toBe(p.rule);
  });

  it('a des identifiants, des règles et des semis uniques et valides', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.rule)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(isStartId(p.start), p.id).toBe(true);
      expect(p.density).toBeGreaterThan(0);
      expect(p.density).toBeLessThanOrEqual(1);
    }
  });

  it('retrouve une souche par sa règle, quelle que soit la notation', () => {
    expect(findPreset(CONWAY)?.id).toBe('conway');
    expect(findPreset(parseRule('/2/3')!)?.id).toBe('brain');
    expect(findPreset(parseRule('B3/S2')!)).toBeUndefined();
    expect(presetById('starwars')?.name).toBe('Star Wars');
  });
});
