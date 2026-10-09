import { Autopilot, needsRescue } from './autopilot';
import { CONFIG, DEG } from './config';
import { Flight } from './flight';
import { PhaseWatch } from './phases';

describe('le pilote automatique', () => {
  it('vole une parabole proche du profil du CNES', () => {
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
    // Une vingtaine de secondes d'apesanteur, un sommet vers 8 km, sans dépasser 2 g.
    expect(watch.last).toBeGreaterThan(19);
    expect(watch.last).toBeLessThan(26);
    expect(apex).toBeGreaterThan(7800);
    expect(apex).toBeLessThan(8700);
    expect(apexSpeed * 3.6).toBeGreaterThan(380);
    expect(apexSpeed * 3.6).toBeLessThan(560);
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
