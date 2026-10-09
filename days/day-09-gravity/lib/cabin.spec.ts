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

  it('dans l’avion qui tourne, un objet libre file en ligne droite et garde son orientation', () => {
    // Apesanteur parfaite, avion qui pique à −5°/s (le sommet de la parabole) : vu de l'extérieur, un objet
    // qui ne touche rien doit avancer en ligne droite, sans tourner sur lui-même.
    const cabin = new Cabin();
    const ball = cabin.bodies.find((b) => b.kind === 'ball')!;
    cabin.bodies.splice(0, cabin.bodies.length, ball);
    const q = -5 * (Math.PI / 180);
    const pivot = { x: cabin.width / 2, y: 0 };
    ball.x = pivot.x + 1.5;
    ball.y = 1.2;
    // Au départ, il tourne avec la cabine : sa vitesse dans l'espace est q × r.
    ball.vx = 0;
    ball.vy = 0;
    ball.w = 0;
    const r0 = { x: ball.x - pivot.x, y: ball.y - pivot.y };
    const v0 = { x: -q * r0.y, y: q * r0.x };
    cabin.setLoad(0, 0);
    cabin.setRotation(q, 0);
    const T = 2;
    run(cabin, T);
    // On repasse la position finale dans le repère de l'espace (la cabine a tourné de q·T).
    const a = q * T;
    const rx = ball.x - pivot.x;
    const ry = ball.y - pivot.y;
    const ix = rx * Math.cos(a) - ry * Math.sin(a);
    const iy = rx * Math.sin(a) + ry * Math.cos(a);
    expect(ix).toBeCloseTo(r0.x + v0.x * T, 2);
    expect(iy).toBeCloseTo(r0.y + v0.y * T, 2);
  });

  it('quand l’avion change de vitesse de tangage, un objet libre semble tourner dans l’autre sens', () => {
    const cabin = new Cabin();
    const apple = cabin.bodies.find((b) => b.kind === 'apple')!;
    cabin.bodies.splice(0, cabin.bodies.length, apple);
    apple.y = 1.2;
    apple.w = 0;
    cabin.setLoad(0, 0);
    // L'avion passe de 0 à −0,1 rad/s en une seconde : vu de la cabine, la pomme prend +0,1 rad/s (un peu
    // moins : l'air de la cabine, qui tourne avec elle, freine sa rotation).
    cabin.setRotation(-0.05, -0.1);
    run(cabin, 1);
    expect(apple.w).toBeGreaterThan(0.08);
    expect(apple.w).toBeLessThan(0.1);
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
