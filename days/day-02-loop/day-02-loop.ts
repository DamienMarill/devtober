import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { COUNTDOWN, LAPS, Race, formatTime } from './lib/race';
import { PLAYER_LOOKS, PULSE_DURATION, Pulse, Scene, Wire, plugPosition } from './lib/scene';
import { FIGURE_EIGHT, Track, fitBox } from './lib/track';

/** Touche de chaque joueur (`event.key`, insensible à la casse) : Z à gauche du clavier, O à droite. */
const KEYS = ['z', 'o'] as const;
const PLAYER_NAMES = ['Joueur 1', 'Joueur 2'] as const;
/** Marge autour du circuit, en pixels, en plus de la zone des manettes en bas. */
const PADDING = 28;
/**
 * Les robots de la démo : chacun tire au départ sa cadence moyenne (secondes entre deux pressions), puis
 * presse à intervalles aléatoires autour d'elle. Deux rythmes différents, pour qu'il y ait un vainqueur.
 */
const BOT_MIN_INTERVAL = 0.095;
const BOT_MAX_INTERVAL = 0.13;
/** Le « GO » reste affiché un instant après le feu vert. */
const GO_SECONDS = 0.9;

interface PlayerHud {
  laps: number;
  current: string;
  last: string | null;
  best: string | null;
  finished: boolean;
}

interface Hud {
  elapsed: string;
  players: [PlayerHud, PlayerHud];
}

const EMPTY_PLAYER: PlayerHud = {
  laps: 0,
  current: '0:00.00',
  last: null,
  best: null,
  finished: false,
};

@Component({
  selector: 'app-day-02-loop',
  host: {
    class: 'relative block size-full touch-none select-none overflow-hidden',
    '(document:keydown)': 'onKeydown($event)',
    '(document:keyup)': 'onKeyup($event)',
    '(window:blur)': 'releaseAll()',
  },
  template: `
    <canvas #canvas aria-hidden="true" class="absolute inset-0 size-full"></canvas>

    <!-- En haut : compteur de tours et chrono de chaque joueur de part et d'autre, chrono de course au milieu. -->
    <header
      #header
      class="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 pt-3 sm:px-6 sm:pt-4"
    >
      @for (p of hud().players; track $index; let i = $index) {
        <section
          class="flex min-w-0 flex-col"
          [class.items-end]="i === 1"
          [class.order-last]="i === 1"
          [class.text-right]="i === 1"
          [attr.aria-label]="names[i]"
        >
          <p
            class="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
            [style.color]="looks[i].color"
          >
            <span
              class="size-2 rounded-full"
              [style.background]="looks[i].color"
              [class.order-last]="i === 1"
            ></span>
            {{ names[i] }}
          </p>
          <p class="font-display text-2xl leading-tight font-semibold sm:text-3xl">
            @if (p.finished) {
              Arrivé
            } @else {
              Tour <span class="tabular-nums">{{ min(p.laps + 1, laps) }}</span
              ><span class="text-muted-foreground">/{{ laps }}</span>
            }
          </p>
          <p class="font-mono text-base tabular-nums sm:text-lg">{{ p.current }}</p>
          @if (p.last; as last) {
            <p class="text-muted-foreground font-mono text-xs tabular-nums">
              dernier {{ last }}
              @if (p.best && p.best !== last) {
                · meilleur {{ p.best }}
              }
            </p>
          }
        </section>
      }
      <div class="flex flex-col items-center">
        <p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Course</p>
        <p class="font-display text-3xl font-semibold tabular-nums sm:text-4xl">
          {{ hud().elapsed }}
        </p>
      </div>
    </header>

    <!-- Feux de départ, GO, écran d'accueil et résultats, par-dessus le circuit. -->
    <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      @switch (phase()) {
        @case ('idle') {
          <div
            class="pointer-events-auto bg-background/70 border-border flex max-w-sm flex-col items-center gap-4 rounded-2xl border p-6 text-center backdrop-blur"
          >
            <p class="text-lg">
              Trois tours, deux voitures : martèle ta touche pour faire avancer la tienne.
            </p>
            <p class="text-muted-foreground text-sm">
              <kbd class="rounded border px-1.5 py-0.5 font-mono" [style.color]="looks[0].color"
                >Z</kbd
              >
              pour le joueur 1,
              <kbd class="rounded border px-1.5 py-0.5 font-mono" [style.color]="looks[1].color"
                >O</kbd
              >
              pour le joueur 2 ; sur mobile, les deux boutons en bas.
            </p>
            <div class="flex items-center gap-3">
              <button type="button" class="start-button" (click)="start(false)">Départ</button>
              <button type="button" class="demo-button" (click)="start(true)">Démo</button>
            </div>
          </div>
        }
        @case ('countdown') {
          <div
            class="flex gap-4 rounded-full bg-black/70 px-6 py-4"
            role="status"
            aria-live="assertive"
          >
            @for (n of [1, 2, 3]; track n) {
              <span
                class="size-8 rounded-full border-2 border-red-900/60 transition-colors duration-150 sm:size-10"
                [class.lit]="lights() >= n"
              ></span>
            }
          </div>
        }
        @case ('racing') {
          @if (go()) {
            <p
              class="font-display go text-7xl font-extrabold text-emerald-400 sm:text-8xl"
              role="status"
            >
              GO
            </p>
          }
        }
        @case ('finished') {
          <div
            class="pointer-events-auto bg-background/80 border-border flex max-w-sm flex-col items-center gap-3 rounded-2xl border p-6 text-center backdrop-blur"
          >
            <p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Vainqueur
            </p>
            <p class="font-display text-3xl font-bold" [style.color]="looks[winner()].color">
              {{ names[winner()] }}
            </p>
            <p class="font-mono tabular-nums">{{ hud().elapsed }}</p>
            @if (hud().players[winner()].best; as best) {
              <p class="text-muted-foreground text-sm">meilleur tour {{ best }}</p>
            }
            <button type="button" class="start-button mt-2" (click)="start(demo())">Rejouer</button>
          </div>
        }
      }
    </div>

    <!-- Les deux manettes : des touches de clavier à la souris, de gros boutons au doigt. -->
    @for (i of players; track i) {
      <button
        #pad
        type="button"
        class="pad absolute bottom-4 z-20 sm:bottom-6"
        [class]="i === 0 ? 'left-4 sm:left-8' : 'right-4 sm:right-8'"
        [class.pressed]="pressed()[i]"
        [style.--pad-color]="looks[i].color"
        [style.--pad-glow]="looks[i].glow"
        [attr.aria-label]="'Accélérer, ' + names[i]"
        (pointerdown)="press(i, $event)"
        (pointerup)="release(i)"
        (pointercancel)="release(i)"
        (pointerleave)="release(i)"
        (contextmenu)="$event.preventDefault()"
      >
        <span class="pointer-coarse:hidden font-display text-2xl font-bold">{{
          keys[i].toUpperCase()
        }}</span>
        <span class="pointer-coarse:block hidden text-lg font-bold">P{{ i + 1 }}</span>
      </button>
    }
  `,
  styles: `
    .pad {
      --pad-color: #fff;
      --pad-glow: #fff;
      display: grid;
      place-items: center;
      width: 3.75rem;
      height: 3.75rem;
      border-radius: 0.9rem;
      color: var(--pad-color);
      background: linear-gradient(180deg, #34315c, #221f45);
      border: 1px solid color-mix(in oklab, var(--pad-color) 45%, #4b4879);
      border-bottom-width: 5px;
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 0.4),
        0 0 18px color-mix(in oklab, var(--pad-glow) 35%, transparent);
      transition:
        transform 60ms,
        border-bottom-width 60ms,
        box-shadow 60ms;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .pad.pressed {
      transform: translateY(3px);
      border-bottom-width: 2px;
      background: linear-gradient(180deg, #2a2750, #1c1a33);
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 0.4),
        0 0 32px color-mix(in oklab, var(--pad-glow) 70%, transparent);
    }
    @media (pointer: coarse) {
      .pad {
        width: 5.5rem;
        height: 5.5rem;
        border-radius: 9999px;
        border-bottom-width: 6px;
      }
    }
    .lit {
      background: #ef4444;
      border-color: #fca5a5;
      box-shadow: 0 0 18px #ef4444;
    }
    .go {
      animation: go 0.9s ease-out forwards;
      text-shadow: 0 0 24px rgb(52 211 153 / 0.6);
    }
    @keyframes go {
      0% {
        opacity: 0;
        transform: scale(0.6);
      }
      20% {
        opacity: 1;
        transform: scale(1.1);
      }
      70% {
        opacity: 1;
        transform: scale(1);
      }
      100% {
        opacity: 0;
        transform: scale(1.3);
      }
    }
    .start-button,
    .demo-button {
      border-radius: 9999px;
      padding: 0.5rem 1.25rem;
      font-weight: 600;
      transition: background-color 150ms;
    }
    .start-button {
      background: var(--primary);
      color: var(--primary-foreground);
    }
    .start-button:hover {
      background: color-mix(in oklab, var(--primary) 85%, white);
    }
    .demo-button {
      border: 1px solid var(--border);
      color: var(--muted-foreground);
    }
    .demo-button:hover {
      background: var(--accent);
      color: var(--accent-foreground);
    }
  `,
})
export default class Day02Loop {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly hudElement = viewChild.required<ElementRef<HTMLElement>>('header');
  private readonly pads = viewChildren<ElementRef<HTMLButtonElement>>('pad');

  protected readonly keys = KEYS;
  protected readonly players = [0, 1] as const;
  protected readonly names = PLAYER_NAMES;
  protected readonly looks = PLAYER_LOOKS;
  protected readonly laps = LAPS;
  protected readonly min = Math.min;

  private readonly track = new Track(FIGURE_EIGHT);
  private readonly race = new Race(this.track.length);
  private scene?: Scene;
  private fit = fitBox(this.track.box, 1, 1, 0);
  private wires: [Wire | null, Wire | null] = [null, null];
  private pulses: Pulse[] = [];
  private frame = 0;
  private last = 0;
  private goUntil = 0;
  /** Prochaine pression de chaque robot (temps de course) et sa cadence, en mode démo. */
  private bots: [number, number] = [0, 0];
  private botIntervals: [number, number] = [0.1, 0.1];

  protected readonly phase = signal(this.race.phase);
  protected readonly lights = signal(0);
  protected readonly go = signal(false);
  protected readonly winner = signal<0 | 1>(0);
  protected readonly demo = signal(false);
  protected readonly pressed = signal<[boolean, boolean]>([false, false]);
  protected readonly hud = signal<Hud>({
    elapsed: '0:00.00',
    players: [EMPTY_PLAYER, EMPTY_PLAYER],
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.scene = new Scene(this.canvas().nativeElement);
      const element = this.host.nativeElement;
      const observer = new ResizeObserver(() => this.layout());
      observer.observe(element);
      this.layout();
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });
  }

  /** Mesure l'écran et les manettes, recalcule la projection du circuit et redessine. */
  private layout(): void {
    const element = this.host.nativeElement;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height || !this.scene) return;
    this.scene.resize(width, height);

    // Le circuit occupe l'espace entre le HUD (en haut) et le haut des manettes (en bas).
    const hostRect = element.getBoundingClientRect();
    const rects = this.pads().map((pad) => pad.nativeElement.getBoundingClientRect());
    const padTop = rects.length ? Math.min(...rects.map((r) => r.top)) - hostRect.top : height;
    const hudHeight = this.hudElement().nativeElement.getBoundingClientRect().height;
    const area = { width, height: Math.max(80, padTop - hudHeight) };
    const fit = fitBox(this.track.box, area.width, area.height, PADDING);
    this.fit = { ...fit, ty: fit.ty + hudHeight };

    this.wires = [0, 1].map((i) => {
      const r = rects[i];
      if (!r) return null;
      return {
        from: plugPosition(this.track, this.fit, i as 0 | 1),
        to: { x: r.left + r.width / 2 - hostRect.left, y: r.top - hostRect.top + 2 },
      };
    }) as [Wire | null, Wire | null];

    this.draw();
  }

  protected start(demo: boolean): void {
    this.demo.set(demo);
    this.race.start();
    this.bots = [COUNTDOWN, COUNTDOWN];
    this.botIntervals = [0, 1].map(
      () => BOT_MIN_INTERVAL + Math.random() * (BOT_MAX_INTERVAL - BOT_MIN_INTERVAL),
    ) as [number, number];
    this.goUntil = 0;
    this.pulses = [];
    this.syncState();
    this.run();
  }

  protected press(player: 0 | 1, event?: Event): void {
    event?.preventDefault();
    if (this.pressed()[player]) return;
    this.pressed.update((p) => (player ? [p[0], true] : [true, p[1]]));
    this.pulse(player);
    if (this.race.phase === 'idle') this.start(false);
    this.run();
  }

  protected release(player: 0 | 1): void {
    if (!this.pressed()[player]) return;
    this.pressed.update((p) => (player ? [p[0], false] : [false, p[1]]));
    this.run();
  }

  protected releaseAll(): void {
    this.pressed.set([false, false]);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const player = this.playerFor(event.key);
    if (player === null) return;
    event.preventDefault();
    this.press(player);
  }

  protected onKeyup(event: KeyboardEvent): void {
    const player = this.playerFor(event.key);
    if (player !== null) this.release(player);
  }

  private playerFor(key: string): 0 | 1 | null {
    const index = KEYS.indexOf(key.toLowerCase() as (typeof KEYS)[number]);
    return index === -1 ? null : (index as 0 | 1);
  }

  /**
   * Une impulsion part de la manette vers la piste ; la voiture accélère si la course est lancée.
   * En démo, les robots pilotent : une pression humaine ne fait que courir dans le fil.
   */
  private pulse(player: 0 | 1): void {
    this.pulses.push({ player, t: 0 });
    if (!this.demo()) this.race.press(player);
  }

  private run(): void {
    if (this.frame) return;
    this.last = 0;
    const tick = (now: number) => {
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
      this.last = now;
      this.step(dt);
      this.draw();
      this.frame = this.animating() ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Vrai tant qu'il y a quelque chose à animer : course en cours, voiture qui glisse, impulsion sur un fil. */
  private animating(): boolean {
    const { phase, players } = this.race;
    return (
      phase === 'countdown' ||
      phase === 'racing' ||
      players.some((p) => p.speed > 0) ||
      this.pulses.length > 0 ||
      this.go()
    );
  }

  private step(dt: number): void {
    const wasCountdown = this.race.phase === 'countdown';
    if (this.demo() && this.race.phase === 'racing') this.runBots();
    this.race.update(dt);
    if (wasCountdown && this.race.phase === 'racing') this.goUntil = this.race.elapsed + GO_SECONDS;

    for (const pulse of this.pulses) pulse.t += dt / PULSE_DURATION;
    this.pulses = this.pulses.filter((p) => p.t < 1);

    this.syncState();
  }

  private runBots(): void {
    const now = this.race.elapsed;
    for (const i of [0, 1] as const) {
      if (now < this.bots[i]) continue;
      // Le robot « appuie » : l'impulsion part dans le fil, la manette s'enfonce un instant.
      this.race.press(i);
      this.pulses.push({ player: i, t: 0 });
      this.pressed.update((p) => (i ? [p[0], true] : [true, p[1]]));
      setTimeout(() => this.release(i), 60);
      this.bots[i] = now + this.botIntervals[i] * (0.6 + Math.random() * 0.8);
    }
  }

  /** Recopie l'état de la course dans les signaux lus par le template. */
  private syncState(): void {
    const { race } = this;
    this.phase.set(race.phase);
    this.lights.set(race.lights);
    this.go.set(race.phase === 'racing' && race.elapsed < this.goUntil);
    if (race.winner !== null) this.winner.set(race.winner as 0 | 1);
    this.hud.set({
      elapsed: formatTime(
        race.phase === 'finished' ? race.players[race.winner!].finishedAt! : race.elapsed,
      ),
      players: [0, 1].map((i) => {
        const p = race.players[i];
        const last = p.lapTimes.at(-1);
        const best = race.bestLap(i as 0 | 1);
        return {
          laps: p.laps,
          // Une fois arrivé : son temps total, à la place du tour en cours.
          current: formatTime(p.finishedAt ?? race.currentLap(i as 0 | 1)),
          last: last === undefined ? null : formatTime(last),
          best: best === null ? null : formatTime(best),
          finished: p.finishedAt !== null,
        };
      }) as [PlayerHud, PlayerHud],
    });
  }

  private draw(): void {
    this.scene?.draw({
      track: this.track,
      fit: this.fit,
      distances: [this.race.players[0].distance, this.race.players[1].distance],
      wires: this.wires,
      pulses: this.pulses,
      pressed: this.pressed(),
    });
  }
}
