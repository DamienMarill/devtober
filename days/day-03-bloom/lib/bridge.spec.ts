import { describe, expect, it } from 'vitest';
import { BRIDGE, bridgePoint } from './bridge';
import { BLEED } from './camera';
import { canopyMask } from './sakura';

const { z, depth, left, right, rail, bottom, balcony } = BRIDGE;

describe('pont', () => {
  it('est droit : la main courante a la même hauteur d’un bout à l’autre', () => {
    expect(bridgePoint(left, rail, z)[1]).toBeCloseTo(bridgePoint(right, rail, z)[1], 9);
    expect(bridgePoint(left, rail, z + depth)[1]).toBeCloseTo(
      bridgePoint(right, rail, z + depth)[1],
      9,
    );
  });

  it('traverse tout le cadre, devant comme derrière', () => {
    for (const zz of [z, z + depth]) {
      expect(bridgePoint(left, rail, zz)[0]).toBeLessThan(BLEED.x);
      expect(bridgePoint(right, rail, zz)[0]).toBeGreaterThan(BLEED.x + BLEED.w);
    }
  });

  it('avance son carré central vers nous : plus large que le tablier, sans le dominer', () => {
    const front = z - balcony.depth;
    const width = (zz: number) =>
      bridgePoint(balcony.x + balcony.half, rail, zz)[0] -
      bridgePoint(balcony.x - balcony.half, rail, zz)[0];
    expect(width(front)).toBeGreaterThan(width(z));
    // On le voit d'un peu en dessous : il dépasse à peine du tablier en hauteur.
    const rise = bridgePoint(balcony.x, rail, z)[1] - bridgePoint(balcony.x, rail, front)[1];
    expect(rise).toBeGreaterThan(0);
    expect(rise).toBeLessThan(15);
    expect(bridgePoint(balcony.x, bottom, z)[1]).toBeGreaterThan(
      bridgePoint(balcony.x, bottom, front)[1],
    );
  });

  it('forme un carré : aussi profond que large au milieu', () => {
    expect(depth + 2 * balcony.depth).toBeCloseTo(2 * balcony.half, 6);
  });

  it('place le carré dans la trouée des cerisiers', () => {
    const [x, y] = bridgePoint(balcony.x, (rail + bottom) / 2, z - balcony.depth);
    expect(canopyMask().at(x, y)).toBe(0);
  });
});
