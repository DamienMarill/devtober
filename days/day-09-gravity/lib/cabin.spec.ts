import { Cabin } from './cabin';
import { CONFIG } from './config';
import { Rng } from './rng';

const run = (cabin: Cabin, seconds: number) => {
  for (let t = 0; t < seconds; t += CONFIG.dt) cabin.step(CONFIG.dt);
};

describe('la cabine', () => {
  it('à 1 g, tout repose au plancher et ne bouge plus', () => {
    const cabin = new Cabin();
    cabin.setLoad(0, 1);
    run(cabin, 3);
    for (const b of cabin.bodies) {
      expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.15);
      expect(b.y).toBeLessThan(0.6);
    }
  });

  it('à 0 g, ce qui a reçu une poussée flotte et garde sa vitesse', () => {
    const cabin = new Cabin();
    cabin.setLoad(0, 1);
    run(cabin, 1);
    cabin.setLoad(0, 0);
    cabin.pushOff(new Rng(1));
    const people = cabin.bodies.filter((b) => b.kind === 'person');
    run(cabin, 2);
    for (const p of people) {
      expect(p.y).toBeGreaterThan(0.35);
      expect(p.vy).toBeGreaterThan(0.05);
    }
  });

  it('à 1,8 g, les objets lâchés tombent plus vite qu’à 1 g', () => {
    const fall = (n: number) => {
      const cabin = new Cabin();
      const ball = cabin.bodies.find((b) => b.kind === 'ball')!;
      ball.y = 1.8;
      cabin.setLoad(0, n);
      let t = 0;
      while (ball.y > ball.r + 0.01 && t < 3) {
        cabin.step(CONFIG.dt);
        t += CONFIG.dt;
      }
      return t;
    };
    // √1,8 ≈ 1,34 : le temps de chute est divisé d'autant.
    expect(fall(1) / fall(1.8)).toBeCloseTo(Math.sqrt(1.8), 1);
  });

  it('garde tout dans la cabine, même secouée dans tous les sens', () => {
    const cabin = new Cabin();
    const rng = new Rng(4);
    for (let i = 0; i < 40; i++) {
      cabin.setLoad(rng.range(-0.5, 0.5), rng.range(-1, 2.5));
      run(cabin, 0.5);
      const out = cabin.bodies.filter(
        (b) => b.x < -0.01 || b.x > cabin.width + 0.01 || b.y < -0.01 || b.y > cabin.height + 0.01,
      );
      expect(out.map((b) => `${b.kind} ${b.x.toFixed(2)},${b.y.toFixed(2)}`)).toEqual([]);
    }
  });

  it('se laisse attraper et lancer', () => {
    const cabin = new Cabin();
    cabin.setLoad(0, 0);
    const apple = cabin.bodies.find((b) => b.kind === 'apple')!;
    expect(cabin.pick(apple.x, apple.y, 0.02)).toBe(apple);
    cabin.startGrab(apple, apple.x, apple.y);
    cabin.moveGrab(apple.x, 1.5);
    run(cabin, 1);
    expect(apple.y).toBeGreaterThan(1.3);
    cabin.endGrab();
    expect(cabin.grab).toBeNull();
  });
});
