import { Component, computed, input, model, output } from '@angular/core';
import { CONFIG } from './config';
import { NEIGHBORHOOD_PIXELS } from './icons';
import { Preset } from './presets';
import { MAX_STATES, MIN_STATES, NEIGHBORS, Neighborhood, Rule, formatRule } from './rule';
import { START_IDS, StartId, isRandomStart, startLabel } from './seed';

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

const NEIGHBORHOODS: readonly { id: Neighborhood; label: string; title: string }[] = [
  { id: 'moore', label: 'Moore', title: 'Moore : les 8 voisines' },
  { id: 'vonNeumann', label: 'Croix', title: 'von Neumann : les 4 voisines en croix' },
  { id: 'hex', label: 'Hexa', title: 'Hexagonal : 6 voisines' },
];

/**
 * Le dos de l'œuf : l'éditeur de règles. Deux rangées de 9 interrupteurs DIP (naître ou survivre avec 0 à 8
 * voisines), le voisinage, le nombre d'états (Generations), la souche, le semis, la vitesse. Tout s'applique en
 * direct à la simulation qui tourne derrière ; « Faire éclore » resème et retourne l'œuf.
 */
@Component({
  selector: 'app-tiny-back',
  host: { role: 'region', 'aria-label': 'Dos de l’œuf : les règles' },
  template: `
    <div class="ring" aria-hidden="true"></div>
    <div class="screws" aria-hidden="true"><span></span><span></span></div>

    <div class="content">
      <div class="sticker">
        <p class="sticker-kicker">Souche</p>
        <p class="sticker-name">{{ preset()?.name ?? 'Souche perso' }}</p>
        <p class="sticker-rule">{{ ruleText() }}</p>
      </div>

      <div class="board">
        <div class="dip-grid" role="group" aria-label="Interrupteurs de la règle">
          <span></span>
          @for (k of counts; track k) {
            <span class="dip-num" aria-hidden="true">{{ k }}</span>
          }
          <span class="dip-label">Naître</span>
          @for (k of counts; track k) {
            @if (k === 0) {
              <span
                class="dip solder"
                title="B0 ferait clignoter tout l’écran : interrupteur soudé"
              >
                <span class="blob"></span>
              </span>
            } @else {
              <button
                type="button"
                role="switch"
                class="dip birth"
                [class.on]="has(rule().birth, k)"
                [disabled]="k > max()"
                [attr.aria-checked]="has(rule().birth, k)"
                [attr.aria-label]="'Naître avec ' + k + ' voisine' + (k > 1 ? 's' : '')"
                (click)="toggle('birth', k)"
              >
                <span class="knob"></span>
              </button>
            }
          }
          <span class="dip-label">Survivre</span>
          @for (k of counts; track k) {
            <button
              type="button"
              role="switch"
              class="dip survive"
              [class.on]="has(rule().survive, k)"
              [disabled]="k > max()"
              [attr.aria-checked]="has(rule().survive, k)"
              [attr.aria-label]="'Survivre avec ' + k + ' voisine' + (k > 1 ? 's' : '')"
              (click)="toggle('survive', k)"
            >
              <span class="knob"></span>
            </button>
          }
        </div>
      </div>

      <div class="row two">
        <div class="field">
          <span class="label">Voisinage</span>
          <div class="slide" role="radiogroup" aria-label="Voisinage">
            @for (n of neighborhoods; track n.id) {
              <button
                type="button"
                role="radio"
                [class.on]="rule().neighborhood === n.id"
                [attr.aria-checked]="rule().neighborhood === n.id"
                [title]="n.title"
                (click)="setNeighborhood(n.id)"
              >
                <svg viewBox="0 0 3 3" aria-hidden="true">
                  @for (p of pixels[n.id]; track $index) {
                    <rect
                      [attr.x]="p[0] + 0.12"
                      [attr.y]="p[1] + 0.12"
                      width="0.76"
                      height="0.76"
                      [class.center]="p[2]"
                    />
                  }
                </svg>
                <span>{{ n.label }}</span>
              </button>
            }
          </div>
        </div>
        <div class="field">
          <span class="label">États</span>
          <div class="states">
            <button
              type="button"
              aria-label="Un état de moins"
              [disabled]="states() <= minStates"
              (click)="addStates(-1)"
            >
              −
            </button>
            <output class="seg" [attr.aria-label]="states() + ' états'">{{ pad(states()) }}</output>
            <button
              type="button"
              aria-label="Un état de plus"
              [disabled]="states() >= maxStates"
              (click)="addStates(1)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div class="row">
        <span class="label">Souche</span>
        <div class="cycler">
          <button type="button" aria-label="Souche précédente" (click)="cyclePreset.emit(-1)">
            ◀
          </button>
          <span class="value">{{ preset()?.name ?? 'Perso' }}</span>
          <button type="button" aria-label="Souche suivante" (click)="cyclePreset.emit(1)">
            ▶
          </button>
        </div>
      </div>
      <p class="blurb">
        {{ preset()?.blurb ?? 'Ta règle à toi : personne ne sait encore ce qu’elle donne.' }}
      </p>

      <div class="row">
        <span class="label">Semis</span>
        <div class="cycler">
          <button type="button" aria-label="Semis précédent" (click)="cycleStart(-1)">◀</button>
          <span class="value">{{ startText() }}</span>
          <button type="button" aria-label="Semis suivant" (click)="cycleStart(1)">▶</button>
        </div>
      </div>
      @if (random()) {
        <label class="row">
          <span class="label">Densité</span>
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.01"
            [value]="density()"
            (input)="density.set(+$any($event.target).value)"
          />
        </label>
      }

      <div class="row">
        <span class="label">Vitesse</span>
        <div class="speeds" role="radiogroup" aria-label="Vitesse (générations par seconde)">
          @for (s of speeds; track $index) {
            <button
              type="button"
              role="radio"
              [class.on]="speed() === $index"
              [attr.aria-checked]="speed() === $index"
              [attr.aria-label]="s + ' générations par seconde'"
              (click)="speed.set($index)"
            >
              {{ s }}
            </button>
          }
        </div>
      </div>

      <div class="actions">
        <button type="button" class="pill" (click)="shuffle.emit()">🎲 Au hasard</button>
        <button type="button" class="pill" (click)="clear.emit()">Effacer</button>
        <button type="button" class="pill hatch" (click)="hatch.emit()">Faire éclore</button>
      </div>

      <p class="legal">Ne pas avaler · 10 800 cellules<br />Garanti sans B0</p>
    </div>

    <button type="button" class="turn" (click)="turn.emit()" aria-label="Retourner l’œuf (F)">
      ↻
    </button>
  `,
  styles: `
    :host {
      display: block;
      color: #1c1460;
      font-size: max(9px, calc(var(--u) * 2.5));
    }
    .content {
      position: absolute;
      inset: 12% 11% 10%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: calc(var(--u) * 1.2);
      overflow-y: auto;
      scrollbar-width: none;
    }
    .sticker {
      align-self: center;
      transform: rotate(-2deg);
      background: #fff6fd;
      border-radius: calc(var(--u) * 1.4);
      padding: calc(var(--u) * 1) calc(var(--u) * 3);
      box-shadow:
        0 calc(var(--u) * 0.4) 0 rgb(40 20 120 / 0.25),
        0 calc(var(--u) * 1) calc(var(--u) * 2) rgb(20 10 80 / 0.25);
      text-align: center;
      border-left: calc(var(--u) * 1.2) solid #777eff;
    }
    .sticker-kicker {
      font-size: 0.75em;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      opacity: 0.6;
    }
    .sticker-name {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.6em;
      line-height: 1.05;
    }
    .sticker-rule {
      font-family: var(--font-mono);
      font-size: 0.95em;
      color: #5a55d9;
    }
    .board {
      background: linear-gradient(180deg, #221a78, #17105a);
      border-radius: calc(var(--u) * 1.6);
      padding: calc(var(--u) * 1.2) calc(var(--u) * 1.4);
      box-shadow:
        inset 0 calc(var(--u) * 0.4) calc(var(--u) * 1) rgb(0 0 0 / 0.4),
        0 calc(var(--u) * 0.3) 0 rgb(255 255 255 / 0.35);
      color: #e9e4ff;
    }
    .dip-grid {
      display: grid;
      grid-template-columns: auto repeat(9, 1fr);
      gap: calc(var(--u) * 0.6) calc(var(--u) * 0.7);
      align-items: center;
      justify-items: center;
    }
    .dip-num {
      font-family: var(--font-mono);
      font-size: 0.85em;
      opacity: 0.75;
    }
    .dip-label {
      justify-self: start;
      font-size: 0.75em;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding-right: calc(var(--u) * 0.6);
    }
    .dip {
      position: relative;
      width: calc(var(--u) * 3.4);
      height: calc(var(--u) * 5.2);
      border-radius: calc(var(--u) * 0.7);
      background: #0b0838;
      box-shadow: inset 0 calc(var(--u) * 0.3) calc(var(--u) * 0.6) rgb(0 0 0 / 0.6);
      cursor: pointer;
    }
    .dip .knob {
      position: absolute;
      left: 12%;
      right: 12%;
      height: 44%;
      bottom: 6%;
      border-radius: calc(var(--u) * 0.45);
      background: linear-gradient(180deg, #fff, #d9d4f5);
      box-shadow: 0 calc(var(--u) * 0.25) 0 #9c94d8;
      transition:
        bottom 0.12s ease-out,
        background-color 0.12s;
    }
    .dip.on .knob {
      bottom: 50%;
    }
    .dip.birth.on .knob {
      background: linear-gradient(180deg, #e4f7ff, #92d9ff);
      box-shadow:
        0 calc(var(--u) * 0.25) 0 #4f9fd0,
        0 0 calc(var(--u) * 1.4) #92d9ff;
    }
    .dip.survive.on .knob {
      background: linear-gradient(180deg, #fff0ff, #f1abf4);
      box-shadow:
        0 calc(var(--u) * 0.25) 0 #c26ccb,
        0 0 calc(var(--u) * 1.4) #f1abf4;
    }
    .dip:disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }
    .dip:focus-visible,
    button:focus-visible {
      outline: 2px solid #ffcaec;
      outline-offset: 2px;
    }
    .dip.solder {
      cursor: help;
      display: grid;
      place-items: center;
    }
    .blob {
      width: 70%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #fff, #c9c9d6 40%, #77778a 85%);
      box-shadow: 0 0 calc(var(--u) * 0.4) rgb(0 0 0 / 0.5);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: calc(var(--u) * 1.5);
    }
    .row.two {
      align-items: flex-start;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: calc(var(--u) * 0.5);
    }
    .label {
      font-size: 0.75em;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.7;
    }
    .slide {
      display: flex;
      background: #1c1460;
      border-radius: 999px;
      padding: calc(var(--u) * 0.4);
      gap: calc(var(--u) * 0.3);
    }
    .slide button {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 0.5);
      padding: calc(var(--u) * 0.4) calc(var(--u) * 1.1);
      border-radius: 999px;
      color: #c9c4f5;
      font-size: 0.85em;
      font-weight: 700;
    }
    .slide button.on {
      background: #fff6fd;
      color: #1c1460;
      box-shadow: 0 calc(var(--u) * 0.3) 0 #9c94d8;
    }
    .slide svg {
      width: calc(var(--u) * 2.2);
      height: calc(var(--u) * 2.2);
      fill: currentColor;
    }
    .slide rect.center {
      opacity: 0.35;
    }
    .states {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 0.5);
    }
    .states button,
    .cycler button {
      width: calc(var(--u) * 3.6);
      height: calc(var(--u) * 3.6);
      border-radius: 50%;
      background: #fff6fd;
      color: #1c1460;
      font-weight: 800;
      box-shadow: 0 calc(var(--u) * 0.35) 0 #9c94d8;
      line-height: 1;
    }
    .states button:disabled {
      opacity: 0.4;
    }
    .states button:active:not(:disabled),
    .cycler button:active,
    .pill:active {
      transform: translateY(calc(var(--u) * 0.3));
      box-shadow: none;
    }
    .seg {
      min-width: calc(var(--u) * 6);
      padding: calc(var(--u) * 0.3) calc(var(--u) * 0.8);
      border-radius: calc(var(--u) * 0.6);
      background: #0b0838;
      color: #f1abf4;
      font-family: var(--font-mono);
      font-size: 1.3em;
      text-align: center;
      text-shadow: 0 0 calc(var(--u) * 1) #f1abf4;
      font-variant-numeric: tabular-nums;
    }
    .cycler {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 0.8);
      flex: 1;
      max-width: 72%;
    }
    .cycler .value {
      flex: 1;
      text-align: center;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.1em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .blurb {
      font-size: 0.9em;
      line-height: 1.3;
      opacity: 0.8;
      margin-top: calc(var(--u) * -0.6);
      min-height: 2.6em;
    }
    input[type='range'] {
      flex: 1;
      max-width: 72%;
      accent-color: #f1abf4;
    }
    .speeds {
      display: flex;
      gap: calc(var(--u) * 0.5);
    }
    .speeds button {
      min-width: calc(var(--u) * 4.2);
      padding: calc(var(--u) * 0.3) calc(var(--u) * 0.6);
      border-radius: calc(var(--u) * 0.8);
      background: rgb(255 255 255 / 0.35);
      font-family: var(--font-mono);
      font-size: 0.9em;
      font-weight: 700;
    }
    .speeds button.on {
      background: #1c1460;
      color: #92d9ff;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: calc(var(--u) * 0.8);
      margin-top: calc(var(--u) * 0.4);
    }
    .pill {
      padding: calc(var(--u) * 0.9) calc(var(--u) * 1.8);
      border-radius: 999px;
      background: #fff6fd;
      font-weight: 800;
      box-shadow: 0 calc(var(--u) * 0.4) 0 #9c94d8;
    }
    .pill.hatch {
      background: radial-gradient(circle at 35% 30%, #ffe3fb, #f1abf4 55%, #d97fe0);
      box-shadow:
        0 calc(var(--u) * 0.4) 0 #a2459f,
        0 0 calc(var(--u) * 2) rgb(255 202 236 / 0.6);
    }
    .legal {
      text-align: center;
      line-height: 1.4;
      font-size: 0.7em;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.55;
    }
    .screws span {
      position: absolute;
      bottom: 4%;
      width: calc(var(--u) * 2.4);
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle, #8d89e6 30%, #5a55c9 70%);
      box-shadow: inset 0 calc(var(--u) * 0.2) calc(var(--u) * 0.3) rgb(0 0 0 / 0.4);
    }
    .screws span:first-child {
      left: 38%;
    }
    .screws span:last-child {
      right: 38%;
    }
    .turn {
      position: absolute;
      top: 9%;
      right: 21%;
      width: calc(var(--u) * 6);
      height: calc(var(--u) * 6);
      border-radius: 50%;
      background: #fff6fd;
      font-size: 1.5em;
      font-weight: 800;
      box-shadow: 0 calc(var(--u) * 0.4) 0 #9c94d8;
    }
  `,
})
export class EggBack {
  readonly rule = model.required<Rule>();
  readonly start = model.required<StartId>();
  readonly density = model.required<number>();
  readonly speed = model.required<number>();
  /** La souche dont la règle est exactement celle-ci, ou null pour une règle perso. */
  readonly preset = input<Preset | null>(null);

  readonly hatch = output<void>();
  readonly shuffle = output<void>();
  readonly clear = output<void>();
  readonly turn = output<void>();
  readonly cyclePreset = output<1 | -1>();

  protected readonly counts = COUNTS;
  protected readonly neighborhoods = NEIGHBORHOODS;
  protected readonly pixels = NEIGHBORHOOD_PIXELS;
  protected readonly speeds = CONFIG.speeds;
  protected readonly minStates = MIN_STATES;
  protected readonly maxStates = MAX_STATES;

  protected readonly ruleText = computed(() => formatRule(this.rule()));
  protected readonly max = computed(() => NEIGHBORS[this.rule().neighborhood]);
  protected readonly states = computed(() => this.rule().states);
  protected readonly random = computed(() => isRandomStart(this.start()));
  protected readonly startText = computed(() => startLabel(this.start(), this.density()));

  protected has(mask: number, k: number): boolean {
    return (mask & (1 << k)) !== 0;
  }

  protected toggle(field: 'birth' | 'survive', k: number): void {
    this.rule.update((r) => ({ ...r, [field]: r[field] ^ (1 << k) }));
  }

  protected setNeighborhood(neighborhood: Neighborhood): void {
    this.rule.update((r) => ({ ...r, neighborhood }));
  }

  protected addStates(delta: number): void {
    this.rule.update((r) => ({
      ...r,
      states: Math.min(MAX_STATES, Math.max(MIN_STATES, r.states + delta)),
    }));
  }

  protected cycleStart(dir: number): void {
    const i = START_IDS.indexOf(this.start());
    this.start.set(START_IDS[(i + dir + START_IDS.length) % START_IDS.length]);
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
