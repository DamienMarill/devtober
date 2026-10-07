import { describe, expect, it } from 'vitest';
import { clock, noteFor, titleFor } from './score';

describe('noteFor', () => {
  it('va de 0 à 20 au demi-point', () => {
    expect(noteFor(0.5)).toBe(0);
    expect(noteFor(1)).toBe(20);
    expect(noteFor(0.9) * 2).toBe(Math.round(noteFor(0.9) * 2));
    expect(noteFor(0.9)).toBeGreaterThan(noteFor(0.85));
  });
});

describe('titleFor', () => {
  it('change de ton selon la note', () => {
    expect(titleFor(19)).not.toBe(titleFor(3));
  });
});

describe('clock', () => {
  it('écrit l’heure sur deux chiffres et repart de 00 après minuit', () => {
    expect(clock(8 * 60 + 5)).toBe('08:05');
    expect(clock(24 * 60 + 12.7)).toBe('00:12');
  });
});
