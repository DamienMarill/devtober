import { describe, expect, it } from 'vitest';
import { clock, titleFor } from './score';

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
