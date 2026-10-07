import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { CONFIG } from './config';
import { Verdict } from './cycle';
import { ICON_PIXELS, IconId } from './icons';

/**
 * La face avant de l'œuf : la coque, l'écran LCD (le canvas que dessine `Lcd`, entouré des pictogrammes
 * imprimés sur la vitre), les trois boutons et celui qui retourne l'œuf. Ce composant ne fait qu'afficher et
 * relayer : la simulation, le dessin au pointeur et le clavier sont dans le composant du jour.
 */
@Component({
  selector: 'app-tiny-front',
  host: { role: 'region', 'aria-label': 'TinyLife, un monde de 10 800 cellules' },
  template: `
    <div class="ring" aria-hidden="true"></div>

    <div class="top">
      <button
        type="button"
        class="nub"
        (click)="light.emit()"
        [attr.aria-pressed]="backlight()"
        aria-label="Rétroéclairage (L)"
      >
        <svg viewBox="0 0 7 7" aria-hidden="true">
          @for (p of icons.light; track $index) {
            <rect [attr.x]="p[0]" [attr.y]="p[1]" width="1" height="1" />
          }
        </svg>
      </button>
      <p class="brand">TINY<span>·</span>LIFE</p>
      <button
        type="button"
        class="nub"
        (click)="soundToggle.emit()"
        [attr.aria-pressed]="sound()"
        aria-label="Son (M)"
      >
        <svg viewBox="0 0 7 7" aria-hidden="true">
          @for (p of icons.sound; track $index) {
            <rect [attr.x]="p[0]" [attr.y]="p[1]" width="1" height="1" />
          }
        </svg>
      </button>
    </div>

    <div class="bezel" [class.lit]="backlight()">
      <div class="glass">
        <div class="icons">
          @for (id of topIcons; track id) {
            <svg viewBox="0 0 7 7" [class.on]="iconOn(id)" aria-hidden="true">
              @for (p of icons[id]; track $index) {
                <rect [attr.x]="p[0]" [attr.y]="p[1]" width="0.9" height="0.9" />
              }
            </svg>
          }
          <span class="pips" aria-hidden="true">
            @for (s of speeds; track $index) {
              <i [class.on]="$index <= speed()" [style.height.%]="30 + $index * 17"></i>
            }
          </span>
        </div>
        <div #slot class="slot">
          <canvas
            #canvas
            class="lcd"
            role="img"
            [attr.aria-label]="label()"
            (pointerdown)="paintStart.emit($event)"
            (pointermove)="paintMove.emit($event)"
            (pointerup)="paintEnd.emit()"
            (pointercancel)="paintEnd.emit()"
          ></canvas>
        </div>
        <div class="icons">
          @for (id of bottomIcons; track id) {
            <svg viewBox="0 0 7 7" [class.on]="iconOn(id)" aria-hidden="true">
              @for (p of icons[id]; track $index) {
                <rect [attr.x]="p[0]" [attr.y]="p[1]" width="0.9" height="0.9" />
              }
            </svg>
          }
          <span class="period" [class.on]="verdict() === 'oscillator'">P{{ period() || '' }}</span>
        </div>
      </div>
      <p class="bezel-label">DOT MATRIX · 120 × 90</p>
    </div>

    <div class="buttons">
      <div class="button">
        <button
          type="button"
          class="key"
          (click)="run.emit()"
          [attr.aria-label]="running() ? 'Pause (Espace)' : 'Lecture (Espace)'"
        ></button>
        <span>{{ running() ? '❚❚' : '▶' }}</span>
      </div>
      <div class="button">
        <button
          type="button"
          class="key"
          (click)="sow.emit()"
          aria-label="Semer à nouveau (R)"
        ></button>
        <span>Semer</span>
      </div>
      <div class="button">
        <button
          type="button"
          class="key"
          (click)="next.emit()"
          aria-label="Souche suivante (→)"
        ></button>
        <span>Souche</span>
      </div>
    </div>

    <button
      type="button"
      class="flip"
      (click)="flip.emit()"
      aria-label="Retourner l’œuf pour régler les règles (F)"
    >
      ↻ Règles
    </button>
    @if (hint()) {
      <p class="hint" aria-hidden="true">Les règles sont au dos !</p>
    }
  `,
  styles: `
    .top {
      position: absolute;
      top: 6.5%;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--u) * 3);
    }
    .brand {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: calc(var(--u) * 5.4);
      letter-spacing: 0.04em;
      color: #fff6fd;
      text-shadow:
        0 calc(var(--u) * 0.35) 0 #4a43b8,
        0 0 calc(var(--u) * 2) rgb(255 202 236 / 0.5);
      line-height: 1;
    }
    .brand span {
      color: #ffcaec;
      margin: 0 0.05em;
    }
    .nub {
      display: grid;
      place-items: center;
      width: calc(var(--u) * 6.4);
      height: calc(var(--u) * 6.4);
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #8f8af0, #4c45c2);
      color: #e9e4ff;
      box-shadow:
        0 calc(var(--u) * 0.5) 0 #2f2890,
        inset 0 calc(var(--u) * 0.3) calc(var(--u) * 0.4) rgb(255 255 255 / 0.4);
    }
    .nub svg {
      width: 52%;
      height: 52%;
      fill: currentColor;
    }
    .nub[aria-pressed='true'] {
      color: #92d9ff;
    }
    .nub:active,
    .key:active {
      transform: translateY(calc(var(--u) * 0.5));
    }
    .nub:active {
      box-shadow: inset 0 calc(var(--u) * 0.3) calc(var(--u) * 0.4) rgb(255 255 255 / 0.3);
    }

    .bezel {
      position: absolute;
      top: 17%;
      left: 13%;
      right: 13%;
      padding: calc(var(--u) * 2.4) calc(var(--u) * 2.4) calc(var(--u) * 1.2);
      border-radius: calc(var(--u) * 4) calc(var(--u) * 4) calc(var(--u) * 9) calc(var(--u) * 4);
      background: linear-gradient(160deg, #2c2580, #1d1762);
      box-shadow:
        inset 0 calc(var(--u) * 0.6) calc(var(--u) * 1.2) rgb(0 0 0 / 0.45),
        0 calc(var(--u) * 0.4) 0 rgb(255 255 255 / 0.3);
      transition: box-shadow 0.3s;
    }
    .bezel.lit {
      box-shadow:
        inset 0 calc(var(--u) * 0.6) calc(var(--u) * 1.2) rgb(0 0 0 / 0.45),
        0 calc(var(--u) * 0.4) 0 rgb(255 255 255 / 0.3),
        0 0 calc(var(--u) * 9) rgb(146 217 255 / 0.35);
    }
    .glass {
      --ink: #1e2418;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: calc(var(--u) * 0.6);
      padding: calc(var(--u) * 1.2) calc(var(--u) * 1.4);
      border-radius: calc(var(--u) * 1.6);
      background: linear-gradient(160deg, #cfd8ad, #b4be91);
      box-shadow: inset 0 calc(var(--u) * 0.8) calc(var(--u) * 1.4) rgb(0 0 0 / 0.3);
      transition:
        background 0.3s,
        box-shadow 0.3s;
    }
    .lit .glass {
      --ink: #0e0a35;
      background: radial-gradient(ellipse at 50% 42%, #d2f4ff, #92d9ff 58%, #66b8ea);
      box-shadow:
        inset 0 calc(var(--u) * 0.8) calc(var(--u) * 1.4) rgb(14 10 53 / 0.25),
        0 0 calc(var(--u) * 3) rgb(146 217 255 / 0.7);
    }
    /* Le reflet de la vitre, par-dessus l'écran. */
    .glass::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(
        115deg,
        rgb(255 255 255 / 0.32),
        transparent 32%,
        transparent 70%,
        rgb(255 255 255 / 0.1)
      );
      pointer-events: none;
    }
    .icons {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 3);
      height: calc(var(--u) * 3.6);
      padding: 0 calc(var(--u) * 1.5);
      color: var(--ink);
    }
    .icons svg {
      height: 100%;
      aspect-ratio: 1;
      fill: currentColor;
      opacity: 0.1;
      transition: opacity 0.12s;
    }
    .icons svg.on {
      opacity: 0.85;
    }
    .pips {
      margin-left: auto;
      display: flex;
      align-items: flex-end;
      gap: calc(var(--u) * 0.45);
      height: 100%;
    }
    .pips i {
      width: calc(var(--u) * 0.9);
      background: currentColor;
      opacity: 0.1;
    }
    .pips i.on {
      opacity: 0.85;
    }
    .period {
      margin-left: calc(var(--u) * -2);
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: calc(var(--u) * 2.4);
      opacity: 0.1;
    }
    .period.on {
      opacity: 0.85;
    }
    .slot {
      display: grid;
      place-items: center;
      aspect-ratio: 120 / 98;
      width: 100%;
    }
    .lcd {
      display: block;
      touch-action: none;
      cursor: crosshair;
    }
    .bezel-label {
      margin-top: calc(var(--u) * 0.9);
      text-align: center;
      font-size: calc(var(--u) * 1.8);
      font-weight: 700;
      letter-spacing: 0.25em;
      color: rgb(233 228 255 / 0.55);
    }

    .buttons {
      position: absolute;
      top: 78.5%;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: calc(var(--u) * 6);
    }
    .button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: calc(var(--u) * 1.2);
    }
    .button span {
      font-size: calc(var(--u) * 2.3);
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgb(20 12 80 / 0.7);
      line-height: 1;
    }
    .key {
      width: calc(var(--u) * 10.5);
      height: calc(var(--u) * 10.5);
      border-radius: 50%;
      background: radial-gradient(circle at 36% 30%, #fff0fd, #f1abf4 46%, #d77ee0 86%);
      box-shadow:
        0 calc(var(--u) * 0.9) 0 #a2459f,
        0 calc(var(--u) * 1.8) calc(var(--u) * 2.4) rgb(20 10 80 / 0.45),
        inset 0 calc(var(--u) * -0.6) calc(var(--u) * 1) rgb(140 40 150 / 0.35);
      transition: transform 0.05s;
    }
    .key:active {
      transform: translateY(calc(var(--u) * 0.8));
      box-shadow:
        0 calc(var(--u) * 0.1) 0 #a2459f,
        0 calc(var(--u) * 0.6) calc(var(--u) * 1) rgb(20 10 80 / 0.45),
        inset 0 calc(var(--u) * -0.6) calc(var(--u) * 1) rgb(140 40 150 / 0.35);
    }
    .key:focus-visible,
    .nub:focus-visible,
    .flip:focus-visible {
      outline: 2px solid #ffcaec;
      outline-offset: 3px;
    }
    .flip {
      position: absolute;
      bottom: 5.5%;
      left: 50%;
      transform: translateX(-50%);
      padding: calc(var(--u) * 0.8) calc(var(--u) * 2.6);
      border-radius: 999px;
      background: #fff6fd;
      color: #1c1460;
      font-size: calc(var(--u) * 2.3);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 calc(var(--u) * 0.45) 0 #9c94d8;
      white-space: nowrap;
    }
    .flip:active {
      transform: translateX(-50%) translateY(calc(var(--u) * 0.4));
      box-shadow: none;
    }
    .hint {
      position: absolute;
      bottom: 5.2%;
      left: calc(50% + var(--u) * 15);
      padding: calc(var(--u) * 0.8) calc(var(--u) * 1.8);
      border-radius: calc(var(--u) * 1.6);
      background: #ffcaec;
      color: #1c1460;
      font-size: calc(var(--u) * 2.2);
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 1.6) rgb(14 10 53 / 0.35);
      animation: nudge 1.6s ease-in-out infinite;
      pointer-events: none;
    }
    .hint::before {
      content: '';
      position: absolute;
      top: 50%;
      left: calc(var(--u) * -1);
      border: calc(var(--u) * 1.1) solid transparent;
      border-left: 0;
      border-right-color: #ffcaec;
      transform: translateY(-50%);
    }
    @keyframes nudge {
      50% {
        transform: translateX(calc(var(--u) * 0.8));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .hint {
        animation: none;
      }
    }
  `,
})
export class EggFront {
  readonly running = input.required<boolean>();
  readonly sound = input.required<boolean>();
  readonly backlight = input.required<boolean>();
  /** Indice de la vitesse (les barres en haut à droite de l'écran). */
  readonly speed = input.required<number>();
  readonly verdict = input.required<Verdict['kind']>();
  readonly period = input(0);
  /** Vrai si la règle n'est pas une souche connue (le crayon s'allume). */
  readonly custom = input(false);
  /** Affiche la bulle « Les règles sont au dos ! ». */
  readonly hint = input(false);
  /** Description de l'écran pour les lecteurs d'écran. */
  readonly label = input('');

  readonly run = output<void>();
  readonly sow = output<void>();
  readonly next = output<void>();
  readonly flip = output<void>();
  readonly light = output<void>();
  readonly soundToggle = output<void>();
  readonly paintStart = output<PointerEvent>();
  readonly paintMove = output<PointerEvent>();
  readonly paintEnd = output<void>();

  /** Le canvas de l'écran et la place qui lui est laissée (pour caler la matrice). */
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  protected readonly icons = ICON_PIXELS;
  protected readonly topIcons: readonly IconId[] = ['play', 'sound', 'light', 'custom'];
  protected readonly bottomIcons: readonly IconId[] = ['alive', 'still', 'oscillator', 'extinct'];
  protected readonly speeds = CONFIG.speeds;

  protected iconOn(id: IconId): boolean {
    switch (id) {
      case 'play':
        return this.running();
      case 'sound':
        return this.sound();
      case 'light':
        return this.backlight();
      case 'custom':
        return this.custom();
      default:
        return this.verdict() === id;
    }
  }
}
