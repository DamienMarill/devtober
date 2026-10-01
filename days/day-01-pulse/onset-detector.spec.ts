import { OnsetDetector, bandEnergy, percussionStrength } from './onset-detector';

const DT = 1000 / 60;

/** Fait avancer le détecteur sur `ms` millisecondes d'énergie constante. */
function hold(d: OnsetDetector, energy: number, ms: number): number {
  let flash = 0;
  for (let t = 0; t < ms; t += DT) flash = d.next(energy, DT);
  return flash;
}

describe('OnsetDetector (grosse caisse)', () => {
  it('reste éteint sur un grave faible et constant', () => {
    expect(hold(new OnsetDetector(), 0.3, 2000)).toBe(0);
  });

  it('reste éteint sur une basse tenue, même très forte', () => {
    const d = new OnsetDetector();
    d.next(0.95, DT); // amorçage : pas de « coup » au premier échantillon
    expect(hold(d, 0.95, 3000)).toBeLessThan(0.01);
  });

  it('flashe fort sur un coup brusque, puis s’éteint vite', () => {
    const d = new OnsetDetector();
    hold(d, 0.3, 1000);
    expect(d.next(0.9, DT)).toBeGreaterThan(0.8);
    expect(hold(d, 0.3, 300)).toBeLessThan(0.1);
  });

  it('ignore un pic trop faible pour être une grosse caisse', () => {
    const d = new OnsetDetector();
    hold(d, 0.2, 1000);
    expect(d.next(0.6, DT)).toBe(0);
  });

  it('ne se redéclenche pas pendant la période réfractaire, mais bien après', () => {
    const d = new OnsetDetector();
    hold(d, 0.2, 1000);
    let prev = d.next(0.9, DT);
    // Creux de 50 ms puis nouveau pic à ~100 ms du premier : trop tôt (< 200 ms).
    for (let t = 0; t < 100; t += DT) {
      const flash = d.next(t < 50 ? 0.2 : 0.9, DT);
      expect(flash).toBeLessThanOrEqual(prev + 1e-9); // le flash ne fait que décroître
      prev = flash;
    }
    hold(d, 0.2, 300);
    expect(d.next(0.9, DT)).toBeGreaterThan(0.8); // le suivant, plus tard, passe
  });

  it('repart de zéro après reset', () => {
    const d = new OnsetDetector();
    hold(d, 0.2, 500);
    d.next(0.9, DT);
    d.reset();
    expect(d.next(0.9, DT)).toBe(0); // 1er échantillon après reset : amorçage
  });
});

describe('bandEnergy', () => {
  // 44,1 kHz / 1024 → ~43 Hz par bin : 30–110 Hz couvre les bins 1 et 2.
  const RATE = 44_100;
  const FFT = 1024;

  it('ne regarde que les bins de la bande', () => {
    const bins = new Uint8Array(512);
    bins[1] = 255;
    bins[40] = 255; // hors bande
    expect(bandEnergy(bins, RATE, FFT, 30, 110)).toBeCloseTo(0.5);
  });

  it('renvoie 0 si la bande ne contient aucun bin', () => {
    expect(bandEnergy(new Uint8Array(512).fill(255), RATE, FFT, 50, 60)).toBe(0);
  });
});

describe('percussionStrength', () => {
  // 44,1 kHz / 1024 → ~43 Hz par bin : 150–2000 Hz ≈ bins 4–46, 2–10 kHz ≈ bins 47–232.
  const RATE = 44_100;
  const FFT = 1024;
  const quiet = () => new Uint8Array(512).fill(100);
  const strength = (cur: Uint8Array) => percussionStrength(quiet(), cur, RATE, FFT);
  const raise = (cur: Uint8Array, from: number, to: number, by = 40) => {
    for (let i = from; i <= to; i++) cur[i] += by;
    return cur;
  };

  it('est maximale quand tout le spectre monte d’un coup (caisse claire, clap)', () => {
    expect(strength(raise(quiet(), 1, 300))).toBe(1);
  });

  it('reste nulle sans changement', () => {
    expect(strength(quiet())).toBe(0);
  });

  it('ignore une note : seuls quelques harmoniques montent', () => {
    const note = quiet();
    for (const bin of [6, 12, 18, 24, 30]) note[bin] += 80;
    expect(strength(note)).toBe(0);
  });

  it('ignore un son qui ne monte que dans l’aigu (charley)', () => {
    expect(strength(raise(quiet(), 47, 232))).toBe(0);
  });

  it('ignore un son qui ne monte que dans le bas-médium', () => {
    expect(strength(raise(quiet(), 4, 46))).toBe(0);
  });

  it('ignore la grosse caisse, hors bande', () => {
    expect(strength(raise(quiet(), 1, 3))).toBe(0);
  });
});
