import { Autopilot, needsRescue } from './autopilot';
import { CONFIG, DEG, G0 } from './config';
import { Flight, gravity } from './flight';
import { PhaseWatch } from './phases';

describe('le pilote automatique', () => {
  it('vole une parabole proche du profil du guide de l’ESA', () => {
    const f = new Flight();
    const ap = new Autopilot();
    const watch = new PhaseWatch();
    ap.startParabola(f);
    const callouts: [string, number][] = [];
    let apex = 0;
    let apexSpeed = 0;
    let hi = -Infinity;
    for (let t = 0; t < 80; t += CONFIG.dt) {
      ap.update(f, CONFIG.dt);
      f.step(CONFIG.dt);
      watch.update(f, CONFIG.dt);
      for (const c of watch.callouts) callouts.push([c, f.t]);
      watch.callouts.length = 0;
      if (f.h > apex) {
        apex = f.h;
        apexSpeed = f.V;
      }
      hi = Math.max(hi, f.nz);
    }
    expect(callouts.slice(0, 4).map(([c]) => c)).toEqual([
      'pull-up',
      'injection',
      'pull-out',
      'parabola',
    ]);
    // ESA : une vingtaine de secondes d'apesanteur, un sommet vers 8 500 m à 390 km/h, 1,8 g sans plus.
    expect(watch.last).toBeGreaterThan(19);
    expect(watch.last).toBeLessThan(26);
    expect(apex).toBeGreaterThan(8200);
    expect(apex).toBeLessThan(8700);
    expect(apexSpeed * 3.6).toBeGreaterThan(330);
    expect(apexSpeed * 3.6).toBeLessThan(450);
    expect(hi).toBeLessThan(2.05);
    // La ressource dure à peu près vingt secondes.
    const pullUp = callouts.find(([c]) => c === 'pull-up')![1];
    const injection = callouts.find(([c]) => c === 'injection')![1];
    expect(injection - pullUp).toBeGreaterThan(15);
    expect(injection - pullUp).toBeLessThan(23);
  });

  it('enchaîne les paraboles et revient au palier entre deux', () => {
    const f = new Flight();
    const ap = new Autopilot();
    const watch = new PhaseWatch();
    for (let t = 0; t < 200; t += CONFIG.dt) {
      ap.update(f, CONFIG.dt);
      f.step(CONFIG.dt);
      watch.update(f, CONFIG.dt);
    }
    expect(watch.parabolas).toBeGreaterThanOrEqual(2);
  });
});

describe('l’apesanteur, c’est la chute libre', () => {
  it('commence en montée, finit en descente, et l’avion y accélère de g vers le bas', () => {
    const f = new Flight();
    const ap = new Autopilot();
    ap.startParabola(f);
    let start: { h: number; vs: number; gamma: number } | null = null;
    let end: { vs: number } | null = null;
    let worst = 0;
    let vx = f.V * Math.cos(f.gamma);
    let vy = f.vs;
    for (let t = 0; t < 70; t += CONFIG.dt) {
      ap.update(f, CONFIG.dt);
      f.step(CONFIG.dt);
      const nvx = f.V * Math.cos(f.gamma);
      const nvy = f.vs;
      // On mesure dès que l'avion est vraiment en apesanteur (la fin de la transition d'injection).
      if (ap.phase === 'zerog' && (start || Math.abs(f.nz) < CONFIG.phases.zero)) {
        start ??= { h: f.h, vs: f.vs, gamma: f.gamma };
        end = { vs: f.vs };
        // Accélération de l'avion dans le repère terrestre, comparée à la gravité seule.
        const ax = (nvx - vx) / CONFIG.dt;
        const ay = (nvy - vy) / CONFIG.dt;
        worst = Math.max(worst, Math.hypot(ax, ay + gravity(f.h)) / G0);
      }
      vx = nvx;
      vy = nvy;
    }
    // ESA : la chute libre commence vers 7 500 m, à environ 47° en montée.
    expect(start!.vs).toBeGreaterThan(100);
    expect(start!.gamma).toBeGreaterThan(40 * DEG);
    expect(start!.h).toBeGreaterThan(7300);
    expect(start!.h).toBeLessThan(7900);
    expect(end!.vs).toBeLessThan(-60);
    // Pendant toute la phase, l'avion n'accélère que de g vers le bas (à quelques centièmes de g près).
    expect(worst).toBeLessThan(0.08);
  });
});

describe('le pilote de sécurité', () => {
  it.each([
    ['manche tiré à fond', 1],
    ['manche poussé à fond', -1],
  ])('rattrape l’avion (%s) sans looping ni plongée dans les nuages', (_, stick) => {
    const f = new Flight();
    let rescue: Autopilot | null = null;
    let lowest = Infinity;
    let maxPitch = -Infinity;
    for (let t = 0; t < 120 && !rescue?.done; t += CONFIG.dt) {
      if (!rescue) {
        f.stick = stick;
        if (needsRescue(f)) {
          rescue = new Autopilot('recover');
          rescue.loop = false;
        }
      } else rescue.update(f, CONFIG.dt);
      f.step(CONFIG.dt);
      lowest = Math.min(lowest, f.h);
      maxPitch = Math.max(maxPitch, f.theta);
    }
    expect(rescue?.done).toBe(true);
    expect(maxPitch).toBeLessThan(62 * DEG);
    expect(lowest).toBeGreaterThan(4300);
  });
});
