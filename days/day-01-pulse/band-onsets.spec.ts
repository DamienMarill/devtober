import { BANDS, BandOnsets } from './band-onsets';

const RATE = 44_100;
const FFT = 1024;
const BINS = 512;
const DT = 1000 / 60;

/** Spectre plat à `level`, avec la bande « médium » relevée de `lift`. */
function spectrum(level: number, lift = 0): Uint8Array {
  const bins = new Uint8Array(BINS).fill(level);
  const hz = RATE / FFT;
  const { loHz, hiHz } = BANDS[2];
  for (let i = Math.ceil(loHz / hz); i <= Math.floor(hiHz / hz); i++) bins[i] = level + lift;
  return bins;
}

/** Quelques images calmes, puis une attaque dans la bande médium : renvoie les attaques détectées. */
function attack(left: number, right: number) {
  const onsets = new BandOnsets(BINS);
  for (let i = 0; i < 20; i++) onsets.next(spectrum(80), spectrum(80), RATE, FFT, DT);
  return onsets.next(spectrum(80, left), spectrum(80, right), RATE, FFT, DT);
}

describe('BandOnsets', () => {
  it('ne signale rien tant que le spectre est stable', () => {
    const onsets = new BandOnsets(BINS);
    for (let i = 0; i < 60; i++) expect(onsets.next(spectrum(80), spectrum(80), RATE, FFT, DT)).toEqual([]);
  });

  it('signale une attaque dans la bande où le spectre monte', () => {
    const bursts = attack(120, 120);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].band).toBe(2);
    expect(bursts[0].strength).toBeGreaterThan(0.5);
  });

  it('place l’attaque à droite quand le canal droit est plus fort', () => {
    expect(attack(60, 120)[0].pan).toBeGreaterThan(0.5);
  });

  it('place l’attaque à gauche quand le canal gauche est plus fort', () => {
    expect(attack(120, 60)[0].pan).toBeLessThan(-0.5);
  });

  it('place l’attaque au centre quand les deux canaux sont égaux', () => {
    expect(attack(120, 120)[0].pan).toBe(0);
  });
});
