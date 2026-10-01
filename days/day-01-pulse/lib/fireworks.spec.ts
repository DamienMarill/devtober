import { FireworksSystem, type BurstSpec } from './fireworks';
import { BAND_LOOKS, burstSpec } from './fireworks-stage';

const SPEC: BurstSpec = { x: 100, y: 100, color: '#ff0000', radius: 80, count: 50, life: 1, size: 2 };

describe('FireworksSystem', () => {
  it('lance autant de particules que demandé, depuis le point d’explosion', () => {
    const system = new FireworksSystem();
    system.burst(SPEC);
    expect(system.particles).toHaveLength(50);
    expect(system.particles.every((p) => p.x === 100 && p.y === 100 && p.color === '#ff0000')).toBe(true);
    expect(system.active).toBe(true);
  });

  it('étale les particules, les éteint et finit par se vider', () => {
    const system = new FireworksSystem();
    system.burst(SPEC);
    system.update(0.3);
    const spread = Math.max(...system.particles.map((p) => Math.hypot(p.x - 100, p.y - 100)));
    expect(spread).toBeGreaterThan(20);
    for (let i = 0; i < 60; i++) system.update(0.05); // 3 s : tout est éteint
    expect(system.active).toBe(false);
  });

  it('plafonne le nombre de particules', () => {
    const system = new FireworksSystem();
    for (let i = 0; i < 100; i++) system.burst({ ...SPEC, count: 100 });
    expect(system.particles.length).toBeLessThanOrEqual(2500);
  });
});

describe('burstSpec', () => {
  const COLORS = ['#111111', '#222222', '#333333'];
  const W = 1000;
  const H = 600;
  const spec = (pan: number, random = () => 0.5) => burstSpec({ band: 1, pan, strength: 1 }, W, H, COLORS, random);

  it('place la gerbe selon la position stéréo', () => {
    expect(spec(-1).x).toBeLessThan(150);
    expect(spec(0).x).toBeCloseTo(500, -1);
    expect(spec(1).x).toBeGreaterThan(850);
  });

  it('choisit Y dans la zone prévue, au hasard', () => {
    const ys = [0, 0.25, 0.5, 0.75, 0.999].map((r) => spec(0, () => r).y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.12 * H);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.7 * H);
    expect(new Set(ys).size).toBe(5);
  });

  it('tire la couleur parmi celles du thème', () => {
    expect(spec(0, () => 0).color).toBe('#111111');
    expect(spec(0, () => 0.99).color).toBe('#333333');
  });

  it('fait de plus grosses gerbes pour les graves que pour les aigus', () => {
    const grave = burstSpec({ band: 0, pan: 0, strength: 1 }, W, H, COLORS);
    const aigu = burstSpec({ band: 3, pan: 0, strength: 1 }, W, H, COLORS);
    expect(grave.radius).toBeGreaterThan(aigu.radius);
    expect(grave.radius).toBeCloseTo(BAND_LOOKS[0].radius * H);
  });

  it('retombe sur du blanc si le thème n’a pas encore de couleurs', () => {
    expect(burstSpec({ band: 0, pan: 0, strength: 1 }, W, H, []).color).toBe('#ffffff');
  });
});
