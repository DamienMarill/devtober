import { describe, expect, it } from 'vitest';
import { DECOR } from './decor';
import { POWER_BASE, ROAD_WIDTH, TILT, circuitBounds } from './road';
import { Point, Track, figureEight, rotate } from './track';

const track = new Track(figureEight().points);
/** Distance d'un point au milieu de la route. */
const toRoad = (p: Point) => Math.min(...track.points.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
/** Bord de la route, plus les vibreurs et les glissières qui la longent. */
const CLEARANCE = ROAD_WIDTH / 2 + 14;

describe('décor', () => {
  it('ne pose aucun objet sur la piste ni sur ses glissières', () => {
    for (const item of DECOR) {
      expect(toRoad(item), `objet en (${item.x}, ${item.y})`).toBeGreaterThan(
        CLEARANCE + item.radius,
      );
    }
  });

  it('garde tout le décor dans le cadre affiché (rien de coupé au bord de l’écran)', () => {
    const box = circuitBounds(track);
    for (const item of DECOR) {
      // La boîte est dans le repère tourné du circuit : on y met l'objet avant de comparer.
      const { x, y } = rotate(item, TILT);
      const at = `objet en (${item.x}, ${item.y})`;
      expect(x - item.radius, at).toBeGreaterThanOrEqual(box.minX);
      expect(x + item.radius, at).toBeLessThanOrEqual(box.maxX);
      expect(y - item.radius, at).toBeGreaterThanOrEqual(box.minY);
      expect(y + item.radius, at).toBeLessThanOrEqual(box.maxY);
    }
  });

  it('laisse le bornier à côté de la route', () => {
    // Demi-diagonale du boîtier : 66 × 34.
    expect(toRoad(POWER_BASE)).toBeGreaterThan(ROAD_WIDTH / 2 + Math.hypot(33, 17));
  });
});
