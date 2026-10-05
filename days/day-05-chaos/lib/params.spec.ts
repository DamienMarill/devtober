import { describe, expect, it } from 'vitest';
import { Body } from './body';
import { CONFIG } from './config';
import { createParams, computeParams } from './params';
import { seeded } from './math';

describe('fin : immobilité', () => {
  it('poussée, vitesse max et courant résiduel tombent à 0 avant density 1', () => {
    const p = createParams();
    computeParams(p, CONFIG.body.stall[1], 0);
    expect(p.thrust).toBe(0);
    expect(p.maxSpeed).toBe(0);
    expect(p.residual).toBe(0);
  });

  it('rien ne change avant le début de la fenêtre', () => {
    const p = createParams();
    computeParams(p, CONFIG.body.stall[0], 0);
    expect(p.maxSpeed).toBeCloseTo(
      CONFIG.body.maxSpeed[0] + (CONFIG.body.maxSpeed[1] - CONFIG.body.maxSpeed[0]) * 0.75,
      6,
    );
  });

  it('le body, input maintenu, finit par ne plus bouger du tout', () => {
    const p = createParams();
    computeParams(p, 1, 0);
    const body = new Body(seeded(7));
    for (let i = 0; i < 60 * 10; i++) body.step(1 / 60, 1, 0, p);
    const x = body.x;
    for (let i = 0; i < 60 * 5; i++) body.step(1 / 60, 1, 0, p);
    expect(Math.hypot(body.vx, body.vy)).toBeLessThan(1e-4);
    expect(Math.abs(body.x - x)).toBeLessThan(1e-3);
  });
});
