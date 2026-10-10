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
import { MODELS, OrigamiModel } from './lib/models';
import { PATTERNS, Pattern, swatch } from './lib/patterns';
import { DECORS, paintBackdrop } from './lib/photo';
import { PhotoStudio } from './lib/photo-studio';
import type { FoldState, OrigamiScene } from './lib/scene';
import { UI_STYLES } from './lib/ui';

/** Les pictogrammes des modèles (24 × 24, trait). */
const ICONS: Record<string, string> = {
  chien: 'M4 5h16l-4 13H8L4 5Zm0 0 2 7m14-7-2 7M9.5 9.5h.01M14.5 9.5h.01M12 13l-1.5 2h3L12 13Z',
  gobelet: 'M5 6h14l-2.5 13h-9L5 6Zm0 0 7 4 7-4M8 10.5h8',
  coeur: 'M12 20 4.5 12.2A4.3 4.3 0 0 1 12 6.6a4.3 4.3 0 0 1 7.5 5.6L12 20Zm0-13.4V20',
  avion: 'M3 12 21 4l-5 16-4.5-6.5L3 12Zm8.5 1.5L21 4',
  kabuto: 'M4 18h16L12 8 4 18Zm8-10L7 3m5 5 5-5M7 14h10',
};

/** Ce que demande l'étape, en deux mots (le badge du panneau). */
const KIND: Record<string, string> = {
  valley: 'Pli vallée',
  mountain: 'Pli montagne · vers l’arrière',
  crease: 'Pli de repère',
  flip: 'Retourne',
  bend: 'Mise en forme',
};

/**
 * Jour 10 : Fold. Cinq origamis à plier pas à pas, en 3D : une flèche montre le pli, on le fait au
 * doigt (ou à la souris) en faisant glisser la feuille, le pli se marque, et on passe au suivant jusqu'au
 * modèle fini. On choisit son papier parmi six motifs japonais.
 */
@Component({
  selector: 'app-day-10-fold',
  imports: [PhotoStudio],
  host: {
    class: 'relative block size-full overflow-hidden select-none bg-night-floor text-white',
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    <!-- Le fond (peint en 2D, le même que sur les photos) et la scène 3D, filtrés ensemble en mode photo. -->
    <div #stage class="absolute inset-0">
      <canvas #backdrop class="absolute inset-0 size-full" aria-hidden="true"></canvas>
      <canvas
        #canvas
        class="absolute inset-0 size-full touch-none"
        [class.cursor-grab]="!state().done && !state().dragging"
        [class.cursor-grabbing]="state().dragging"
        role="img"
        [attr.aria-label]="
          'Une feuille de papier sur un tapis de découpe : ' +
          model().name +
          ', étape ' +
          stepLabel()
        "
      ></canvas>
    </div>

    @if (failed()) {
      <p class="absolute inset-0 grid place-items-center p-8 text-center text-white/80">
        Ce navigateur ne sait pas afficher la 3D (WebGL) : impossible de plier la feuille, désolée.
      </p>
    }

    <header
      #top
      class="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-3"
      [class.hidden]="photo()"
    >
      <nav
        class="panel pointer-events-auto flex max-w-full gap-1 overflow-x-auto p-1 [scrollbar-width:none]"
        aria-label="Modèles"
      >
        @for (m of models; track m.id) {
          <button
            type="button"
            class="model"
            [class.on]="m === model()"
            [attr.aria-pressed]="m === model()"
            [title]="m.name + ' · ' + m.steps.length + ' étapes'"
            (click)="choose(m)"
          >
            <svg viewBox="0 0 24 24" class="size-5 shrink-0" aria-hidden="true">
              <path [attr.d]="icon(m)" />
            </svg>
            <span class="flex flex-col items-start leading-tight">
              <span class="font-display text-sm font-semibold">{{ m.name }}</span>
              <span class="level" [attr.aria-label]="'difficulté ' + m.level + ' sur 3'">
                @for (i of [1, 2, 3]; track i) {
                  <i [class.full]="i <= m.level"></i>
                }
              </span>
            </span>
          </button>
        }
      </nav>
      <div
        class="panel pointer-events-auto flex items-center gap-1.5 p-1.5"
        role="radiogroup"
        aria-label="Papier"
      >
        @for (p of patterns; track p.id) {
          <button
            type="button"
            role="radio"
            class="swatch"
            [class.on]="p === pattern()"
            [attr.aria-checked]="p === pattern()"
            [attr.aria-label]="p.name"
            [title]="p.name"
            [style.background-color]="p.color"
            [style.background-image]="swatchUrl(p)"
            (click)="setPattern(p)"
          ></button>
        }
        <button
          type="button"
          class="icon-btn"
          [attr.aria-label]="muted() ? 'Activer le son' : 'Couper le son'"
          [title]="muted() ? 'Son coupé' : 'Son'"
          (click)="toggleMute()"
        >
          <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            @if (muted()) {
              <path d="m16 9 5 6m0-6-5 6" />
            } @else {
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            }
          </svg>
        </button>
      </div>
    </header>

    <section
      #bottom
      class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-2 sm:p-3"
      [class.hidden]="photo()"
    >
      <div class="panel pointer-events-auto w-full max-w-xl p-3 sm:p-4" aria-live="polite">
        @if (!state().done) {
          <div class="flex items-center justify-between gap-3 text-xs">
            <span class="text-white/70 tabular-nums"
              >Étape {{ state().index + 1 }} / {{ state().total }}</span
            >
            <span class="badge" [class.mountain]="kind() === 'mountain'">{{ kindLabel() }}</span>
          </div>
          <ol class="progress mt-2" aria-hidden="true">
            @for (s of model().steps; track s.id; let i = $index) {
              <li [class.done]="i < state().index" [class.now]="i === state().index"></li>
            }
          </ol>
          <p
            class="font-display mt-2.5 text-base leading-snug font-semibold text-balance sm:text-lg"
          >
            {{ text() }}
          </p>
          <p class="mt-1 text-xs text-white/60">
            Fais glisser la feuille dans le sens de la flèche, ou laisse-moi te montrer.
          </p>
          <div class="mt-3 flex items-center gap-2">
            <button
              type="button"
              class="btn ghost"
              [disabled]="state().index === 0 || state().busy"
              (click)="undo()"
            >
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
              Annuler
            </button>
            <button
              type="button"
              class="btn ghost"
              [disabled]="state().index === 0 || state().busy"
              (click)="restart()"
              title="Recommencer"
            >
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
              </svg>
              <span class="sr-only sm:not-sr-only">Recommencer</span>
            </button>
            <button
              type="button"
              class="btn primary ml-auto"
              [disabled]="state().busy"
              (click)="play()"
            >
              Montre-moi
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M7 5v14l11-7L7 5Z" />
              </svg>
            </button>
          </div>
        } @else {
          <p class="font-display text-2xl font-extrabold">
            Yatta ! <span class="text-sakura">{{ capitalize(model().the) }}</span> est plié.
          </p>
          <p class="mt-1 text-sm text-white/70">
            Fais-le tourner du doigt, prends-le en photo, ou attaque le modèle suivant.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" class="btn ghost" (click)="undo()" title="Annuler le dernier pli">
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
              <span class="sr-only sm:not-sr-only">Annuler</span>
            </button>
            <button type="button" class="btn ghost" (click)="restart()" title="Replier">
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
              </svg>
              <span class="sr-only sm:not-sr-only">Replier</span>
            </button>
            <button type="button" class="btn ghost ml-auto" (click)="next()">
              {{ nextModel().name }}
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
            <button type="button" class="btn primary" (click)="photo.set(true)">
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </svg>
              Mode photo
            </button>
          </div>
        }
      </div>
    </section>

    @if (photo() && sceneRef(); as scene) {
      <app-fold-photo
        [scene]="scene"
        [stage]="stageEl()"
        [backdrop]="backdropEl()"
        [model]="model()"
        [pattern]="pattern()"
        [patterns]="patterns"
        [swatchUrl]="swatchFn"
        (patternChange)="setPattern($event)"
        (exit)="photo.set(false)"
      />
    }
  `,
  styles: [
    UI_STYLES,
    `
      .model {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.45rem;
        border-radius: 0.7rem;
        padding: 0.35rem 0.6rem 0.35rem 0.45rem;
        color: rgb(255 255 255 / 0.75);
        transition:
          background-color 0.15s,
          color 0.15s;
      }
      .model:hover {
        background: rgb(255 255 255 / 0.08);
        color: #fff;
      }
      .model.on {
        background: var(--color-sakura);
        color: #1b1240;
      }
      .model svg path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .level {
        display: flex;
        gap: 2px;
        margin-top: 2px;
      }
      .level i {
        width: 5px;
        height: 5px;
        border-radius: 99px;
        background: currentColor;
        opacity: 0.25;
      }
      .level i.full {
        opacity: 0.9;
      }
      .badge {
        border-radius: 99px;
        padding: 0.15rem 0.6rem;
        background: rgb(255 126 182 / 0.16);
        color: #ff9ec8;
        font-weight: 700;
        white-space: nowrap;
      }
      .badge.mountain {
        background: rgb(255 179 92 / 0.16);
        color: #ffc27e;
      }
      .progress {
        display: flex;
        gap: 3px;
      }
      .progress li {
        flex: 1;
        height: 4px;
        border-radius: 99px;
        background: rgb(255 255 255 / 0.14);
        transition: background-color 0.3s;
      }
      .progress li.done {
        background: var(--color-sakura);
      }
      .progress li.now {
        background: rgb(255 202 236 / 0.45);
      }
    `,
  ],
})
export default class Day10Fold {
  protected readonly models = MODELS;
  protected readonly patterns = PATTERNS;
  protected readonly model = signal<OrigamiModel>(MODELS[0]);
  protected readonly pattern = signal<Pattern>(PATTERNS[1]);
  protected readonly muted = signal(false);
  protected readonly failed = signal(false);
  protected readonly photo = signal(false);
  protected readonly sceneRef = signal<OrigamiScene | null>(null);
  protected readonly state = signal<FoldState>({
    index: 0,
    total: MODELS[0].steps.length,
    busy: false,
    dragging: false,
    done: false,
  });

  protected readonly step = computed(() => this.model().steps[this.state().index]);
  protected readonly text = computed(() => this.step()?.text ?? '');
  protected readonly stepLabel = computed(
    () => `${this.state().index + 1} sur ${this.state().total}`,
  );
  protected readonly kind = computed(() => {
    const s = this.step();
    if (!s) return 'valley';
    if (s.kind !== 'fold') return s.kind;
    if (s.crease) return 'crease';
    return s.folds[0].mountain ? 'mountain' : 'valley';
  });
  protected readonly kindLabel = computed(() => KIND[this.kind()]);
  protected readonly nextModel = computed(
    () => MODELS[(MODELS.indexOf(this.model()) + 1) % MODELS.length],
  );

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLCanvasElement>>('backdrop');
  protected readonly stageEl = computed(() => this.stage().nativeElement);
  protected readonly backdropEl = computed(() => this.backdrop().nativeElement);
  protected readonly swatchFn = (p: Pattern) => this.swatchUrl(p);
  private readonly top = viewChild.required<ElementRef<HTMLElement>>('top');
  private readonly bottom = viewChild.required<ElementRef<HTMLElement>>('bottom');
  private scene: OrigamiScene | null = null;
  private readonly swatches = new Map<string, string>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(async () => {
      try {
        // three.js ne se charge qu'ici, avec le jour 10.
        const { OrigamiScene } = await import('./lib/scene');
        if (destroyRef.destroyed) return;
        const scene = new OrigamiScene(this.canvas().nativeElement, (s) => this.state.set(s));
        this.scene = scene;
        this.sceneRef.set(scene);
        scene.load(this.model(), this.pattern());
        destroyRef.onDestroy(() => scene.dispose());

        // On cadre le modèle entre la barre du haut et le panneau du bas, quelle que soit leur hauteur.
        // (En mode photo, c'est le studio qui s'en charge.)
        const insets = () => {
          if (this.photo()) return;
          paintBackdrop(this.backdrop().nativeElement, DECORS[0]);
          const host = this.canvas().nativeElement.getBoundingClientRect();
          const top = this.top().nativeElement.getBoundingClientRect();
          const bottom = this.bottom()
            .nativeElement.querySelector('.panel')!
            .getBoundingClientRect();
          scene.setInsets(
            Math.max(0, top.bottom - host.top),
            Math.max(0, host.bottom - bottom.top + 8),
          );
        };
        const observer = new ResizeObserver(insets);
        observer.observe(this.top().nativeElement);
        observer.observe(this.bottom().nativeElement);
        observer.observe(this.canvas().nativeElement);
        destroyRef.onDestroy(() => observer.disconnect());
        insets();
      } catch (e) {
        console.error(e);
        this.failed.set(true);
      }
    });
  }

  protected icon(m: OrigamiModel) {
    return ICONS[m.id];
  }

  protected swatchUrl(p: Pattern) {
    let url = this.swatches.get(p.id);
    if (!url) {
      url = `url(${swatch(p)})`;
      this.swatches.set(p.id, url);
    }
    return url;
  }

  protected capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  protected choose(m: OrigamiModel) {
    this.model.set(m);
    this.scene?.load(m, this.pattern());
  }

  protected setPattern(p: Pattern) {
    this.pattern.set(p);
    this.scene?.setPattern(p);
  }

  protected toggleMute() {
    this.muted.update((m) => !m);
    this.scene?.setMuted(this.muted());
  }

  protected play() {
    this.scene?.sound.unlock();
    this.scene?.play();
  }

  protected undo() {
    this.scene?.undo();
  }

  protected restart() {
    this.scene?.restart();
  }

  protected next() {
    this.choose(this.nextModel());
  }

  /** Espace : montre-moi ; Retour arrière : annuler ; T : la démonstration (kabuto, papier seigaiha). */
  protected onKey(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || this.photo()) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && event.key !== 't')
      return;
    if (event.key === 't' || event.key === 'T') {
      const kabuto = MODELS.find((m) => m.id === 'kabuto')!;
      this.pattern.set(PATTERNS.find((p) => p.id === 'seigaiha')!);
      this.choose(kabuto);
      this.scene?.startDemo();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.play();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.undo();
    }
  }
}
