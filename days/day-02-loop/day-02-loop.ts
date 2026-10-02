import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { LINO } from './lib/floor';
import { LAPS, Race, formatTime } from './lib/race';
import { TILT, circuitBounds } from './lib/road';
import {
  Circuit,
  PLAYER_LOOKS,
  PULSE_DURATION,
  Pulse,
  Scene,
  Wire,
  plugPosition,
} from './lib/scene';
import { Fit, Track, figureEight, fitBox } from './lib/track';

/** Touche de chaque joueur (`event.key`, insensible à la casse) : Z à gauche du clavier, O à droite. */
const KEYS = ['z', 'o'] as const;
/** Touche qui lance la démo (deux robots font la course). */
const DEMO_KEY = 't';
const PLAYER_NAMES = ['Joueur 1', 'Joueur 2'] as const;
/** Marge (pixels) entre le circuit et les bords de la zone qui lui est laissée. */
const PADDING = 10;
/** Part de la hauteur du HUD dont le circuit remonte sous lui. */
const RISE = 0.3;
/** Le bas de la zone du circuit (sa marge de décor) mord de tant de pixels sur le couloir des fils. */
const WIRE_OVERLAP = 30;
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
  last: string;
  best: string;
  finished: boolean;
}

interface Hud {
  elapsed: string;
  players: [PlayerHud, PlayerHud];
}

/** Taille de la scène, toujours en paysage : sur un écran tactile tenu en portrait, elle est tournée. */
interface Stage {
  width: number;
  height: number;
  rotated: boolean;
}

/** Temps pas encore connu : même largeur qu'un vrai temps en police mono, la carte ne bouge pas. */
const NO_TIME = '-:--.--';

const EMPTY_PLAYER: PlayerHud = {
  laps: 0,
  current: '0:00.00',
  last: NO_TIME,
  best: NO_TIME,
  finished: false,
};

function buildCircuit(): Circuit {
  const eight = figureEight();
  const track = new Track(eight.points);
  return {
    track,
    loops: eight.loops,
    bridge: { center: eight.crossings[1], flat: 45, ramp: 95 },
  };
}

@Component({
  selector: 'app-day-02-loop',
  host: {
    class: 'relative block size-full touch-none select-none overflow-hidden',
    '[style.background]': 'lino',
    '(document:keydown)': 'onKeydown($event)',
    '(document:keyup)': 'onKeyup($event)',
    '(window:blur)': 'releaseAll()',
  },
  imports: [NgTemplateOutlet],
  template: `
    <!-- Le bouton de départ : une touche penchée, en vitesse, avec damier, traînées et reflet qui file. -->
    <ng-template #startButton let-label>
      <button
        type="button"
        class="start-button pointer-events-auto font-display"
        (click)="start(demo())"
      >
        <span class="streaks" aria-hidden="true"></span>
        <span class="label">{{ label }}</span>
        <span class="chevrons" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="checker" aria-hidden="true"></span>
      </button>
    </ng-template>

    <div
      class="absolute top-1/2 left-1/2 overflow-hidden [container-type:size]"
      [style.width.px]="stage().width"
      [style.height.px]="stage().height"
      [style.transform]="
        stage().rotated ? 'translate(-50%, -50%) rotate(90deg)' : 'translate(-50%, -50%)'
      "
    >
      <canvas #canvas aria-hidden="true" class="absolute inset-0 size-full"></canvas>

      <!-- En haut : tours et chronos de chaque joueur de part et d'autre, chrono de course au milieu. -->
      <header
        #header
        class="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 p-[clamp(0.4rem,min(2.2cqh,1.4cqw),1rem)]"
      >
        @for (p of hud().players; track $index; let i = $index) {
          <section
            class="hud-card flex min-w-0 flex-col rounded-xl bg-white/90 px-[clamp(0.5rem,min(2.4cqh,1.6cqw),1rem)] py-[clamp(0.25rem,1.5cqh,0.6rem)] text-[#24213f]"
            [class.items-end]="i === 1"
            [class.justify-self-start]="i === 0"
            [class.justify-self-end]="i === 1"
            [class.order-last]="i === 1"
            [class.text-right]="i === 1"
            [style.border-color]="looks[i].color"
            [class.border-l-4]="i === 0"
            [class.border-r-4]="i === 1"
            [attr.aria-label]="names[i]"
          >
            <p
              class="text-[length:clamp(0.55rem,min(2.1cqh,1.4cqw),0.75rem)] font-bold tracking-wide uppercase"
              [style.color]="looks[i].color"
            >
              {{ names[i] }}
            </p>
            <p
              class="font-display text-[length:clamp(0.95rem,min(5.2cqh,3.6cqw),1.85rem)] leading-tight font-bold"
            >
              @if (p.finished) {
                Arrivé
              } @else {
                Tour <span class="tabular-nums">{{ min(p.laps + 1, laps) }}</span
                ><span class="opacity-40">/{{ laps }}</span>
              }
            </p>
            <p class="font-mono text-[length:clamp(0.7rem,min(3.1cqh,2.1cqw),1.1rem)] tabular-nums">
              {{ p.current }}
            </p>
            <p
              class="font-mono text-[length:clamp(0.5rem,min(1.9cqh,1.3cqw),0.7rem)] whitespace-nowrap tabular-nums opacity-60"
            >
              dernier {{ p.last }} · meilleur {{ p.best }}
            </p>
          </section>
        }
        <div
          class="hud-card flex flex-col items-center rounded-xl bg-[#24213f]/90 px-[clamp(0.6rem,min(3cqh,2cqw),1.25rem)] py-[clamp(0.25rem,1.5cqh,0.6rem)] text-white"
        >
          <p
            class="text-[length:clamp(0.55rem,min(2.1cqh,1.4cqw),0.75rem)] font-bold tracking-wide uppercase opacity-60"
          >
            Course
          </p>
          <p
            class="font-mono text-[length:clamp(1.1rem,min(6.4cqh,4.4cqw),2.4rem)] leading-tight font-semibold tabular-nums"
          >
            {{ hud().elapsed }}
          </p>
        </div>
      </header>

      <!-- Feux de départ, GO, écran d'accueil et résultats, par-dessus le circuit. -->
      <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
        @switch (phase()) {
          @case ('idle') {
            <ng-container *ngTemplateOutlet="startButton; context: { $implicit: 'Départ' }" />
          }
          @case ('countdown') {
            <div
              class="flex gap-[clamp(0.5rem,3cqh,1rem)] rounded-full bg-[#24213f]/90 px-[clamp(1rem,4cqh,1.5rem)] py-[clamp(0.5rem,2.5cqh,1rem)] shadow-xl"
              role="status"
              aria-live="assertive"
            >
              @for (n of [1, 2, 3]; track n) {
                <span
                  class="size-[clamp(1.5rem,8cqh,2.5rem)] rounded-full border-2 border-red-900/60 bg-red-950/60 transition-colors duration-150"
                  [class.lit]="lights() >= n"
                ></span>
              }
            </div>
          }
          @case ('racing') {
            @if (go()) {
              <p
                class="go font-display text-[length:clamp(3rem,22cqh,6rem)] font-extrabold text-emerald-500"
                role="status"
              >
                GO
              </p>
            }
          }
          @case ('finished') {
            <div class="panel pointer-events-auto">
              <p class="text-xs font-semibold tracking-wide uppercase opacity-60">Vainqueur</p>
              <p
                class="font-display text-[length:clamp(1.4rem,7cqh,1.9rem)] font-bold"
                [style.color]="looks[winner()].glow"
              >
                {{ names[winner()] }}
              </p>
              <p class="font-mono tabular-nums text-center">
                <span class="text-3xl">{{ hud().elapsed }}</span><br>
                meilleur tour {{ hud().players[winner()].best }}
              </p>
              <ng-container *ngTemplateOutlet="startButton; context: { $implicit: 'Rejouer' }" />
            </div>
          }
        }
      </div>

      <!-- Les deux manettes : des touches de clavier à la souris, de gros boutons au doigt. -->
      @for (i of players; track i) {
        <button
          #pad
          type="button"
          class="pad absolute z-20"
          [class]="i === 0 ? 'left-[clamp(1.5rem,8cqw,7rem)]' : 'right-[clamp(1.5rem,8cqw,7rem)]'"
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
          <span class="font-display text-2xl font-bold pointer-coarse:hidden">{{
            keys[i].toUpperCase()
          }}</span>
          <span class="hidden text-lg font-bold pointer-coarse:block">P{{ i + 1 }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .hud-card {
      box-shadow:
        0 1px 0 rgb(0 0 0 / 0.06),
        0 6px 16px rgb(90 64 30 / 0.2);
    }
    .panel {
      display: flex;
      max-width: min(24rem, 80cqw);
      flex-direction: column;
      align-items: center;
      gap: clamp(0.4rem, 2.5cqh, 1rem);
      border-radius: 1rem;
      padding: clamp(0.75rem, 4cqh, 1.5rem);
      text-align: center;
      color: #fff;
      background: rgb(36 33 63 / 0.92);
      box-shadow: 0 12px 32px rgb(60 40 20 / 0.35);
    }
    .pad {
      bottom: clamp(1rem, 5cqh, 2.5rem);
      display: grid;
      place-items: center;
      width: 3.75rem;
      height: 3.75rem;
      border-radius: 0.9rem;
      color: var(--pad-color);
      background: linear-gradient(180deg, #3a3760, #24213f);
      border: 1px solid #4b4879;
      border-bottom: 6px solid var(--pad-color);
      box-shadow: 0 8px 18px rgb(90 64 30 / 0.35);
      transition:
        transform 60ms,
        border-bottom-width 60ms,
        box-shadow 60ms;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .pad.pressed {
      transform: translateY(4px);
      border-bottom-width: 2px;
      box-shadow:
        0 3px 8px rgb(90 64 30 / 0.35),
        0 0 28px var(--pad-glow);
    }
    @media (pointer: coarse) {
      .pad {
        width: clamp(4rem, 24cqh, 5.5rem);
        height: clamp(4rem, 24cqh, 5.5rem);
        border-radius: 9999px;
      }
    }
    .lit {
      background: #ef4444;
      border-color: #fca5a5;
      box-shadow: 0 0 18px #ef4444;
    }
    .go {
      animation: go 0.9s ease-out forwards;
      text-shadow:
        0 3px 0 #1f5137,
        0 8px 20px rgb(0 0 0 / 0.25);
    }
    @keyframes go {
      0% {
        opacity: 0;
        transform: scale(0.6);
      }
      20%,
      70% {
        opacity: 1;
        transform: scale(1);
      }
      100% {
        opacity: 0;
        transform: scale(1.3);
      }
    }
    .start-button {
      position: relative;
      isolation: isolate;
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      overflow: hidden;
      border-radius: 0.5rem;
      padding: clamp(0.6rem, 3cqh, 1.1rem) clamp(1.6rem, 8cqh, 3rem) clamp(0.9rem, 4cqh, 1.4rem);
      color: #fff;
      font-size: clamp(1.25rem, 6.5cqh, 2.25rem);
      font-weight: 800;
      font-style: italic;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: linear-gradient(100deg, #e5383b 0%, #ff6a3d 55%, #ffb02e 100%);
      box-shadow:
        0 6px 0 #8f1d20,
        0 14px 30px rgb(229 56 59 / 0.45);
      transform: skewX(-12deg);
      transition:
        transform 120ms,
        box-shadow 120ms,
        filter 120ms;
      animation: rev 1.6s ease-in-out infinite;
      cursor: pointer;
    }
    .start-button > .label {
      display: inline-block;
      transform: skewX(12deg);
      text-shadow: 0 2px 0 rgb(0 0 0 / 0.28);
    }
    .start-button:hover {
      transform: skewX(-12deg) scale(1.06);
      filter: brightness(1.1);
    }
    .start-button:active {
      transform: skewX(-12deg) translateY(4px);
      box-shadow:
        0 2px 0 #8f1d20,
        0 6px 14px rgb(229 56 59 / 0.45);
    }
    .start-button:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 4px;
    }
    /* Traînées de vitesse qui défilent de droite à gauche, et reflet qui balaie le bouton. */
    .streaks {
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(105deg, transparent 40%, rgb(255 255 255 / 0.45) 50%, transparent 60%) 0 0 / 60% 100%
          no-repeat,
        repeating-linear-gradient(
          90deg,
          transparent 0 22px,
          rgb(255 255 255 / 0.2) 22px 24px,
          transparent 24px 46px,
          rgb(255 255 255 / 0.12) 46px 47px,
          transparent 47px 78px
        );
      animation:
        streaks 0.45s linear infinite,
        sweep 2.2s ease-in-out infinite;
    }
    .chevrons {
      display: inline-flex;
      transform: skewX(12deg);
    }
    .chevrons i {
      width: 0.55em;
      height: 0.9em;
      margin-left: -0.12em;
      background: #fff;
      clip-path: polygon(0 0, 45% 0, 100% 50%, 45% 100%, 0 100%, 55% 50%);
      animation: chevron 0.9s ease-in-out infinite;
    }
    .chevrons i:nth-child(2) {
      animation-delay: 0.15s;
    }
    .chevrons i:nth-child(3) {
      animation-delay: 0.3s;
    }
    /* Damier d'arrivée qui roule le long du bord bas. */
    .checker {
      position: absolute;
      inset: auto 0 0;
      height: 0.5rem;
      background: conic-gradient(#fff 25%, #15151a 0 50%, #fff 0 75%, #15151a 0) 0 0 / 1rem 1rem;
      animation: checker 0.6s linear infinite;
    }
    @keyframes streaks {
      to {
        background-position:
          0 0,
          -78px 0;
      }
    }
    @keyframes sweep {
      0% {
        background-position:
          -80% 0,
          0 0;
      }
      60%,
      100% {
        background-position:
          180% 0,
          0 0;
      }
    }
    @keyframes chevron {
      0%,
      100% {
        opacity: 0.25;
      }
      40% {
        opacity: 1;
      }
    }
    @keyframes checker {
      to {
        background-position: -2rem 0;
      }
    }
    @keyframes rev {
      0%,
      100% {
        box-shadow:
          0 6px 0 #8f1d20,
          0 14px 30px rgb(229 56 59 / 0.35);
      }
      50% {
        box-shadow:
          0 6px 0 #8f1d20,
          0 14px 44px rgb(255 140 50 / 0.7);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .start-button,
      .streaks,
      .chevrons i,
      .checker {
        animation: none;
      }
    }
  `,
})
export default class Day02Loop {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');
  private readonly pads = viewChildren<ElementRef<HTMLButtonElement>>('pad');

  protected readonly lino = LINO;
  protected readonly keys = KEYS;
  protected readonly players = [0, 1] as const;
  protected readonly names = PLAYER_NAMES;
  protected readonly looks = PLAYER_LOOKS;
  protected readonly laps = LAPS;
  protected readonly min = Math.min;

  /** Écran tactile : gros boutons, scène tournée en paysage, plein écran au départ. */
  private readonly touch = matchMedia('(pointer: coarse)').matches;
  private readonly circuit = buildCircuit();
  /** Le circuit, ses glissières et le décor collé à ses bords : ce qui doit tenir à l'écran. */
  private readonly bounds = circuitBounds(this.circuit.track);
  private readonly race = new Race(this.circuit.track.length);
  private scene?: Scene;
  private pulses: Pulse[] = [];
  private frame = 0;
  private last = 0;
  private goUntil = 0;
  /** Prochaine pression de chaque robot (temps de course) et sa cadence, en mode démo. */
  private bots: [number, number] = [0, 0];
  private botIntervals: [number, number] = [0.1, 0.1];

  protected readonly stage = signal<Stage>({ width: 0, height: 0, rotated: false });
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
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(element);
      // Les polices (HUD, banderole START) changent les tailles une fois chargées.
      void document.fonts?.ready.then(() => this.layout());
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });
    // La scène a pris sa nouvelle taille dans le DOM : on peut mesurer HUD et manettes.
    afterRenderEffect(() => {
      this.stage();
      untracked(() => this.layout());
    });
  }

  /** Taille disponible ; en portrait sur un écran tactile, la scène est tournée d'un quart de tour. */
  private measure(): void {
    const width = this.host.nativeElement.clientWidth;
    const height = this.host.nativeElement.clientHeight;
    const rotated = this.touch && height > width;
    this.stage.set(
      rotated ? { width: height, height: width, rotated } : { width, height, rotated },
    );
  }

  /**
   * Place le circuit sous le HUD et au-dessus du couloir des fils, puis tire les fils du bornier
   * jusqu'aux manettes (sans jamais croiser la piste) et redessine.
   */
  private layout(): void {
    const { width, height } = this.stage();
    if (!width || !height || !this.scene) return;
    // Mesures dans le repère de la scène (offset*), insensibles à sa rotation.
    const top = this.header().nativeElement.offsetHeight;
    const pads = this.pads().map((p) => p.nativeElement);

    // Le circuit tient au-dessus du couloir où courent les fils, à hauteur des manettes. Il remonte un
    // peu sous le HUD : les cartes ne couvrent que les coins du décor.
    const lane = Math.min(height, ...pads.map((p) => p.offsetTop + p.offsetHeight / 2));
    const rise = top * RISE;
    const box = fitBox(this.bounds, width, Math.max(1, lane - top + WIRE_OVERLAP), PADDING, TILT);
    const fit: Fit = { ...box, ty: box.ty + top - rise };

    // Chaque fil entre dans sa manette par le côté tourné vers le centre.
    const wires = pads.map((pad, i): Wire => ({
      from: plugPosition(fit, i as 0 | 1),
      to: {
        x: i === 0 ? pad.offsetLeft + pad.offsetWidth - 6 : pad.offsetLeft + 6,
        y: pad.offsetTop + pad.offsetHeight / 2,
      },
    }));
    this.scene.layout(width, height, this.circuit, fit, [wires[0] ?? null, wires[1] ?? null]);
    this.draw();
  }

  protected start(demo: boolean): void {
    if (!demo) this.enterFullscreen();
    this.demo.set(demo);
    this.race.start();
    // Temps de réaction au feu vert (le chrono de course part de 0 au vert).
    this.bots = [0.15 + Math.random() * 0.25, 0.15 + Math.random() * 0.25];
    this.botIntervals = [0, 1].map(
      () => BOT_MIN_INTERVAL + Math.random() * (BOT_MAX_INTERVAL - BOT_MIN_INTERVAL),
    ) as [number, number];
    this.goUntil = 0;
    this.pulses = [];
    this.syncState();
    this.run();
  }

  /**
   * Sur mobile, la partie se joue en plein écran et en paysage. Le verrouillage de l'orientation
   * n'existe pas partout (iPhone) : la scène tournée prend alors le relais.
   */
  private enterFullscreen(): void {
    if (!this.touch || document.fullscreenElement) return;
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    this.host.nativeElement
      .requestFullscreen?.({ navigationUI: 'hide' })
      ?.then(() => orientation?.lock?.('landscape'))
      .catch(() => undefined);
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
    if (event.key.toLowerCase() === DEMO_KEY) {
      // La démo se lance au clavier, tant qu'aucune course n'est en cours.
      if (this.race.phase === 'idle' || this.race.phase === 'finished') this.start(true);
      return;
    }
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
          last: last === undefined ? NO_TIME : formatTime(last),
          best: best === null ? NO_TIME : formatTime(best),
          finished: p.finishedAt !== null,
        };
      }) as [PlayerHud, PlayerHud],
    });
  }

  private draw(): void {
    this.scene?.draw({
      distances: [this.race.players[0].distance, this.race.players[1].distance],
      pulses: this.pulses,
      pressed: this.pressed(),
    });
  }
}
