import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EggBack } from './lib/egg-back';
import { EggFront } from './lib/egg-front';
import { Piezo } from './lib/audio';
import { CONFIG } from './lib/config';
import { CycleWatch, Verdict } from './lib/cycle';
import { Band, Lcd, PopulationTrace } from './lib/lcd';
import { Drawing, defaultsFor, drawingOf, parseOptions, toQueryParams } from './lib/options';
import { PRESETS, Preset, findPreset, presetById, presetRule } from './lib/presets';
import { parseRle } from './lib/rle';
import { CONWAY, Rule, formatRule, normalize, transitionTable } from './lib/rule';
import { StartId, isRandomStart, randomSeed, sow } from './lib/seed';
import { shuffleRule } from './lib/shuffle';
import { tourStep } from './lib/tour';
import { World } from './lib/world';

/** Ce que le DOM affiche de la simulation (rafraîchi une dizaine de fois par seconde). */
interface Status {
  verdict: Verdict['kind'];
  period: number;
  generation: number;
  population: number;
}

const VERDICT_LABELS: Readonly<Record<Verdict['kind'], string>> = {
  alive: 'ça grouille',
  still: 'figé',
  oscillator: 'oscille',
  extinct: 'éteint',
};

@Component({
  selector: 'app-day-06-tiny',
  imports: [EggFront, EggBack],
  host: {
    class:
      'relative block size-full overflow-hidden select-none bg-night-floor [container-type:size]',
    '(document:keydown)': 'onKeydown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <div aria-hidden="true" class="orb bg-glow-pink -top-[18cqh] right-[8cqw] opacity-25"></div>
    <div aria-hidden="true" class="orb bg-glow-cyan bottom-[-22cqh] left-[4cqw] opacity-20"></div>

    <div class="stage">
      <div class="egg-wrap" [class.flipped]="flipped()" [class.reduced]="reducedMotion">
        <div class="egg-inner">
          <app-tiny-front
            class="face front egg"
            [inert]="flipped()"
            [running]="running()"
            [sound]="sound()"
            [backlight]="backlight()"
            [speed]="speed()"
            [verdict]="status().verdict"
            [period]="status().period"
            [custom]="!preset()"
            [hint]="!hinted()"
            [label]="lcdLabel()"
            (run)="toggleRun()"
            (sow)="sowAgain()"
            (next)="cyclePreset(1)"
            (flip)="toggleFlip()"
            (light)="toggleLight()"
            (soundToggle)="toggleSound()"
            (paintStart)="onPointerDown($event)"
            (paintMove)="onPointerMove($event)"
            (paintEnd)="onPointerUp()"
          />

          <app-tiny-back
            class="face back egg"
            [inert]="!flipped()"
            [(rule)]="rule"
            [(start)]="start"
            [(density)]="density"
            [(speed)]="speed"
            [preset]="preset()"
            (hatch)="hatch()"
            (shuffle)="shuffle()"
            (clear)="clearAll()"
            (turn)="toggleFlip()"
            (cyclePreset)="cyclePreset($event, false)"
          />
        </div>
      </div>

      <aside
        class="card border-border bg-card/80 text-card-foreground rounded-xl border p-5 text-sm shadow-xl backdrop-blur"
      >
        <p class="text-sky font-display text-sm font-semibold">Souche</p>
        <p class="font-display text-2xl leading-tight font-semibold text-white">
          {{ preset()?.name ?? 'Souche perso' }}
        </p>
        <p class="text-primary font-mono text-sm">{{ ruleText() }}</p>
        <p class="text-muted-foreground mt-2 leading-snug">
          {{ preset()?.blurb ?? 'Ta règle à toi : personne ne sait encore ce qu’elle donne.' }}
        </p>

        <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-xs tabular-nums">
          <dt class="text-muted-foreground">Génération</dt>
          <dd class="text-right">{{ status().generation }}</dd>
          <dt class="text-muted-foreground">Population</dt>
          <dd class="text-right">{{ status().population }}</dd>
          <dt class="text-muted-foreground">État</dt>
          <dd class="text-right">{{ verdictLabel() }}</dd>
        </dl>

        <div class="commands">
          <p class="text-sky font-display mt-5 mb-1.5 text-sm font-semibold">Commandes</p>
          <ul class="text-muted-foreground grid gap-1 text-xs">
            <li><kbd>Espace</kbd> lecture, pause · <kbd>N</kbd> pas à pas</li>
            <li><kbd>R</kbd> semer · <kbd>X</kbd> tout effacer</li>
            <li><kbd>←</kbd> <kbd>→</kbd> souche · <kbd>1</kbd>–<kbd>5</kbd> vitesse</li>
            <li><kbd>F</kbd> retourner l’œuf (les règles)</li>
            <li><kbd>L</kbd> lumière · <kbd>M</kbd> son · <kbd>T</kbd> démo</li>
            <li>Dessine sur l’écran à la souris ou au doigt.</li>
          </ul>
        </div>
      </aside>
    </div>

    @if (options.debug) {
      <p class="absolute bottom-2 left-3 font-mono text-[11px] text-white/70 tabular-nums">
        {{ debugLine() }}
      </p>
    }
  `,
  styles: `
    .orb {
      position: absolute;
      width: 70cqh;
      height: 70cqh;
      border-radius: 9999px;
      filter: blur(64px);
      pointer-events: none;
    }
    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4cqw;
    }
    .egg-wrap {
      /* L'unité de l'œuf : 100 u de large, 128 u de haut. */
      --u: min(0.9cqw, 0.72cqh);
      position: relative;
      width: calc(var(--u) * 100);
      height: calc(var(--u) * 128);
      perspective: calc(var(--u) * 450);
      flex-shrink: 0;
    }
    .card {
      display: none;
      width: 18rem;
      flex-direction: column;
    }
    @container (min-aspect-ratio: 4/3) and (min-width: 760px) {
      .egg-wrap {
        --u: min(0.55cqw, 0.72cqh);
      }
      .card {
        display: flex;
      }
    }
    @container (max-aspect-ratio: 3/4) {
      .stage {
        flex-direction: column;
        gap: 3cqh;
      }
      .egg-wrap {
        --u: min(0.9cqw, 0.52cqh);
      }
      .card {
        display: flex;
        width: min(22rem, calc(100cqw - 2rem));
        padding: 0.9rem 1.1rem;
      }
      .card .commands {
        display: none;
      }
    }
    .egg-inner {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      transition: transform 0.75s cubic-bezier(0.3, 0.7, 0.2, 1);
    }
    .flipped .egg-inner {
      transform: rotateY(180deg);
    }
    .face {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
    }
    .back {
      transform: rotateY(180deg);
    }
    .reduced .egg-inner {
      transition: none;
      transform: none;
    }
    .reduced .face {
      backface-visibility: visible;
      transition: opacity 0.3s;
    }
    .reduced .back {
      transform: none;
      opacity: 0;
    }
    .reduced.flipped .back {
      opacity: 1;
    }
    .reduced.flipped .front {
      opacity: 0;
    }

    /* La coque : plastique translucide périwinkle, reflet en haut à gauche, pailleté discret. */
    :host ::ng-deep .egg {
      border-radius: 50% 50% 50% 50% / 56% 56% 44% 44%;
      background:
        radial-gradient(ellipse 34% 20% at 30% 17%, rgb(255 255 255 / 0.6), transparent 70%),
        radial-gradient(circle at 50% 118%, rgb(36 24 140 / 0.6), transparent 55%),
        radial-gradient(circle at 42% 34%, #aeb2ff, #777eff 45%, #5c56dc 78%, #3f37a8);
      box-shadow:
        inset 0 calc(var(--u) * -2) calc(var(--u) * 5) rgb(24 12 96 / 0.55),
        inset 0 calc(var(--u) * 1.4) calc(var(--u) * 3) rgb(255 255 255 / 0.4),
        0 calc(var(--u) * 4) calc(var(--u) * 10) rgb(0 0 0 / 0.45);
    }
    :host ::ng-deep .egg::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background-image:
        radial-gradient(circle, rgb(255 255 255 / 0.55) 0.5px, transparent 1.2px),
        radial-gradient(circle, rgb(255 202 236 / 0.5) 0.5px, transparent 1.2px);
      background-size:
        calc(var(--u) * 3.1) calc(var(--u) * 2.7),
        calc(var(--u) * 4.3) calc(var(--u) * 3.9);
      background-position:
        0 0,
        calc(var(--u) * 1.3) calc(var(--u) * 2);
      opacity: 0.35;
      pointer-events: none;
    }
    :host ::ng-deep .egg .ring {
      position: absolute;
      top: calc(var(--u) * -5.5);
      left: 50%;
      width: calc(var(--u) * 10);
      height: calc(var(--u) * 9);
      transform: translateX(-50%);
      border: calc(var(--u) * 1.6) solid #c9c6f5;
      border-bottom-color: transparent;
      border-radius: 50% 50% 0 0;
      box-shadow: inset 0 calc(var(--u) * 0.4) 0 rgb(255 255 255 / 0.6);
      z-index: -1;
    }
    kbd {
      display: inline-block;
      min-width: 1.4em;
      padding: 0 0.35em;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: rgb(255 255 255 / 0.08);
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 0.95em;
      text-align: center;
    }
  `,
})
export default class Day06Tiny {
  private readonly front = viewChild.required(EggFront);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly options = parseOptions(location.search);
  protected readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly world = new World(CONFIG.grid.width, CONFIG.grid.height);
  private readonly watch = new CycleWatch();
  private readonly trace = new PopulationTrace();
  private readonly piezo = new Piezo();
  private lcd: Lcd | null = null;

  protected readonly rule = signal<Rule>(this.options.rule ?? CONWAY);
  protected readonly start = signal<StartId>(this.options.start ?? defaultsFor(this.rule()).start);
  protected readonly density = signal(this.options.density ?? defaultsFor(this.rule()).density);
  private readonly seed = signal<number | null>(
    this.options.seed ?? (isRandomStart(this.start()) ? randomSeed() : null),
  );
  private readonly drawing = signal<Drawing | null>(this.options.drawing ?? null);
  protected readonly speed = signal<number>(
    this.reducedMotion ? CONFIG.reducedSpeed : CONFIG.defaultSpeed,
  );
  protected readonly running = signal(true);
  protected readonly backlight = signal(true);
  protected readonly sound = signal(false);
  protected readonly flipped = signal(false);
  /** L'indice « retourne-moi » disparaît au premier retournement. */
  protected readonly hinted = signal(false);
  protected readonly status = signal<Status>({
    verdict: 'alive',
    period: 0,
    generation: 0,
    population: 0,
  });

  protected readonly preset = computed<Preset | null>(() => findPreset(this.rule()) ?? null);
  protected readonly ruleText = computed(() => formatRule(this.rule()));
  protected readonly verdictLabel = computed(() => VERDICT_LABELS[this.status().verdict]);
  protected readonly lcdLabel = computed(
    () =>
      `Écran : ${this.preset()?.name ?? 'souche perso'} (${this.ruleText()}), génération ${this.status().generation}, ${this.status().population} cellules vivantes, ${this.verdictLabel()}.`,
  );
  protected readonly debugLine = signal('');
  private readonly table = computed(() => transitionTable(this.rule()));

  /** Dernière souche choisie : point de départ de ← / → quand la règle est perso. */
  private presetIndex = Math.max(
    0,
    PRESETS.findIndex((p) => p === findPreset(this.rule())),
  );
  private verdict: Verdict = { kind: 'alive' };
  /** Secondes à attendre avant de lancer les générations (le temps de lire le motif semé). */
  private hold = 0;
  private banner: string | null = null;
  private bannerLeft = 0;
  private readonly band: Band = { banner: null, rule: '', generation: 0, trace: this.trace };
  private acc = 0;
  private frame = 0;
  private last = 0;
  private statusClock = 0;
  private lastRule: Rule | null = null;
  private tour: { t: number; step: number } | null = null;
  private stroke: { value: number; x: number; y: number } | null = null;
  private urlTimer = 0;
  private stepMs = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.seedWorld();
    this.publishStatus(0);
    this.showBanner(this.preset()?.name ?? 'TinyLife');
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      clearTimeout(this.urlTimer);
      this.piezo.dispose();
    });

    // L'adresse suit l'état, pour que le bouton de partage du site donne un lien qui rejoue la même boîte.
    effect(() => {
      const params = toQueryParams({
        rule: this.rule(),
        start: this.start(),
        density: this.density(),
        seed: this.seed(),
        drawing: this.drawing(),
      });
      clearTimeout(this.urlTimer);
      this.urlTimer = window.setTimeout(() => this.writeUrl(params), 300);
    });

    afterNextRender(() => {
      const front = this.front();
      const lcd = new Lcd(front.canvas().nativeElement, { reducedMotion: this.reducedMotion });
      this.lcd = lcd;
      const slot = front.slot().nativeElement;
      const fit = () => lcd.resize(slot.clientWidth, slot.clientHeight);
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(slot);
      destroyRef.onDestroy(() => observer.disconnect());

      const tick = (now: number) => {
        this.frame = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
        this.last = now;
        this.frameStep(dt, lcd);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  // ------------------------------------------------------------ boucle

  private frameStep(dt: number, lcd: Lcd): void {
    const rule = this.rule();
    if (rule !== this.lastRule) {
      this.lastRule = rule;
      lcd.setStates(normalize(rule).states);
      this.watch.reset();
    }
    if (this.tour) this.advanceTour(dt);

    if (this.running()) {
      if (this.hold > 0) {
        this.hold -= dt;
      } else {
        this.acc += dt * CONFIG.speeds[this.speed()];
        const steps = Math.min(Math.floor(this.acc), CONFIG.maxStepsPerFrame);
        this.acc = steps === CONFIG.maxStepsPerFrame ? 0 : this.acc - steps;
        const t0 = performance.now();
        for (let i = 0; i < steps; i++) this.advance();
        if (steps) this.stepMs = (performance.now() - t0) / steps;
      }
    }

    this.bannerLeft -= dt;
    this.band.banner = this.bannerLeft > 0 ? this.banner : null;
    this.band.rule = this.ruleText();
    this.band.generation = this.world.generation;
    lcd.update(this.world, this.band, dt);
    lcd.draw();

    this.statusClock += dt;
    if (this.statusClock >= CONFIG.statusEvery) {
      this.statusClock = 0;
      this.publishStatus(dt);
    }
  }

  /** Une génération. */
  private advance(): void {
    const w = this.world;
    w.step(this.rule(), this.table());
    this.verdict = this.watch.push(w.cells, w.population);
    this.trace.push(w.population);
    this.piezo.generation(w.births, w.birthX, w.birthY);
  }

  private publishStatus(dt: number): void {
    const v = this.verdict;
    const next: Status = {
      verdict: v.kind,
      period: v.kind === 'oscillator' ? v.period : 0,
      generation: this.world.generation,
      population: this.world.population,
    };
    const s = this.status();
    if (
      s.verdict !== next.verdict ||
      s.period !== next.period ||
      s.generation !== next.generation ||
      s.population !== next.population
    ) {
      this.status.set(next);
    }
    if (this.options.debug && dt > 0) {
      this.debugLine.set(
        `${Math.round(1 / Math.max(dt, 1e-3))} i/s · ${this.stepMs.toFixed(2)} ms/gén · graine ${this.seed() ?? '–'} · ${this.start()}`,
      );
    }
  }

  private advanceTour(dt: number): void {
    const tour = this.tour!;
    tour.t += dt;
    const step = tourStep(tour.t);
    if (step === tour.step) return;
    if (step < 0) {
      this.tour = null;
      return;
    }
    tour.step = step;
    const preset = presetById(CONFIG.tour.steps[step]);
    if (preset) this.applyPreset(preset);
  }

  // ------------------------------------------------------------ actions

  /** Vide et resème le monde selon le semis courant (ou le dessin partagé), et remet les compteurs à zéro. */
  private seedWorld(): void {
    const drawing = this.drawing();
    const start = this.start();
    if (drawing) {
      this.world.clear();
      const pattern = parseRle(drawing.rle)!;
      for (let y = 0; y < pattern.height; y++) {
        for (let x = 0; x < pattern.width; x++) {
          if (pattern.cells[y * pattern.width + x] !== 1) continue;
          this.world.set(drawing.x + x, drawing.y + y, 1);
        }
      }
    } else {
      sow(this.world, start, this.density(), this.seed() ?? 0);
    }
    this.watch.reset();
    this.trace.reset();
    this.verdict = { kind: 'alive' };
    this.acc = 0;
    // Un motif posé reste visible un instant avant de vivre (« TINY » un peu plus, le temps de le lire).
    const stamped = !drawing && !isRandomStart(start);
    this.hold = !stamped ? 0 : start === 'tiny' ? CONFIG.hold.intro : CONFIG.hold.stamp;
  }

  private showBanner(text: string): void {
    this.banner = text;
    this.bannerLeft = CONFIG.banner;
  }

  protected toggleRun(): void {
    this.piezo.click();
    if (!this.running() && this.world.population === 0 && !this.drawing()) this.seedWorld();
    this.running.update((r) => !r);
  }

  /** Bouton B : resème (une nouvelle graine pour une soupe). */
  protected sowAgain(): void {
    this.piezo.click();
    this.drawing.set(null);
    if (isRandomStart(this.start())) this.seed.set(randomSeed());
    this.seedWorld();
    this.running.set(true);
  }

  /** Souche suivante ou précédente ; sur la face avant, on resème tout de suite. */
  protected cyclePreset(dir: number, sowNow = true): void {
    this.piezo.click();
    const i = (this.presetIndex + dir + PRESETS.length) % PRESETS.length;
    this.applyPreset(PRESETS[i], sowNow);
  }

  private applyPreset(preset: Preset, sowNow = true): void {
    this.presetIndex = PRESETS.indexOf(preset);
    this.rule.set(presetRule(preset));
    this.start.set(preset.start);
    this.density.set(preset.density);
    this.seed.set(isRandomStart(preset.start) ? randomSeed() : null);
    this.drawing.set(null);
    this.showBanner(preset.name);
    if (sowNow) {
      this.seedWorld();
      this.running.set(true);
    }
  }

  protected stepOnce(): void {
    this.running.set(false);
    this.advance();
  }

  protected setSpeed(i: number): void {
    this.speed.set(Math.max(0, Math.min(CONFIG.speeds.length - 1, i)));
  }

  protected toggleFlip(): void {
    this.piezo.click();
    this.hinted.set(true);
    this.flipped.update((f) => !f);
  }

  protected toggleLight(): void {
    this.piezo.click();
    this.backlight.update((b) => !b);
    this.lcd?.setLighting(this.backlight() ? 'backlight' : 'reflective');
  }

  protected toggleSound(): void {
    if (this.sound()) {
      this.piezo.disable();
      this.sound.set(false);
      return;
    }
    this.sound.set(true);
    void this.piezo.enable().then(() => this.piezo.click());
  }

  /** Tout effacer : la boîte vide, en pause, prête pour un dessin. */
  protected clearAll(): void {
    this.piezo.click();
    this.world.clear();
    this.watch.reset();
    this.trace.reset();
    this.verdict = { kind: 'extinct' };
    this.drawing.set(null);
    this.running.set(false);
    this.flipped.set(false);
  }

  /** « Faire éclore » : resème, retourne l'œuf et lance la simulation. */
  protected hatch(): void {
    this.drawing.set(null);
    if (isRandomStart(this.start())) this.seed.set(randomSeed());
    this.seedWorld();
    this.running.set(true);
    this.flipped.set(false);
    this.piezo.click();
  }

  /** « Au hasard » : une règle vivante tirée au sort, à essayer sur une soupe. */
  protected shuffle(): void {
    this.piezo.click();
    this.rule.set(shuffleRule(randomSeed(), this.rule().neighborhood));
    this.start.set('soup');
    this.density.set(0.35);
  }

  private startTour(): void {
    this.hinted.set(true);
    this.flipped.set(false);
    this.running.set(true);
    this.tour = { t: 0, step: -1 };
  }

  // ------------------------------------------------------------ dessin

  protected onPointerDown(event: PointerEvent): void {
    const cell = this.lcd?.cellAt(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const value = this.world.get(cell.x, cell.y) === 1 ? 0 : 1;
    this.stroke = { value, ...cell };
    this.world.set(cell.x, cell.y, value);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.stroke) return;
    const cell = this.lcd?.cellAt(event.clientX, event.clientY);
    if (!cell) return;
    // Trait continu entre deux positions (Bresenham), même si le pointeur va vite.
    let { x, y } = this.stroke;
    const dx = Math.abs(cell.x - x);
    const dy = -Math.abs(cell.y - y);
    const sx = x < cell.x ? 1 : -1;
    const sy = y < cell.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.world.set(x, y, this.stroke.value);
      if (x === cell.x && y === cell.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    this.stroke.x = cell.x;
    this.stroke.y = cell.y;
  }

  protected onPointerUp(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.watch.reset();
    const { cells, width, height } = this.world;
    this.drawing.set(drawingOf(cells, width, height));
  }

  // ------------------------------------------------------------ clavier, onglet, adresse

  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
    // Espace et Entrée sur un bouton : c'est le bouton qui répond.
    if ((event.code === 'Space' || event.code === 'Enter') && target?.closest('button')) return;
    const code = event.code;
    if (code === 'Escape' && this.flipped()) {
      this.toggleFlip();
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      event.preventDefault();
      this.cyclePreset(code === 'ArrowLeft' ? -1 : 1, !this.flipped());
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (digit) {
      this.setSpeed(Number(digit[1]) - 1);
      return;
    }
    if (event.repeat && code !== 'KeyN') return;
    switch (code) {
      case 'Space':
        event.preventDefault();
        this.toggleRun();
        break;
      case 'KeyN':
        this.stepOnce();
        break;
      case 'KeyR':
        this.sowAgain();
        break;
      case 'KeyF':
        this.toggleFlip();
        break;
      case 'KeyL':
        this.toggleLight();
        break;
      case 'KeyM':
        this.toggleSound();
        break;
      case 'KeyT':
        this.startTour();
        break;
      case 'KeyX':
      case 'Delete':
        this.clearAll();
        break;
    }
  }

  protected onVisibility(): void {
    this.last = 0;
    this.piezo.setHidden(document.hidden);
  }

  /** Reflète l'état dans l'adresse (sans entrée d'historique), seulement si quelque chose a changé. */
  private writeUrl(params: Record<string, string | null>): void {
    const current = new URLSearchParams(location.search);
    if (Object.entries(params).every(([k, v]) => current.get(k) === v)) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
