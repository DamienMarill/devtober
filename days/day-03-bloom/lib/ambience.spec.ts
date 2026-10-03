import { describe, expect, it } from 'vitest';
import { levels } from './ambience';
import { toConditions } from './weather';

describe('levels', () => {
  it('fait souffler le vent avec la vitesse et tomber la pluie avec l’intensité', () => {
    const calm = levels(toConditions({ code: 0 }), 0.3, 0, 0);
    const windy = levels(toConditions({ code: 0 }), 10, 1, 8);
    expect(calm.wind).toBe(0);
    expect(windy.wind).toBeGreaterThan(0.3);
    expect(windy.windTone).toBeGreaterThan(calm.windTone);
    expect(windy.windPan).toBeLessThan(0);
    expect(calm.rain).toBe(0);
    const light = levels(toConditions({ code: 61 }), 2, 0, 0).rain;
    const heavy = levels(toConditions({ code: 65 }), 2, 0, 0).rain;
    expect(heavy).toBeGreaterThan(light);
    expect(levels(toConditions({ code: 73 }), 2, 0, 0).rain).toBeLessThan(light);
  });
});
