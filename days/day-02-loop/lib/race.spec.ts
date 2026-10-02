import { describe, expect, it } from 'vitest';
import { COUNTDOWN, DRAG, IMPULSE, LAPS, MAX_SPEED, Race, formatTime } from './race';

const LENGTH = 1000;

/** Fait avancer la course image par image en pressant la touche d'un joueur `presses` fois par seconde. */
function run(race: Race, seconds: number, presses: [number, number], dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    for (const p of [0, 1] as const) {
      if (presses[p] && i % Math.round(1 / (presses[p] * dt)) === 0) race.press(p);
    }
    race.update(dt);
  }
}

describe('Race', () => {
  it('ignore les pressions tant que le feu n’est pas vert', () => {
    const race = new Race(LENGTH);
    expect(race.press(0)).toBe(false);
    race.start();
    expect(race.phase).toBe('countdown');
    expect(race.press(0)).toBe(false);
    expect(race.players[0].speed).toBe(0);
  });

  it('allume les feux un par un pendant le décompte', () => {
    const race = new Race(LENGTH);
    race.start();
    expect(race.lights).toBe(1);
    race.update(1);
    expect(race.lights).toBe(2);
    race.update(1);
    expect(race.lights).toBe(3);
    race.update(1.25);
    expect(race.phase).toBe('racing');
    expect(race.lights).toBe(0);
    expect(race.elapsed).toBeCloseTo(0.25, 6); // le temps dépassant le décompte compte déjà
  });

  it('accélère à chaque pression, jusqu’au plafond', () => {
    const race = new Race(LENGTH);
    race.start();
    race.update(COUNTDOWN);
    race.press(0);
    expect(race.players[0].speed).toBe(IMPULSE);
    expect(race.players[1].speed).toBe(0);
    for (let i = 0; i < 100; i++) race.press(0);
    expect(race.players[0].speed).toBe(MAX_SPEED);
  });

  it('ralentit toute seule sans pression et s’arrête', () => {
    const race = new Race(LENGTH);
    race.start();
    race.update(COUNTDOWN);
    race.press(1);
    race.update(0.5);
    expect(race.players[1].speed).toBeCloseTo(IMPULSE * Math.exp(-DRAG * 0.5), 6);
    expect(race.players[1].distance).toBeGreaterThan(0);
    race.update(5);
    expect(race.players[1].speed).toBe(0);
  });

  it('compte les tours et chronomètre chacun', () => {
    const race = new Race(LENGTH);
    race.start();
    race.update(COUNTDOWN);
    run(race, 6, [10, 0]);
    const p = race.players[0];
    expect(p.laps).toBe(1);
    expect(p.lapTimes).toHaveLength(1);
    expect(p.lapTimes[0]).toBeGreaterThan(0);
    expect(p.lapStart).toBeCloseTo(p.lapTimes[0], 6);
    expect(race.currentLap(0)).toBeCloseTo(race.elapsed - p.lapStart, 6);
    expect(race.bestLap(0)).toBe(p.lapTimes[0]);
    expect(race.bestLap(1)).toBeNull();
  });

  it('termine la course au premier qui boucle ses tours, et désigne le vainqueur', () => {
    const race = new Race(LENGTH);
    race.start();
    race.update(COUNTDOWN);
    run(race, 30, [4, 12]);
    expect(race.phase).toBe('finished');
    expect(race.winner).toBe(1);
    const w = race.players[1];
    expect(w.laps).toBe(LAPS);
    expect(w.lapTimes).toHaveLength(LAPS);
    expect(w.finishedAt).toBeCloseTo(
      w.lapTimes.reduce((a, b) => a + b, 0),
      6,
    );
    expect(w.distance).toBeGreaterThanOrEqual(LAPS * LENGTH);
    expect(race.players[0].finishedAt).toBeNull();
    expect(race.players[0].laps).toBeLessThan(LAPS);
    // Fin de course : le chrono est figé, les pressions ne font plus rien.
    const elapsed = race.elapsed;
    expect(race.press(0)).toBe(false);
    race.update(1);
    expect(race.elapsed).toBe(elapsed);
  });

  it('repart de zéro avec start()', () => {
    const race = new Race(LENGTH);
    race.start();
    race.update(COUNTDOWN);
    run(race, 30, [12, 12]);
    race.start();
    expect(race.phase).toBe('countdown');
    expect(race.winner).toBeNull();
    expect(race.elapsed).toBe(0);
    expect(
      race.players.every((p) => p.distance === 0 && p.laps === 0 && p.lapTimes.length === 0),
    ).toBe(true);
  });
});

describe('formatTime', () => {
  it('affiche minutes, secondes et centièmes', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(5.678)).toBe('0:05.67');
    expect(formatTime(83.2)).toBe('1:23.20');
    expect(formatTime(-1)).toBe('0:00.00');
  });
});
