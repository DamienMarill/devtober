import { describe, expect, it } from 'vitest';
import { TOUR, TOUR_SECONDS, tourAt } from './tour';

describe('tourAt', () => {
  it('fait avancer l’heure sans jamais revenir en arrière', () => {
    let last = -1;
    for (let t = 0; t <= TOUR_SECONDS; t += 0.25) {
      const { minutes } = tourAt(t);
      expect(minutes).toBeGreaterThanOrEqual(last);
      last = minutes;
    }
    expect(tourAt(0).minutes).toBe(TOUR[0].time);
    expect(tourAt(TOUR_SECONDS).minutes).toBe(TOUR[TOUR.length - 1].time);
  });

  it('passe par la pluie et finit de nuit', () => {
    const weathers = new Set(TOUR.map((s) => s.weather));
    expect(weathers.has('rain')).toBe(true);
    expect(tourAt(12).step.weather).toBe('rain');
    expect(tourAt(TOUR_SECONDS + 1).done).toBe(true);
    expect(tourAt(TOUR_SECONDS - 1).minutes).toBeGreaterThan(19 * 60);
  });
});
