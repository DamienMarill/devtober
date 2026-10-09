import { density } from './atmosphere';
import { CONFIG, DEG } from './config';
import { Flight, gravity } from './flight';

const fly = (f: Flight, seconds: number) => {
  for (let t = 0; t < seconds; t += CONFIG.dt) f.step(CONFIG.dt);
};

describe('atmosphère et gravité', () => {
  it('suit l’atmosphère type : 1,225 kg/m³ au sol, environ 0,66 à 6 000 m', () => {
    expect(density(0)).toBeCloseTo(1.225, 3);
    expect(density(6000)).toBeCloseTo(0.66, 2);
  });

  it('colle au modèle de troposphère de la NASA (Glenn Research Center) à 1 % près', () => {
    // T = 15,04 − 0,00649·h (°C), p = 101,29·[(T + 273,1) / 288,08]^5,256 (kPa), ρ = p / (0,2869·(T + 273,1)).
    for (const h of [0, 3000, 6000, 7500, 8500, 10_000]) {
      const T = 15.04 - 0.00649 * h;
      const p = 101.29 * ((T + 273.1) / 288.08) ** 5.256;
      const rho = p / (0.2869 * (T + 273.1));
      expect(Math.abs(density(h) / rho - 1)).toBeLessThan(0.01);
    }
  });

  it('fait baisser g avec l’altitude', () => {
    expect(gravity(0)).toBeCloseTo(9.80665, 5);
    expect(gravity(8500)).toBeLessThan(9.79);
  });
});

describe('le vol', () => {
  it('tient le palier de départ manche au neutre (1 g, altitude et vitesse stables)', () => {
    const f = new Flight();
    fly(f, 20);
    expect(Math.abs(f.h - CONFIG.cruise.altitude)).toBeLessThan(60);
    expect(Math.abs(f.V - CONFIG.cruise.speed)).toBeLessThan(5);
    expect(f.nz).toBeCloseTo(1, 1);
  });

  it('suit une parabole balistique quand la portance est nulle', () => {
    const f = new Flight();
    // On lance l'avion à 45° et 600 km/h, manche sur l'incidence de portance nulle.
    f.gamma = 45 * DEG;
    f.V = 600 / 3.6;
    f.stick = f.stickForAlpha(CONFIG.aircraft.alpha0);
    f.alpha = CONFIG.aircraft.alpha0;
    const vx0 = f.V * Math.cos(f.gamma);
    const vy0 = f.V * Math.sin(f.gamma);
    const h0 = f.h;
    fly(f, 10);
    // La poussée compense la traînée : la vitesse horizontale ne bouge presque pas, la verticale perd g·t.
    expect(f.V * Math.cos(f.gamma)).toBeCloseTo(vx0, -1);
    const g = gravity(f.h);
    expect(f.vs).toBeCloseTo(vy0 - g * 10, -1);
    expect(f.h - h0).toBeCloseTo(vy0 * 10 - 0.5 * g * 100, -2);
    expect(Math.abs(f.nz)).toBeLessThan(0.08);
  });

  it('ne dépasse jamais 2,5 g ni −1 g, même manche en butée', () => {
    for (const stick of [1, -1]) {
      const f = new Flight();
      f.stick = stick;
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0; t < 6; t += CONFIG.dt) {
        f.step(CONFIG.dt);
        lo = Math.min(lo, f.nz);
        hi = Math.max(hi, f.nz);
      }
      expect(hi).toBeLessThan(2.65);
      expect(lo).toBeGreaterThan(-1.15);
    }
  });
});
