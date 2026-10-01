import { Hct, argbFromHex } from '@material/material-color-utilities';
import { THEME_ROLES, themeFromPixels } from './cover-theme';

function solid(r: number, g: number, b: number, count = 400): Uint8ClampedArray {
  const px = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) px.set([r, g, b, 255], i * 4);
  return px;
}

const HEX = /^#[0-9a-f]{6}$/i;

describe('themeFromPixels', () => {
  it('produit tous les rôles en hexadécimal', () => {
    const t = themeFromPixels(solid(220, 40, 40));
    for (const role of THEME_ROLES) expect(t.roles[role]).toMatch(HEX);
    expect(t.source).toMatch(HEX);
    expect(t.candidates.length).toBeGreaterThan(0);
  });

  it('prend la teinte dominante de la pochette comme source', () => {
    const t = themeFromPixels(solid(220, 40, 40));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.source.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('retombe sur la couleur par défaut pour une image grise', () => {
    const t = themeFromPixels(solid(128, 128, 128));
    expect(t.source).toBe('#4285f4');
  });

  it('ignore les pixels transparents', () => {
    const px = solid(40, 80, 220);
    for (let i = 0; i < px.length; i += 8) px[i + 3] = 0;
    expect(() => themeFromPixels(px)).not.toThrow();
  });

  it('donne un fond très sombre qui garde la teinte de la source', () => {
    const t = themeFromPixels(solid(220, 40, 40));
    const backdrop = Hct.fromInt(argbFromHex(t.backdrop));
    const source = Hct.fromInt(argbFromHex(t.source));
    expect(backdrop.tone).toBeLessThan(6);
    expect(backdrop.tone).toBeGreaterThan(1);
    expect(backdrop.chroma).toBeGreaterThan(3);
    const gap = Math.abs(backdrop.hue - source.hue);
    expect(Math.min(gap, 360 - gap)).toBeLessThan(25);
  });
});
