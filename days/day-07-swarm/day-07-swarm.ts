import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Bell } from './lib/audio';
import { autopilot } from './lib/autopilot';
import { CONFIG } from './lib/config';
import { DayReport } from './lib/day-report';
import { Demand } from './lib/demand';
import { Feed, FeedItem } from './lib/feed';
import { FleetPanel, LineRow } from './lib/fleet-panel';
import { buildNetwork } from './lib/network';
import { parseOptions } from './lib/options';
import { Renderer } from './lib/render';
import { computeRoutes } from './lib/routing';
import { WEDNESDAY } from './lib/scenario';
import { Report, clock, makeReport } from './lib/score';
import { Sim } from './lib/sim';
import { Swarm } from './lib/swarm';

/** intro : l'écran d'accueil (la démo tourne derrière) · play : le joueur régule · demo : touche T · report : bilan. */
type Mode = 'intro' | 'play' | 'demo' | 'report';

interface Hud {
  time: number;
  rows: LineRow[];
  depot: number;
  incoming: number;
  served: number;
  lost: number;
  share: number;
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  lines: { id: number; color: string; text: string; waiting: number; wait: number }[];
  lost: number;
}

/** Le réseau et ses itinéraires ne changent jamais : calculés une fois, au premier affichage du jour. */
const NET = buildNetwork();
const ROUTES = computeRoutes(NET);
const DEMAND = new Demand(NET);

/** La démo (touche T) : de 16 h 50 à ~20 h 50 à ×2, avec le colis suspect de 17 h 40 au bout de 6 s. */
const DEMO = { start: 16 * 60 + 50, speed: 1 };
/** L'écran d'accueil : la pointe du matin, au pilote automatique. */
const ATTRACT = { start: 7 * 60 + 25, speed: 0 };
const SPEED_LABELS = ['×1', '×2', '×4'];

@Component({
  selector: 'app-day-07-swarm',
  imports: [FleetPanel, DayReport, DecimalPipe],
  host: {
    class:
      'relative block size-full overflow-hidden select-none bg-[#0b0830] [container-type:size]',
    '(document:keydown)': 'onKeydown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <canvas
      #canvas
      class="absolute inset-0 size-full touch-none"
      aria-label="Carte des 5 lignes de tram de Montpellier : rames et voyageurs à quai"
      role="img"
      (pointermove)="onPointer($event)"
      (pointerdown)="onPointer($event)"
      (pointerleave)="hover.set(null)"
    ></canvas>

    <section #panel class="hud" aria-label="Poste de commande">
      <header class="top">
        <div class="clock-block">
          <p class="kicker text-sky font-display">PC tram · Montpellier</p>
          <p class="clock" aria-live="off">{{ clockText() }}</p>
          <p class="day text-muted-foreground">{{ dayLabel }}</p>
        </div>
        <div class="controls">
          <button
            type="button"
            class="ctl"
            [attr.aria-label]="paused() ? 'Reprendre' : 'Pause'"
            (click)="togglePause()"
          >
            @if (paused()) {
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
              </svg>
            } @else {
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
                <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              </svg>
            }
          </button>
          @for (label of speedLabels; track label; let i = $index) {
            <button
              type="button"
              class="ctl speed"
              [class.on]="speed() === i"
              [attr.aria-pressed]="speed() === i"
              [attr.aria-label]="'Vitesse ' + label"
              (click)="setSpeed(i)"
            >
              {{ label }}
            </button>
          }
          <button
            type="button"
            class="ctl wide"
            [class.on]="auto()"
            [attr.aria-pressed]="auto()"
            (click)="toggleAuto()"
          >
            Pilote auto
          </button>
          <button
            type="button"
            class="ctl"
            [class.on]="sound()"
            [attr.aria-pressed]="sound()"
            [attr.aria-label]="sound() ? 'Couper le son' : 'Activer le son'"
            (click)="toggleSound()"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
              @if (sound()) {
                <path
                  d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"
                  stroke="currentColor"
                  stroke-width="1.4"
                  fill="none"
                  stroke-linecap="round"
                />
              } @else {
                <path
                  d="M10.5 6l4 4m0-4l-4 4"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              }
            </svg>
          </button>
        </div>
        <div class="served" [title]="'Part des voyageurs arrivés à destination'">
          <p class="share">
            {{ hud().share * 100 | number: '1.0-0' }}<small>%</small>
            <span class="text-muted-foreground">servis</span>
          </p>
          <p class="counts text-muted-foreground">
            {{ hud().served | number }} à bon port ·
            <span class="lost">{{ hud().lost | number }}</span> à pied
          </p>
        </div>
      </header>

      <app-swarm-fleet
        [rows]="hud().rows"
        [selected]="selected()"
        (pick)="select($event)"
        (add)="addRame($event)"
        (remove)="removeRame($event)"
      />

      <p class="depot text-muted-foreground">
        Dépôt : <b class="text-white">{{ hud().depot }}</b> rame{{ hud().depot > 1 ? 's' : '' }}
        @if (hud().incoming) {
          · <span class="text-sky">{{ hud().incoming }} en route</span>
        }
        <span class="legend">· 1 point = 10 voyageurs</span>
      </p>

      <ol class="feed" aria-live="polite" aria-label="Fil du PC">
        @for (item of feed(); track item.id) {
          <li [attr.data-tone]="item.tone">
            <time>{{ format(item.time) }}</time>
            <span>{{ item.text }}</span>
          </li>
        }
      </ol>

      <p class="keys text-muted-foreground">
        <kbd>1</kbd>–<kbd>5</kbd> ligne · <kbd>↑</kbd> <kbd>↓</kbd> une rame de plus ou de moins ·
        <kbd>Espace</kbd> pause · <kbd>F</kbd> vitesse · <kbd>A</kbd> pilote auto · <kbd>M</kbd> son
        · <kbd>T</kbd> démo · <kbd>R</kbd> recommencer
      </p>
    </section>

    @if (hoverInfo(); as h) {
      <div class="tip" [style.left.px]="h.x" [style.top.px]="h.y" aria-hidden="true">
        <p class="font-semibold text-white">{{ h.name }}</p>
        @for (l of h.lines; track l.id) {
          <p class="tip-line">
            <span class="badge" [style.background]="l.color" [style.color]="l.text">{{
              l.id
            }}</span>
            {{ l.waiting | number }} à quai
            @if (l.waiting) {
              · {{ l.wait | number: '1.0-0' }} min
            }
          </p>
        }
        @if (h.lost) {
          <p class="text-[#ffb3bb]">{{ h.lost | number }} partis à pied</p>
        }
      </div>
    }

    @if (mode() === 'demo') {
      <p class="demo-badge">
        Démo · pilote automatique
        <button type="button" (click)="startPlay()">Prendre le service</button>
      </p>
    }

    @if (mode() === 'intro') {
      <section class="overlay" aria-labelledby="swarm-intro-title">
        <div class="card">
          <p class="text-sky font-display text-sm font-semibold">
            PC tram · Montpellier · {{ dayLabel }}
          </p>
          <h1 id="swarm-intro-title" class="font-display">Heure de pointe</h1>
          <p>
            Tu prends le poste de régulation des 5 lignes de tram de Montpellier. Le réseau est
            gratuit pour les habitants de la Métropole, et ça se voit sur les quais.
          </p>
          <p>
            À 6 h, {{ startTrams }} rames roulent ; {{ startDepot }} attendent au dépôt.
            Répartis-les entre les lignes : renforce celles où la foule s'accumule, allège celles
            qui roulent à vide. Une rame sortie du dépôt met {{ deployDelay }} minutes à rejoindre
            son terminus, une rame retirée finit d'abord sa course : guette les annonces du fil pour
            anticiper.
          </p>
          <p class="text-muted-foreground text-sm">
            Un point = 10 voyageurs, de la couleur de la ligne qu'ils attendent. Au bout de 20
            minutes environ, ils abandonnent et finissent à pied.
          </p>
          <div class="actions">
            <button type="button" class="primary" (click)="startPlay()">Prendre le service</button>
            <button type="button" class="ghost" (click)="startDemo()">
              Voir la démo <kbd>T</kbd>
            </button>
          </div>
          <p class="source text-muted-foreground">
            Stations, couleurs, temps de parcours et rames en ligne : GTFS de la TaM, horaires réels
            du
            {{ gtfsDay }}. Les événements de la journée sont inventés.
          </p>
        </div>
      </section>
    }

    @if (mode() === 'report' && report(); as r) {
      <section class="overlay" aria-label="Bilan de la journée">
        <div class="card">
          <app-swarm-report
            [report]="r"
            [benchmark]="benchmark()"
            (replay)="startPlay()"
            (demo)="startDemo()"
          />
        </div>
      </section>
    }

    @if (options.debug) {
      <p class="debug">{{ debugLine() }}</p>
    }
  `,
  styles: `
    .hud {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.55rem 0.7rem 0.65rem;
      background: rgb(11 8 48 / 0.9);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--border);
      z-index: 10;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.6rem 0.9rem;
      flex-wrap: wrap;
    }
    .kicker,
    .day,
    .keys,
    .legend {
      display: none;
    }
    .clock {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 1.55rem;
      font-weight: 700;
      line-height: 1;
      color: white;
    }
    .controls {
      display: flex;
      gap: 0.25rem;
    }
    .ctl {
      display: grid;
      place-items: center;
      min-width: 1.9rem;
      height: 1.9rem;
      padding: 0 0.4rem;
      border-radius: 0.45rem;
      border: 1px solid rgb(255 255 255 / 0.14);
      background: rgb(255 255 255 / 0.05);
      color: rgb(255 255 255 / 0.8);
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .ctl svg {
      width: 0.95rem;
      height: 0.95rem;
    }
    .ctl.on {
      background: var(--primary);
      border-color: transparent;
      color: white;
    }
    .served {
      margin-left: auto;
      text-align: right;
    }
    .share {
      font-family: var(--font-display);
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1;
      color: white;
    }
    .share small {
      font-size: 0.8rem;
    }
    .share span {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      font-weight: 400;
      margin-left: 0.2rem;
    }
    .counts {
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
    }
    .lost {
      color: #ffb3bb;
    }
    .depot {
      font-size: 0.75rem;
    }
    .feed {
      font-size: 0.75rem;
      line-height: 1.35;
    }
    .feed li {
      display: flex;
      gap: 0.45rem;
      color: var(--card-foreground);
    }
    .feed li:not(:first-child) {
      display: none;
    }
    .feed li span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .feed time {
      font-family: var(--font-mono);
      color: var(--muted-foreground);
      flex-shrink: 0;
    }
    .feed [data-tone='alert'] span {
      color: #ffc7a8;
    }
    .feed [data-tone='event'] span {
      color: var(--color-sky);
    }
    .feed [data-tone='joke'] span {
      color: var(--color-sakura);
    }

    /* Paysage large : panneau à gauche, fil complet, raccourcis clavier. */
    @container (min-aspect-ratio: 5/4) and (min-width: 820px) {
      .hud {
        top: 0;
        right: auto;
        width: 23rem;
        gap: 0.8rem;
        padding: 1.1rem 1rem;
        border-top: none;
        border-right: 1px solid var(--border);
        overflow-y: auto;
      }
      .top {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
      }
      .controls {
        grid-column: 1 / -1;
        grid-row: 2;
      }
      .kicker,
      .day,
      .legend {
        display: block;
      }
      .legend {
        display: inline;
      }
      .kicker {
        font-size: 0.8rem;
        font-weight: 600;
        margin-bottom: 0.2rem;
      }
      .day {
        font-size: 0.75rem;
        margin-top: 0.25rem;
      }
      .clock {
        font-size: 2.6rem;
      }
      .share {
        font-size: 1.8rem;
      }
      .feed {
        display: grid;
        gap: 0.35rem;
        min-height: 0;
      }
      .feed li:not(:first-child) {
        display: flex;
        opacity: 0.75;
      }
      .feed li span {
        white-space: normal;
      }
      .keys {
        display: block;
        margin-top: auto;
        font-size: 0.68rem;
        line-height: 1.7;
      }
    }

    .tip {
      position: absolute;
      z-index: 20;
      min-width: 9rem;
      padding: 0.45rem 0.6rem;
      border-radius: 0.55rem;
      border: 1px solid rgb(255 255 255 / 0.15);
      background: rgb(14 10 53 / 0.95);
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--card-foreground);
      pointer-events: none;
      transform: translate(12px, -50%);
    }
    .tip-line {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-variant-numeric: tabular-nums;
    }
    .badge {
      display: inline-grid;
      place-items: center;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 0.25rem;
      font-size: 0.65rem;
      font-weight: 800;
    }
    .demo-badge {
      position: absolute;
      top: 0.7rem;
      right: 0.7rem;
      z-index: 15;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 0.4rem 0.35rem 0.75rem;
      border-radius: 9999px;
      background: rgb(14 10 53 / 0.85);
      border: 1px solid rgb(255 255 255 / 0.15);
      font-size: 0.75rem;
      color: var(--card-foreground);
    }
    .demo-badge button {
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: var(--primary);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    .overlay {
      position: absolute;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgb(8 6 30 / 0.45);
      overflow-y: auto;
    }
    .card {
      width: min(31rem, 100%);
      padding: 1.4rem 1.5rem;
      border-radius: 1rem;
      border: 1px solid rgb(255 255 255 / 0.12);
      background: rgb(14 10 53 / 0.92);
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgb(0 0 0 / 0.45);
      color: var(--card-foreground);
      font-size: 0.92rem;
      line-height: 1.55;
    }
    .card h1 {
      margin: 0.15rem 0 0.6rem;
      font-size: 2.2rem;
      line-height: 1.05;
      font-weight: 800;
      color: white;
    }
    .card p + p {
      margin-top: 0.6rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1.1rem;
    }
    .actions button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 1rem;
      border-radius: 0.55rem;
      font-weight: 700;
      cursor: pointer;
    }
    .primary {
      background: var(--primary);
      color: var(--primary-foreground);
    }
    .ghost {
      border: 1px solid rgb(255 255 255 / 0.2);
      color: white;
    }
    .source {
      margin-top: 1rem !important;
      font-size: 0.72rem;
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
      font-size: 0.9em;
      text-align: center;
    }
    .debug {
      position: absolute;
      top: 0.4rem;
      right: 0.6rem;
      z-index: 40;
      font-family: var(--font-mono);
      font-size: 11px;
      color: rgb(255 255 255 / 0.7);
    }
  `,
})
export default class Day07Swarm {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly hudRef = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly options = parseOptions(location.search);

  protected readonly dayLabel = CONFIG.day.label;
  protected readonly speedLabels = SPEED_LABELS;
  protected readonly deployDelay = CONFIG.depot.deploy;
  protected readonly gtfsDay = '7 octobre 2026';
  protected readonly startTrams = NET.lines.reduce(
    (s, l) => s + l.fleet[Math.floor(CONFIG.day.start / 60)],
    0,
  );
  protected readonly startDepot = NET.lines.reduce((s, l) => s + l.fleet[8], 0) - this.startTrams;

  protected readonly mode = signal<Mode>('intro');
  protected readonly paused = signal(false);
  protected readonly speed = signal(0);
  protected readonly auto = signal(true);
  protected readonly sound = signal(false);
  protected readonly selected = signal<number | null>(null);
  protected readonly hover = signal<number | null>(null);
  protected readonly hud = signal<Hud>({
    time: CONFIG.day.start,
    rows: [],
    depot: 0,
    incoming: 0,
    served: 0,
    lost: 0,
    share: 1,
  });
  protected readonly feed = signal<FeedItem[]>([]);
  protected readonly report = signal<Report | null>(null);
  protected readonly benchmark = signal<number | null>(null);
  protected readonly hoverInfo = signal<HoverInfo | null>(null);
  protected readonly debugLine = signal('');
  protected readonly clockText = computed(() => clock(this.hud().time));

  private sim!: Sim;
  private feedLog!: Feed;
  private renderer: Renderer | null = null;
  private swarm: Swarm | null = null;
  private readonly bell = new Bell();
  private frame = 0;
  private last = 0;
  private acc = 0;
  private autoClock = 0;
  private hudClock = 0;
  private benchTimer = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      clearTimeout(this.benchTimer);
      this.bell.dispose();
    });

    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      const renderer = new Renderer(canvas, NET);
      this.renderer = renderer;
      this.swarm = new Swarm(NET, renderer);
      this.fit();
      const observer = new ResizeObserver(() => this.fit());
      observer.observe(this.host);
      observer.observe(this.hudRef().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());

      if (this.options.start !== null) this.startPlay(this.options.start);
      else this.toIntro();

      const tick = (now: number) => {
        this.frame = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
        this.last = now;
        this.step(dt);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  // ------------------------------------------------------------ modes

  /** Une nouvelle journée, avancée sans rendu jusqu'à `start` (au pilote automatique). */
  private newDay(start: number): void {
    const sim = new Sim(NET, ROUTES, DEMAND, {
      seed: this.options.seed ?? undefined,
      scenario: WEDNESDAY,
      track: false,
    });
    let clockAuto = 0;
    while (sim.time < start) {
      sim.step(CONFIG.step);
      clockAuto += CONFIG.step;
      if (clockAuto >= CONFIG.autopilot.every) {
        clockAuto = 0;
        autopilot(sim);
      }
    }
    sim.notices.length = 0;
    sim.track = true;
    this.sim = sim;
    this.feedLog = new Feed(NET);
    this.feed.set([]);
    this.acc = 0;
    this.autoClock = 0;
    this.swarm?.rebuild(sim);
    this.report.set(null);
    this.publish();
  }

  private toIntro(): void {
    this.mode.set('intro');
    this.auto.set(true);
    this.speed.set(ATTRACT.speed);
    this.paused.set(false);
    this.newDay(ATTRACT.start);
  }

  protected startPlay(start: number = CONFIG.day.start): void {
    this.mode.set('play');
    this.auto.set(false);
    this.speed.set(0);
    this.paused.set(false);
    this.selected.set(null);
    this.renderer?.select(null);
    this.newDay(start);
  }

  protected startDemo(): void {
    this.mode.set('demo');
    this.auto.set(true);
    this.speed.set(DEMO.speed);
    this.paused.set(false);
    this.selected.set(null);
    this.renderer?.select(null);
    this.newDay(DEMO.start);
  }

  private endOfDay(): void {
    if (this.mode() !== 'play') {
      // L'accueil et la démo tournent en boucle.
      if (this.mode() === 'demo') this.startDemo();
      else this.toIntro();
      return;
    }
    this.mode.set('report');
    this.report.set(makeReport(this.sim));
    this.benchmark.set(null);
    this.bell.ding();
    // La note du pilote automatique sur la même journée : une simulation sans rendu (une demi-seconde).
    this.benchTimer = window.setTimeout(() => {
      const bench = new Sim(NET, ROUTES, DEMAND, {
        seed: this.options.seed ?? undefined,
        scenario: WEDNESDAY,
        track: false,
      });
      let c = 0;
      while (bench.time < CONFIG.day.end) {
        bench.step(CONFIG.step);
        c += CONFIG.step;
        if (c >= CONFIG.autopilot.every) {
          c = 0;
          autopilot(bench);
        }
      }
      this.benchmark.set(makeReport(bench).note);
    }, 120);
  }

  // ------------------------------------------------------------ boucle

  private step(dt: number): void {
    const sim = this.sim;
    const renderer = this.renderer;
    const swarm = this.swarm;
    if (!sim || !renderer || !swarm) return;

    if (this.mode() !== 'report' && !this.paused()) {
      this.acc += dt * CONFIG.speeds[this.speed()];
      let steps = Math.floor(this.acc / CONFIG.step);
      if (steps > CONFIG.maxStepsPerFrame) {
        steps = CONFIG.maxStepsPerFrame;
        this.acc = 0;
      } else {
        this.acc -= steps * CONFIG.step;
      }
      for (let i = 0; i < steps; i++) {
        sim.step(CONFIG.step);
        if (this.auto()) {
          this.autoClock += CONFIG.step;
          if (this.autoClock >= CONFIG.autopilot.every) {
            this.autoClock = 0;
            autopilot(sim);
          }
        }
      }
    }

    this.readNotices();
    swarm.consume(sim.events);
    sim.events.length = 0;
    swarm.update(dt);
    renderer.draw(sim, swarm, dt, this.hover());

    if (sim.time >= CONFIG.day.end && this.mode() !== 'report') this.endOfDay();

    this.hudClock += dt;
    if (this.hudClock >= 0.1) {
      this.hudClock = 0;
      this.publish(dt);
    }
  }

  private readNotices(): void {
    const sim = this.sim;
    if (!sim.notices.length) return;
    for (const notice of sim.notices) {
      const item = this.feedLog.push(notice, sim.time);
      if (!item) continue;
      if (item.station !== undefined && item.tone !== 'info') {
        this.renderer?.ping(item.station, item.tone === 'event' ? '#92d9ff' : '#ff8a5c');
      }
      if (item.tone === 'event') this.bell.ding();
      else if (item.tone === 'alert' || item.tone === 'joke') this.bell.alert();
    }
    sim.notices.length = 0;
    this.feed.set(this.feedLog.items.slice(0, CONFIG.feed.keep));
  }

  /** Ce que le DOM affiche, environ 10 fois par seconde. */
  private publish(dt = 0): void {
    const sim = this.sim;
    const rows: LineRow[] = NET.lines.map((line) => {
      const st = sim.lineStatus(line);
      return {
        id: line.id,
        color: line.color,
        text: line.text,
        name: line.loop ? 'Circulaire · Garcia Lorca' : line.name.replace(' - ', ' ↔ '),
        active: st.active,
        incoming: st.incoming,
        retiring: st.retiring,
        waiting: st.waiting * CONFIG.riderSize,
        wait: st.wait,
        level: st.wait >= 10 ? 2 : st.wait >= 6 ? 1 : 0,
      };
    });
    const s = sim.stats;
    const done = s.arrived + s.abandoned;
    this.hud.set({
      time: sim.time,
      rows,
      depot: sim.depot,
      incoming: sim.incoming.length,
      served: s.arrived * CONFIG.riderSize,
      lost: s.abandoned * CONFIG.riderSize,
      share: done ? s.arrived / done : 1,
    });
    this.updateHover();
    if (this.options.debug && dt > 0) {
      this.debugLine.set(
        `${Math.round(1 / Math.max(dt, 1e-3))} i/s · ${this.swarm?.size ?? 0} points · ${sim.waitingCount()} à quai · ${sim.trams.length} rames`,
      );
    }
  }

  private updateHover(): void {
    const s = this.hover();
    const r = this.renderer;
    if (s === null || !r) {
      if (this.hoverInfo()) this.hoverInfo.set(null);
      return;
    }
    const station = NET.stations[s];
    const lists = this.sim.waiting[s];
    const x = Math.min(r.sx[s], this.host.clientWidth - 190);
    this.hoverInfo.set({
      x,
      y: Math.max(40, r.sy[s]),
      name: station.name,
      lines: station.lines.map((id) => {
        const line = NET.lines.find((l) => l.id === id)!;
        const list = lists[NET.lines.indexOf(line)];
        const wait = list.reduce((sum, rider) => sum + (this.sim.time - rider.waitSince), 0);
        return {
          id,
          color: line.color,
          text: line.text,
          waiting: list.length * CONFIG.riderSize,
          wait: list.length ? wait / list.length : 0,
        };
      }),
      lost: this.sim.stats.abandonsBy[s] * CONFIG.riderSize,
    });
  }

  /** La carte occupe ce que le panneau laisse libre : à droite de lui en paysage, au-dessus en portrait. */
  private fit(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const host = this.host.getBoundingClientRect();
    const hud = this.hudRef().nativeElement.getBoundingClientRect();
    const side = hud.width < host.width * 0.6;
    const view = side
      ? { x: hud.right - host.left, y: 0, w: host.right - hud.right, h: host.height }
      : { x: 0, y: 0, w: host.width, h: hud.top - host.top };
    renderer.resize(host.width, host.height, Math.min(devicePixelRatio || 1, 2), view);
    if (this.sim) this.swarm?.rebuild(this.sim);
  }

  // ------------------------------------------------------------ commandes

  protected select(line: number): void {
    const next = this.selected() === line ? null : line;
    this.selected.set(next);
    this.renderer?.select(next);
    this.bell.click();
  }

  protected addRame(line: number): void {
    if (this.mode() === 'report') return;
    this.takeOver();
    this.sim.addRame(line);
    this.bell.click();
    this.publish();
  }

  protected removeRame(line: number): void {
    if (this.mode() === 'report') return;
    this.takeOver();
    this.sim.removeRame(line);
    this.bell.click();
    this.publish();
  }

  /** Toucher aux rames pendant l'accueil ou la démo : on prend le service tout de suite. */
  private takeOver(): void {
    if (this.mode() === 'intro' || this.mode() === 'demo') this.startPlay();
    else if (this.auto()) this.auto.set(false);
  }

  protected togglePause(): void {
    this.paused.update((p) => !p);
  }

  protected setSpeed(i: number): void {
    this.speed.set(i);
    this.paused.set(false);
  }

  protected toggleAuto(): void {
    this.auto.update((a) => !a);
    this.autoClock = CONFIG.autopilot.every;
  }

  protected toggleSound(): void {
    if (this.sound()) {
      this.bell.disable();
      this.sound.set(false);
      return;
    }
    this.sound.set(true);
    void this.bell.enable().then(() => this.bell.ding());
  }

  protected format(minute: number): string {
    return clock(minute);
  }

  // ------------------------------------------------------------ pointeur, clavier, onglet

  protected onPointer(event: PointerEvent): void {
    const rect = this.host.getBoundingClientRect();
    const station =
      this.renderer?.stationAt(event.clientX - rect.left, event.clientY - rect.top) ?? null;
    if (station !== this.hover()) {
      this.hover.set(station);
      this.updateHover();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
    if ((event.code === 'Space' || event.code === 'Enter') && target?.closest('button')) return;
    const code = event.code;
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (digit) {
      this.select(Number(digit[1]));
      return;
    }
    const line = this.selected();
    if (code === 'ArrowUp' || event.key === '+' || code === 'NumpadAdd') {
      if (line === null) return;
      event.preventDefault();
      this.addRame(line);
      return;
    }
    if (code === 'ArrowDown' || event.key === '-' || code === 'NumpadSubtract') {
      if (line === null) return;
      event.preventDefault();
      this.removeRame(line);
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      event.preventDefault();
      const ids = NET.lines.map((l) => l.id);
      const dir = code === 'ArrowRight' ? 1 : -1;
      const next =
        line === null
          ? dir > 0
            ? 0
            : ids.length - 1
          : (ids.indexOf(line) + dir + ids.length) % ids.length;
      this.select(ids[next]);
      return;
    }
    if (event.repeat) return;
    switch (code) {
      case 'Space':
        event.preventDefault();
        if (this.mode() === 'report') return;
        this.togglePause();
        break;
      case 'Enter':
        if (this.mode() === 'intro' || this.mode() === 'report') this.startPlay();
        break;
      case 'KeyF':
        this.setSpeed((this.speed() + 1) % CONFIG.speeds.length);
        break;
      case 'KeyA':
        if (this.mode() === 'play') this.toggleAuto();
        break;
      case 'KeyT':
        this.startDemo();
        break;
      case 'KeyM':
        this.toggleSound();
        break;
      case 'KeyR':
        this.startPlay();
        break;
      case 'Escape':
        if (this.selected() !== null) this.select(this.selected()!);
        else if (this.mode() === 'demo') this.toIntro();
        break;
    }
  }

  protected onVisibility(): void {
    this.last = 0;
    this.bell.setHidden(document.hidden);
  }
}
