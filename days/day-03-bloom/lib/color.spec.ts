import { describe, expect, it } from 'vitest';
import { add, desaturate, light, luminance, mix, parseHex, rgba, toHex } from './color';

describe('couleurs', () => {
  it('lit et écrit l’hexadécimal', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(toHex([255, 128, 0])).toBe('#ff8000');
    expect(toHex([300, -4, 12.4])).toBe('#ff000c');
  });

  it('mélange en lumière linéaire : le milieu du noir et du blanc est plus clair que 128', () => {
    expect(mix([0, 0, 0], [255, 255, 255], 0)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [255, 255, 255], 1).map(Math.round)).toEqual([255, 255, 255]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)[0]).toBeGreaterThan(180);
  });

  it('éclaire, ajoute et désature', () => {
    expect(light([200, 100, 50], [1, 1, 1]).map(Math.round)).toEqual([200, 100, 50]);
    expect(light([200, 100, 50], [0, 0, 0])).toEqual([0, 0, 0]);
    expect(add([0, 0, 0], [255, 0, 0], 1)[0]).toBeCloseTo(255);
    const grey = desaturate([255, 0, 0], 1);
    expect(grey[0]).toBeCloseTo(grey[1], 5);
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
  });

  it('écrit rgba avec une opacité bornée', () => {
    expect(rgba([10, 20, 30], 2)).toBe('rgb(10 20 30 / 1)');
  });
});
