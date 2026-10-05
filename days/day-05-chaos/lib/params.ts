import { CONFIG } from './config';
import { ramp, smoothstep } from './math';

/** Tout ce qui découle de density, recalculé à chaque image dans un objet unique réutilisé. */
export interface Params {
  density: number;
  clearing: number;
  thrust: number;
  maxSpeed: number;
  drag: number;
  viscosity: number;
  currentGain: number;
  currentRate: number;
  currentSpread: number;
  residual: number;
  cameraLag: number;
  aperture: number;
  apertureDark: number;
  pulseAmount: number;
  pulseRate: number;
  bodyRadius: number;
  bodyCrisp: number;
  bodyLight: number;
  glowRadius: number;
  glowIntensity: number;
  glowInterval: number;
  glowDistance: number;
  glowCoherent: number;
  dissipateFrom: number;
  dissipateTo: number;
  marks: number;
  turbulence: number;
  grain: number;
}

export function createParams(): Params {
  const p = {} as Params;
  computeParams(p, 0, 0);
  return p;
}

/** Règle chaque grandeur pour une density `d` et une enveloppe de clearing `clearing` (0–1). */
export function computeParams(p: Params, d: number, clearing: number): void {
  const B = CONFIG.body;
  const C = CONFIG.current;
  const A = CONFIG.aperture;
  const G = CONFIG.glows;
  p.density = d;
  p.clearing = clearing;

  const stall = 1 - smoothstep(B.stall[0], B.stall[1], d);
  p.thrust = ramp(B.thrust, d) * stall;
  p.maxSpeed = ramp(B.maxSpeed, d) * stall;
  p.drag = ramp(B.drag, d);
  p.viscosity = ramp(B.viscosity, d);
  p.bodyRadius = ramp(B.radius, d);
  p.bodyCrisp = Math.max(ramp(B.crisp, d), clearing);
  p.bodyLight = Math.max(ramp(B.light, d), clearing);

  p.currentGain = ramp(C.gain, d, C.window) * (1 - clearing * 0.8);
  p.currentRate = ramp(C.rate, d);
  p.currentSpread = ramp(C.spread, d);
  p.residual = ramp(C.residual, d, C.residualWindow) * (1 - clearing) * stall;

  p.cameraLag = ramp(CONFIG.camera.lag, d);

  p.aperture = ramp(A.radius, d) + A.clearingBoost * clearing;
  p.apertureDark = ramp(A.dark, d) * (1 - clearing * 0.35);
  p.pulseAmount = ramp(A.pulse, d, A.pulseWindow) * (1 - clearing);
  p.pulseRate = ramp(A.pulseRate, d);

  p.glowRadius = ramp(G.radius, d);
  p.glowIntensity = ramp(G.intensity, d);
  p.glowInterval = ramp(G.interval, d);
  p.glowDistance = ramp(G.distance, d);
  p.glowCoherent = ramp(G.coherent, d);
  p.dissipateFrom = ramp(G.dissipateFrom, d);
  p.dissipateTo = ramp(G.dissipateTo, d);

  p.marks = ramp(CONFIG.marks.alpha, d, CONFIG.marks.window);
  p.turbulence = ramp(CONFIG.turbulence.alpha, d) * (1 - clearing * 0.5);
  p.grain = ramp(CONFIG.grain.alpha, d) * (1 - clearing * CONFIG.grain.clearingCut);
}
