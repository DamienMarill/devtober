import { Body } from './body';
import { CONFIG } from './config';
import { DensityField, Outcome } from './density';
import { DrifterField } from './drifters';
import { Glow, GlowField, GlowHandler } from './glows';
import { approach, lerp, seeded } from './math';
import { LogisticNoise } from './noise';
import { computeParams, createParams } from './params';

/** Ce que le monde signale à l'audio. */
export interface FieldEvents {
  inert(glow: Glow): void;
  bloom(glow: Glow): void;
}

/**
 * Le monde : density, body, glows, drifters, caméra en retard. Un monde sans bord, en unités `u`
 * (le plus petit côté de la vue) : `halfW` et `halfH` sont les demi-dimensions visibles.
 */
export class Field implements GlowHandler {
  readonly params = createParams();
  readonly density = new DensityField();
  readonly body: Body;
  readonly glows: GlowField;
  readonly drifters: DrifterField;

  camX = 0;
  camY = 0;
  halfW = 0;
  halfH = 0;
  /** Horloge lancée (premier geste), temps écoulé depuis. */
  running = false;
  time = 0;
  /** Temps total, horloge lancée ou non (animations ambiantes). */
  t = 0;
  inputX = 0;
  inputY = 0;
  /** Halo chaud du body après une dissipation proche (0–1+). */
  warmth = 0;
  /** Pulsation de l'aperture (−1..1, lissée). */
  pulse = 0;
  /** Opacité du pictogramme des touches (1 → 0 après la première touche de mouvement). */
  picto = 1;
  moved = false;
  lastOutcome: Outcome | null = null;
  events: FieldEvents | null = null;

  private readonly random: () => number;
  private readonly logistic: LogisticNoise;

  constructor(readonly seed: number) {
    const shapes = seeded(seed);
    this.random = seeded(seed ^ 0x5bd1e995);
    this.body = new Body(shapes);
    this.logistic = new LogisticNoise(shapes());
    this.glows = new GlowField(this.random);
    this.drifters = new DrifterField(shapes);
  }

  resize(width: number, height: number): void {
    const u = Math.max(1, Math.min(width, height));
    this.halfW = width / 2 / u;
    this.halfH = height / 2 / u;
  }

  start(): void {
    this.running = true;
  }

  step(dt: number): void {
    this.t += dt;
    if (this.running) this.time += dt;
    const p = this.params;
    const density = this.density;

    density.update(dt, this.running);
    computeParams(p, density.value, density.clearing);

    this.logistic.step(dt, p.pulseRate);
    this.pulse = approach(this.pulse, this.logistic.signed, dt, CONFIG.aperture.pulseSmoothing);

    this.body.step(dt, this.inputX, this.inputY, p);
    this.camX = approach(this.camX, this.body.x, dt, p.cameraLag);
    this.camY = approach(this.camY, this.body.y, dt, p.cameraLag);

    this.glows.step(
      dt,
      this.running,
      density.episode !== null,
      this.body.x,
      this.body.y,
      this.inputX,
      this.inputY,
      p,
      this.camX,
      this.camY,
      this.halfW,
      this.halfH,
      this,
    );
    this.drifters.step(dt, this.body.x, this.body.y, p.maxSpeed, density.value);

    const D = CONFIG.density;
    if (this.running && !density.frozen) {
      density.add(
        this.glows.dissipated * D.dissipationCost + this.glows.alignment * D.alignmentCost * dt,
      );
    }
    this.warmth =
      this.warmth * Math.exp(-dt / CONFIG.glows.warmthDecay) + this.glows.nearDissipated * 2.5;
    if (this.moved) this.picto = Math.max(0, this.picto - dt / CONFIG.picto.fade);
  }

  contact(g: Glow): void {
    const outcome = this.glows.outcomeFor(g);
    this.lastOutcome = outcome;
    if (outcome === 'inert') {
      this.glows.enter(g, 'extinguish');
      this.density.add(CONFIG.density.inertCost);
      this.events?.inert(g);
      return;
    }
    this.glows.enter(g, 'bloom');
    this.glows.fadeAll(g);
    const [a, b] = CONFIG.episode.hold;
    this.density.begin(outcome, lerp(a, b, this.random()));
    this.events?.bloom(g);
  }

  /** Debug : un glow à `distance` devant le body (dans le sens de l'input, sinon à droite). */
  spawnAhead(coherent: boolean, forced: Outcome | null, distance = 0.15): void {
    const m = Math.hypot(this.inputX, this.inputY);
    const dx = m > 0 ? this.inputX / m : 1;
    const dy = m > 0 ? this.inputY / m : 0;
    this.glows.spawn(
      this.body.x,
      this.body.y,
      this.camX,
      this.camY,
      this.halfW,
      this.halfH,
      this.params,
      {
        x: this.body.x + dx * distance,
        y: this.body.y + dy * distance,
        coherent,
        forced,
      },
    );
  }
}
