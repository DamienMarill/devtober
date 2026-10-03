import { describe, expect, it } from 'vitest';
import { BLEED, COMPOSITION, SAFE, frame, toScreen, viewBox } from './camera';

/** Tailles testées : bureau, page de capture, téléphone portrait et paysage, ultra-large. */
const SCREENS: [number, number][] = [
  [1440, 844],
  [720, 592],
  [390, 788],
  [844, 334],
  [2560, 1024],
  [1024, 1366],
];

describe('frame', () => {
  it('montre toute la composition sur un écran 16:10', () => {
    const cam = frame(1600, 1000);
    expect(cam).toMatchObject(COMPOSITION);
    expect(cam.scale).toBe(1);
  });

  it.each(SCREENS)('garde la zone sûre visible en %i × %i', (width, height) => {
    const cam = frame(width, height);
    expect(cam.x).toBeLessThanOrEqual(SAFE.x + 1e-6);
    expect(cam.y).toBeLessThanOrEqual(SAFE.y + 1e-6);
    expect(cam.x + cam.w).toBeGreaterThanOrEqual(SAFE.x + SAFE.w - 1e-6);
    expect(cam.y + cam.h).toBeGreaterThanOrEqual(SAFE.y + SAFE.h - 1e-6);
  });

  it.each(SCREENS)(
    'a le même rapport que l’écran et reste dans le débord en %i × %i',
    (width, height) => {
      const cam = frame(width, height);
      expect(cam.w / cam.h).toBeCloseTo(width / height, 6);
      if (cam.w <= BLEED.w) {
        expect(cam.x).toBeGreaterThanOrEqual(BLEED.x - 1e-6);
        expect(cam.x + cam.w).toBeLessThanOrEqual(BLEED.x + BLEED.w + 1e-6);
      }
      if (cam.h <= BLEED.h) {
        expect(cam.y).toBeGreaterThanOrEqual(BLEED.y - 1e-6);
        expect(cam.y + cam.h).toBeLessThanOrEqual(BLEED.y + BLEED.h + 1e-6);
      }
    },
  );

  it('garde le pont centré sur un téléphone en portrait', () => {
    const cam = frame(390, 788);
    const left = SAFE.x - cam.x;
    const right = cam.x + cam.w - (SAFE.x + SAFE.w);
    expect(Math.abs(left - right)).toBeLessThan(1);
    expect(cam.y).toBeGreaterThanOrEqual(BLEED.y - 10);
  });
});

describe('toScreen / viewBox', () => {
  it('fait correspondre le coin du cadre au coin de l’écran', () => {
    const cam = frame(720, 592);
    expect(toScreen(cam, cam.x, cam.y)).toEqual({ x: 0, y: 0 });
    const corner = toScreen(cam, cam.x + cam.w, cam.y + cam.h);
    expect(corner.x).toBeCloseTo(720, 6);
    expect(corner.y).toBeCloseTo(592, 6);
    expect(viewBox(cam).split(' ')).toHaveLength(4);
  });
});
