import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { OrigamiModel } from './models';
import { EFFECTS, Effect } from './particles';
import type { Pattern } from './patterns';
import {
  applyFilter,
  canCopyImage,
  canShareFiles,
  copyImage,
  DECORS,
  downloadImage,
  filterCss,
  FILTERS,
  FORMATS,
  frame,
  FRAMES,
  loadPhotoFonts,
  paintBackdrop,
  Rect,
  shareImage,
  toBlob,
} from './photo';
import type { OrigamiScene } from './scene';
import { UI_STYLES } from './ui';

type Tab = 'decor' | 'papier' | 'effet' | 'cadre' | 'format' | 'filtre';

const TABS: readonly { id: Tab; name: string }[] = [
  { id: 'decor', name: 'Décor' },
  { id: 'papier', name: 'Papier' },
  { id: 'effet', name: 'Effet' },
  { id: 'cadre', name: 'Cadre' },
  { id: 'format', name: 'Format' },
  { id: 'filtre', name: 'Filtre' },
];

/** La photo prise : l'image finale et de quoi la partager. */
interface Shot {
  readonly url: string;
  readonly blob: Blob;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Le mode photo, une fois le modèle plié : un viseur au format choisi, un décor, un effet, un cadre avec
 * légende et un filtre, puis le déclencheur. La photo est rendue en haute définition (sans l'interface),
 * encadrée, et proposée au partage, au téléchargement ou à la copie.
 */
@Component({
  selector: 'app-fold-photo',
  host: {
    class: 'pointer-events-none absolute inset-0 z-20 block',
    '(document:keydown.escape)': 'escape()',
  },
  template: `
    <div
      class="finder"
      aria-hidden="true"
      [style.left.px]="finder().x"
      [style.top.px]="finder().y"
      [style.width.px]="finder().w"
      [style.height.px]="finder().h"
    >
      <i class="third v1"></i><i class="third v2"></i><i class="third h1"></i
      ><i class="third h2"></i>
    </div>

    <header
      #top
      class="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2 sm:p-3"
    >
      <button type="button" class="btn ghost panel pointer-events-auto" (click)="exit.emit()">
        <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Terminer
      </button>
      <p class="hint hidden text-xs text-white/70 md:block">
        Glisse pour tourner autour, molette ou pince pour zoomer.
      </p>
      <div class="panel pointer-events-auto flex gap-1 p-1">
        <button
          type="button"
          class="icon-btn"
          [class.on]="frozen()"
          [attr.aria-pressed]="frozen()"
          [title]="frozen() ? 'Relancer l’animation' : 'Figer le modèle'"
          [attr.aria-label]="frozen() ? 'Relancer l’animation' : 'Figer le modèle'"
          (click)="toggleFreeze()"
        >
          <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
            @if (frozen()) {
              <path d="M8 5v14l11-7L8 5Z" />
            } @else {
              <path d="M8 5v14M16 5v14" />
            }
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Recadrer"
          aria-label="Recadrer le modèle"
          (click)="scene().recenter()"
        >
          <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 9v6M9 12h6" />
          </svg>
        </button>
      </div>
    </header>

    <section #bottom class="absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-3">
      <div class="panel pointer-events-auto flex w-full max-w-2xl items-center gap-3 p-2.5 sm:p-3">
        <div class="min-w-0 flex-1">
          <div class="tabs" role="tablist" aria-label="Réglages de la photo">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.on]="tab() === t.id"
                [attr.aria-selected]="tab() === t.id"
                (click)="tab.set(t.id)"
              >
                {{ t.name }}
              </button>
            }
          </div>
          <div class="options" role="tabpanel">
            @switch (tab()) {
              @case ('decor') {
                @for (d of decors; track d.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.on]="d === decor()"
                    (click)="decor.set(d)"
                  >
                    <i class="dot" [style.background]="d.swatch"></i>{{ d.name }}
                  </button>
                }
              }
              @case ('papier') {
                @for (p of patterns(); track p.id) {
                  <button
                    type="button"
                    class="swatch"
                    [class.on]="p === pattern()"
                    [attr.aria-label]="p.name"
                    [title]="p.name"
                    [style.background-color]="p.color"
                    [style.background-image]="swatchUrl()(p)"
                    (click)="patternChange.emit(p)"
                  ></button>
                }
              }
              @case ('effet') {
                @for (e of effects; track e.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.on]="e.id === effect()"
                    (click)="effect.set(e.id)"
                  >
                    {{ e.name }}
                  </button>
                }
              }
              @case ('cadre') {
                @for (f of frames; track f.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.on]="f === frameStyle()"
                    (click)="frameStyle.set(f)"
                  >
                    {{ f.name }}
                  </button>
                }
              }
              @case ('format') {
                @for (f of formats; track f.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.on]="f === format()"
                    (click)="format.set(f)"
                  >
                    <i class="ratio" [style.aspect-ratio]="f.ratio"></i>{{ f.name }}
                  </button>
                }
              }
              @case ('filtre') {
                @for (f of filters; track f.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.on]="f === filter()"
                    (click)="filter.set(f)"
                  >
                    <i
                      class="dot"
                      [style.background-image]="swatchUrl()(pattern())"
                      [style.filter]="css(f)"
                    ></i
                    >{{ f.name }}
                  </button>
                }
              }
            }
          </div>
          @if (tab() === 'cadre' && frameStyle().id !== 'none') {
            <label class="mt-2 flex items-center gap-2 text-xs text-white/70">
              Légende
              <input
                class="caption"
                maxlength="48"
                [value]="caption()"
                (input)="caption.set($any($event.target).value)"
              />
            </label>
          }
        </div>
        <button
          type="button"
          class="shutter"
          [disabled]="busy()"
          aria-label="Prendre la photo"
          title="Prendre la photo"
          (click)="shoot()"
        ></button>
      </div>
    </section>

    @if (flash()) {
      <div class="flash" aria-hidden="true"></div>
    }

    @if (shot(); as s) {
      <div
        class="preview pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Ta photo"
      >
        <div class="panel flex max-h-full w-full max-w-lg flex-col items-center gap-3 p-3 sm:p-4">
          <div class="flex w-full items-center justify-between">
            <p class="font-display text-lg font-bold">Sugoi, quelle photo !</p>
            <button type="button" class="icon-btn" aria-label="Fermer" (click)="close()">
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <img
            class="min-h-0 max-w-full flex-1 rounded-md object-contain shadow-2xl"
            [src]="s.url"
            [attr.width]="s.width"
            [attr.height]="s.height"
            alt="La photo de ton origami"
          />
          <div class="flex w-full flex-wrap items-center justify-center gap-2">
            @if (canShare) {
              <button type="button" class="btn primary" (click)="share(s)">
                <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                  <path d="M12 15V3m0 0L7 8m5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                </svg>
                Partager
              </button>
            }
            <button
              type="button"
              class="btn"
              [class.primary]="!canShare"
              [class.ghost]="canShare"
              (click)="download(s)"
            >
              <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                <path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" />
              </svg>
              Télécharger
            </button>
            @if (canCopy) {
              <button type="button" class="btn ghost" (click)="copy(s)">
                <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
                  <path d="M9 9h10v12H9zM5 15H4V3h11v1" />
                </svg>
                Copier
              </button>
            }
          </div>
          <p class="min-h-4 text-xs text-white/60" aria-live="polite">{{ toast() }}</p>
        </div>
      </div>
    }
  `,
  styles: [
    UI_STYLES,
    `
      .finder {
        position: absolute;
        border-radius: 6px;
        outline: 1px solid rgb(255 255 255 / 0.6);
        box-shadow: 0 0 0 9999px rgb(6 4 26 / 0.58);
        transition:
          left 0.25s,
          top 0.25s,
          width 0.25s,
          height 0.25s;
      }
      .third {
        position: absolute;
        background: rgb(255 255 255 / 0.18);
      }
      .third.v1,
      .third.v2 {
        top: 0;
        bottom: 0;
        width: 1px;
      }
      .third.v1 {
        left: 33.333%;
      }
      .third.v2 {
        left: 66.666%;
      }
      .third.h1,
      .third.h2 {
        left: 0;
        right: 0;
        height: 1px;
      }
      .third.h1 {
        top: 33.333%;
      }
      .third.h2 {
        top: 66.666%;
      }
      .tabs,
      .options {
        display: flex;
        gap: 0.3rem;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .options {
        align-items: center;
        min-height: 2.6rem;
        margin-top: 0.4rem;
        padding: 0.25rem 0.2rem;
      }
      .tab {
        flex-shrink: 0;
        border-radius: 99px;
        padding: 0.2rem 0.65rem;
        font-size: 0.75rem;
        font-weight: 700;
        color: rgb(255 255 255 / 0.6);
      }
      .tab:hover {
        color: #fff;
      }
      .tab.on {
        background: rgb(255 255 255 / 0.12);
        color: #fff;
      }
      .chip {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.4rem;
        border-radius: 99px;
        padding: 0.35rem 0.75rem 0.35rem 0.4rem;
        background: rgb(255 255 255 / 0.08);
        font-size: 0.8rem;
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
      }
      .chip:hover {
        background: rgb(255 255 255 / 0.16);
      }
      .chip.on {
        background: var(--color-sakura);
        color: #1b1240;
      }
      .dot {
        display: inline-block;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 99px;
        background-size: cover;
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.3);
      }
      .ratio {
        display: inline-block;
        height: 1rem;
        max-width: 1.4rem;
        border: 1.5px solid currentColor;
        border-radius: 2px;
      }
      .caption {
        min-width: 0;
        flex: 1;
        border-radius: 0.5rem;
        padding: 0.35rem 0.6rem;
        background: rgb(255 255 255 / 0.1);
        font-size: 0.85rem;
        color: #fff;
        outline: none;
      }
      .caption:focus {
        box-shadow: 0 0 0 2px var(--color-sakura);
      }
      .shutter {
        flex-shrink: 0;
        width: 3.9rem;
        height: 3.9rem;
        border-radius: 99px;
        border: 4px solid #fff;
        background: radial-gradient(circle, var(--color-sakura) 55%, #fff 57%);
        box-shadow: 0 6px 20px -6px rgb(255 126 182 / 0.7);
        transition: transform 0.1s;
      }
      .shutter:hover {
        transform: scale(1.05);
      }
      .shutter:active {
        transform: scale(0.92);
      }
      .shutter:disabled {
        opacity: 0.5;
      }
      .flash {
        position: absolute;
        inset: 0;
        background: #fff;
        animation: flash 0.45s ease-out forwards;
      }
      @keyframes flash {
        from {
          opacity: 0.9;
        }
        to {
          opacity: 0;
        }
      }
      .preview {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: rgb(6 4 26 / 0.7);
        backdrop-filter: blur(4px);
      }
      .preview img {
        max-height: min(62vh, 100%);
      }
      /* Sur téléphone, les six onglets et le déclencheur tiennent sur une ligne. */
      @media (max-width: 639px) {
        .tab {
          padding: 0.2rem 0.45rem;
          font-size: 0.7rem;
        }
        .shutter {
          width: 3.3rem;
          height: 3.3rem;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flash {
          animation-duration: 0.01s;
        }
        .finder {
          transition: none;
        }
      }
    `,
  ],
})
export class PhotoStudio {
  readonly scene = input.required<OrigamiScene>();
  /** Le conteneur du fond et du canvas 3D (pour le filtre de l'aperçu). */
  readonly stage = input.required<HTMLElement>();
  readonly backdrop = input.required<HTMLCanvasElement>();
  readonly model = input.required<OrigamiModel>();
  readonly pattern = input.required<Pattern>();
  readonly patterns = input.required<readonly Pattern[]>();
  readonly swatchUrl = input.required<(p: Pattern) => string>();
  readonly patternChange = output<Pattern>();
  readonly exit = output<void>();

  protected readonly tabs = TABS;
  protected readonly decors = DECORS;
  protected readonly effects = EFFECTS;
  protected readonly frames = FRAMES;
  protected readonly formats = FORMATS;
  protected readonly filters = FILTERS;
  protected readonly css = filterCss;
  protected readonly canShare = canShareFiles();
  protected readonly canCopy = canCopyImage();

  protected readonly tab = signal<Tab>('decor');
  protected readonly decor = signal(DECORS[4]);
  protected readonly effect = signal<Effect>('petals');
  protected readonly frameStyle = signal(FRAMES[0]);
  protected readonly format = signal(FORMATS[0]);
  protected readonly filter = signal(FILTERS[0]);
  protected readonly frozen = signal(false);
  protected readonly caption = signal('');
  protected readonly busy = signal(false);
  protected readonly flash = signal(false);
  protected readonly shot = signal<Shot | null>(null);
  protected readonly toast = signal('');
  private readonly area = signal({ w: 0, h: 0, top: 0, bottom: 0 });

  private readonly top = viewChild.required<ElementRef<HTMLElement>>('top');
  private readonly bottom = viewChild.required<ElementRef<HTMLElement>>('bottom');

  /** Le viseur : le plus grand rectangle au format choisi entre la barre du haut et le panneau du bas. */
  protected readonly finder = computed<Rect>(() => {
    const { w, h, top, bottom } = this.area();
    const ratio = this.format().ratio;
    const pad = 12;
    const aw = Math.max(40, w - 2 * pad);
    const ah = Math.max(40, h - top - bottom - 2 * pad);
    const fw = Math.min(aw, ah * ratio);
    const fh = fw / ratio;
    return { x: (w - fw) / 2, y: top + pad + (ah - fh) / 2, w: fw, h: fh };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Le nom par défaut de la photo : « Mon chien en origami ».
    effect(() => {
      const name = this.model().name.toLowerCase();
      untracked(() => this.caption.set(`Mon ${name} en origami`));
    });

    // Le cadrage du modèle et le fond suivent le viseur et le décor.
    effect(() => {
      const r = this.finder();
      const { top, bottom } = this.area();
      const scene = this.scene();
      untracked(() => {
        scene.setInsets(top, bottom);
        scene.setViewfinder(r.w, r.h);
      });
    });
    effect(() => {
      const d = this.decor();
      const r = this.finder();
      this.scene().setDecor(d);
      paintBackdrop(this.backdrop(), d, r);
    });
    effect(() => this.scene().setEffect(this.effect()));
    effect(() => this.scene().setFrozen(this.frozen()));
    effect(() => (this.stage().style.filter = filterCss(this.filter())));

    afterNextRender(() => {
      this.scene().setPhotoMode(true);
      this.scene().setEffect(this.effect());
      void loadPhotoFonts();
      const measure = () => {
        const host = this.stage().getBoundingClientRect();
        const top = this.top().nativeElement.getBoundingClientRect();
        const panel = this.bottom().nativeElement.querySelector('.panel')!.getBoundingClientRect();
        this.area.set({
          w: host.width,
          h: host.height,
          top: Math.max(0, top.bottom - host.top),
          bottom: Math.max(0, host.bottom - panel.top),
        });
      };
      const observer = new ResizeObserver(measure);
      observer.observe(this.stage());
      observer.observe(this.top().nativeElement);
      observer.observe(this.bottom().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
      measure();
    });

    destroyRef.onDestroy(() => {
      this.scene().setPhotoMode(false);
      this.stage().style.filter = '';
      const url = this.shot()?.url;
      if (url) URL.revokeObjectURL(url);
    });
  }

  protected toggleFreeze() {
    this.frozen.update((f) => !f);
  }

  /** Échap ferme l'aperçu, puis quitte le mode photo. */
  protected escape() {
    if (this.shot()) this.close();
    else this.exit.emit();
  }

  /** Le déclic : rendu 3D en grand, décor, filtre, cadre et légende, puis l'aperçu. */
  protected async shoot() {
    if (this.busy()) return;
    this.busy.set(true);
    const scene = this.scene();
    scene.sound.unlock();
    scene.sound.shutter();
    this.flash.set(true);
    setTimeout(() => this.flash.set(false), 450);
    try {
      await loadPhotoFonts();
      const render = scene.capture(this.finder(), this.format().width);
      const photo = document.createElement('canvas');
      photo.width = render.width;
      photo.height = render.height;
      const ctx = photo.getContext('2d')!;
      const all = { x: 0, y: 0, w: photo.width, h: photo.height };
      this.decor().paint(ctx, photo.width, photo.height, all);
      ctx.drawImage(render, 0, 0);
      applyFilter(photo, this.filter());
      const date = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const framed = frame(photo, this.frameStyle(), { text: this.caption().trim(), date });
      const blob = await toBlob(framed);
      const old = this.shot()?.url;
      if (old) URL.revokeObjectURL(old);
      this.toast.set('');
      this.shot.set({
        url: URL.createObjectURL(blob),
        blob,
        name: `origami-${this.model().id}-${this.pattern().id}.png`,
        width: framed.width,
        height: framed.height,
      });
    } catch (e) {
      console.error(e);
      this.toast.set('La photo a raté, réessaie.');
    } finally {
      this.busy.set(false);
    }
  }

  protected close() {
    const s = this.shot();
    if (s) URL.revokeObjectURL(s.url);
    this.shot.set(null);
  }

  protected async share(s: Shot) {
    const url = new URL('day-10-fold', document.baseURI).href;
    try {
      await shareImage(
        s.blob,
        s.name,
        `${this.caption().trim()}, plié en 3D pour le #devtober de Marill.dev ✨ ${url}`,
      );
    } catch (e) {
      // Partage annulé par l'utilisateur : rien à dire.
      if ((e as DOMException)?.name !== 'AbortError')
        this.toast.set('Le partage n’a pas marché : télécharge-la plutôt.');
    }
  }

  protected download(s: Shot) {
    downloadImage(s.blob, s.name);
    this.toast.set('C’est dans tes téléchargements.');
  }

  protected async copy(s: Shot) {
    try {
      await copyImage(s.blob);
      this.toast.set('Copiée ! Colle-la où tu veux.');
    } catch {
      this.toast.set('Ce navigateur refuse la copie d’image : télécharge-la plutôt.');
    }
  }
}
