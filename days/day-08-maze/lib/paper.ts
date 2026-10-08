import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { HelpLine } from './desk';
import type { Face, LaidBloc, Piece, Print, Stroke } from './model';
import { MOTIF, TYPO } from './layout';
import { STAMP_LABEL } from './rules';
import { INK_COLOR, PRINT_SIZE } from './scene';

/** Les corps et interlignes de TYPO en variables CSS (`--fs-texte`, `--lh-texte`…). */
const TYPO_VARS = Object.entries(TYPO)
  .map(([k, t]) => `--fs-${k}:${t.size}px;--lh-${k}:${t.lh}px`)
  .join(';');

/** Le chemin SVG d'un trait de stylo. */
export function strokePath(points: readonly { x: number; y: number }[]): string {
  if (!points.length) return '';
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++)
    d += `L${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  return d;
}

/** Quelques éclaboussures d'encre autour d'une empreinte, toujours les mêmes pour une empreinte donnée. */
function splashes(p: Print): { x: number; y: number; r: number }[] {
  let h = p.seq * 2654435761;
  const next = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
  const { w, h: hh } = PRINT_SIZE[p.stamp];
  return Array.from({ length: 2 + Math.floor(next() * 3) }, () => ({
    x: (next() - 0.5) * (w + 18),
    y: (next() - 0.5) * (hh + 16),
    r: 0.6 + next() * 1.3,
  }));
}

/**
 * Une feuille : ses blocs mis en page, ses cadres, et par-dessus l'encre (empreintes de tampon, traits de
 * stylo, saisies au clavier). Recto et verso sont deux faces d'une même carte qui se retourne en 250 ms.
 * Le composant ne se redessine que quand la révision de la pièce change.
 */
@Component({
  selector: 'maze-paper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'paper',
    '[style]': 'typoVars',
    '[style.width.px]': 'piece().w',
    '[style.height.px]': 'piece().h',
  },
  template: `
    @let p = piece();
    <div class="flip" [class.flipped]="p.flipped">
      @for (face of faces; track face) {
        <div
          class="face"
          [class.verso]="face === 'verso'"
          [attr.data-papier]="p.papier"
          [class.fiche]="p.type === 'fiche'"
        >
          @let blocs = face === 'recto' ? p.recto : p.verso;
          @if (blocs) {
            @for (l of blocs; track $index) {
              <ng-container *ngTemplateOutlet="bloc; context: { $implicit: l, face }" />
            }
          } @else {
            <p class="vierge">Verso laissé blanc</p>
          }
          @if (face === 'recto') {
            @if (p.petits) {
              <p class="petits">{{ p.petits }}</p>
            }
            @for (f of filigranes(); track $index) {
              <span class="filigrane" [style.top.%]="f">COPIE</span>
            }
            @if (p.type === 'fiche') {
              <span class="agrafe"></span>
            }
          }
          <svg class="ink" [attr.viewBox]="'0 0 ' + p.w + ' ' + p.h" aria-hidden="true">
            @for (s of strokesOf(face); track s.seq) {
              <path class="trait" [attr.d]="path(s)" [attr.stroke]="color(s.ink)" />
            }
            @for (pr of printsOf(face); track pr.seq) {
              <g
                class="empreinte"
                [attr.transform]="'translate(' + pr.x + ' ' + pr.y + ') rotate(' + pr.rot + ')'"
                [attr.fill]="color(pr.ink)"
                [attr.stroke]="color(pr.ink)"
                [attr.opacity]="pr.nette ? 0.9 : 0.42"
                filter="url(#maze-ink)"
              >
                <rect
                  [attr.x]="-size(pr).w / 2"
                  [attr.y]="-size(pr).h / 2"
                  [attr.width]="size(pr).w"
                  [attr.height]="size(pr).h"
                  rx="3"
                  fill="none"
                  stroke-width="2.4"
                />
                <rect
                  [attr.x]="-size(pr).w / 2 + 3.5"
                  [attr.y]="-size(pr).h / 2 + 3.5"
                  [attr.width]="size(pr).w - 7"
                  [attr.height]="size(pr).h - 7"
                  rx="1.5"
                  fill="none"
                  stroke-width="0.9"
                />
                @if (pr.stamp === 'RECU_LE') {
                  <text y="-4" text-anchor="middle" stroke="none" class="lettres">REÇU LE</text>
                  <text y="16" text-anchor="middle" stroke="none" class="date">{{ pr.date }}</text>
                } @else {
                  <text y="6.5" text-anchor="middle" stroke="none" class="lettres">
                    {{ label(pr) }}
                  </text>
                }
                @for (s of splash(pr); track $index) {
                  <circle [attr.cx]="s.x" [attr.cy]="s.y" [attr.r]="s.r" stroke="none" />
                }
              </g>
            }
          </svg>
        </div>
      }
    </div>

    <ng-template #bloc let-l let-face="face">
      @let b = l.bloc;
      @switch (b.t) {
        @case ('titre') {
          <p class="b titre" [style]="pos(l)">{{ b.texte }}</p>
        }
        @case ('meta') {
          <p class="b meta" [style]="pos(l)">{{ b.texte }}</p>
        }
        @case ('texte') {
          <p class="b texte" [attr.data-style]="b.style" [style]="pos(l)">{{ b.texte }}</p>
        }
        @case ('valeur') {
          <p class="b valeur" [style]="pos(l)">
            <span>{{ b.label }} :</span> <b>{{ b.valeur }}</b>
          </p>
        }
        @case ('ligne') {
          <p class="b ligne" [style]="pos(l)" [class.ok]="lineOk(b.n)" [class.chaud]="lineHot(b.n)">
            <span class="num">{{ b.n }}.</span>{{ b.texte }}
            @if (lineOk(b.n)) {
              <span class="coche" aria-label="conforme">✔</span>
            }
          </p>
        }
        @case ('champ') {
          <div class="b champ" [style]="pos(l)">
            <span class="lbl">{{ b.label }}</span>
            <span class="saisie" [class.focus]="focus() === b.id">
              @for (c of chars(b.id); track $index) {
                <span [class.barre]="c.barre">{{ c.c }}</span>
              }
              @if (focus() === b.id) {
                <span class="caret"></span>
              }
            </span>
          </div>
        }
        @case ('case') {
          <div class="b case" [style]="pos(l)">
            <span class="boite">
              @if (checked(b.id)) {
                <svg viewBox="0 0 11 11"><path d="M1.5 2 9.5 9.5M9.5 1.5 2 9" /></svg>
              } @else if (toggled(b.id)) {
                <svg viewBox="0 0 11 11" class="rature"><path d="M0 6h11M0 4.5h11" /></svg>
              }
            </span>
            <span>{{ b.label }}</span>
          </div>
        }
        @case ('signature') {
          <div class="b signature" [style]="pos(l)">
            <span class="lbl">{{ b.label }}</span>
            <span class="cadre" [style.height.px]="l.rect.h - 10"></span>
          </div>
        }
        @case ('cachet') {
          <div class="b cachet" [style]="pos(l)">
            <span class="lbl">{{ b.label }}</span>
          </div>
        }
        @case ('pied') {
          <div class="b pied" [style]="pos(l)">
            <span class="cadre sig"
              ><span class="lbl">{{ b.signature.label }}</span></span
            >
            <span class="cadre cach"
              ><span class="lbl">{{ b.cachet.label }}</span></span
            >
          </div>
        }
        @case ('paraphe') {
          <div class="b paraphe" [style]="pos(l)"><span class="lbl">Paraphe</span></div>
        }
        @case ('motif') {
          <svg
            class="b motif"
            [style]="pos(l)"
            [attr.viewBox]="'0 0 ' + l.rect.w / motifScale + ' ' + l.rect.h / motifScale"
            aria-hidden="true"
          >
            <ng-container
              *ngTemplateOutlet="
                motif;
                context: { $implicit: b, w: l.rect.w / motifScale, h: l.rect.h / motifScale }
              "
            />
          </svg>
        }
      }
    </ng-template>

    <ng-template #motif let-b let-w="w" let-h="h">
      <svg:g>
        @switch (b.motif) {
          @case ('patte') {
            @if (b.valeur === 'non') {
              <g [attr.transform]="'translate(' + w / 2 + ' ' + h / 2 + ')'" class="vide">
                <circle r="14" />
                <text y="3" text-anchor="middle">empreinte : néant</text>
              </g>
            } @else {
              <g
                [attr.transform]="'translate(' + w / 2 + ' ' + (h / 2 + 2) + ') rotate(-12)'"
                class="patte"
              >
                <ellipse cx="0" cy="6" rx="8" ry="6.5" />
                <ellipse cx="-9" cy="-4" rx="3" ry="4" />
                <ellipse cx="-3.2" cy="-9" rx="3" ry="4" />
                <ellipse cx="3.2" cy="-9" rx="3" ry="4" />
                <ellipse cx="9" cy="-4" rx="3" ry="4" />
              </g>
            }
          }
          @case ('gribouillis') {
            <path
              class="trait"
              d="M20 18c6-12 10 10 16-2s8 10 14-4 6 12 12 0c4-8 8 4 10 2 4-4 2 8 8 2"
              stroke="#1F4FA3"
            />
          }
          @case ('photo') {
            <g class="photo">
              <rect x="4" y="1" [attr.width]="h * 0.8" [attr.height]="h - 2" />
              <circle [attr.cx]="4 + h * 0.4" [attr.cy]="h * 0.4" [attr.r]="h * 0.18" />
              <path
                [attr.d]="
                  'M' +
                  (4 + h * 0.12) +
                  ' ' +
                  (h - 1) +
                  'q' +
                  h * 0.28 +
                  ' -' +
                  h * 0.4 +
                  ' ' +
                  h * 0.56 +
                  ' 0'
                "
              />
            </g>
          }
          @case ('baguette') {
            <g class="baguette">
              <path
                [attr.d]="
                  'M6 ' +
                  h / 2 +
                  'q' +
                  (w - 12) / 2 +
                  ' -' +
                  h * 0.6 +
                  ' ' +
                  (w - 12) +
                  ' 0q-' +
                  (w - 12) / 2 +
                  ' ' +
                  h * 0.6 +
                  ' -' +
                  (w - 12) +
                  ' 0z'
                "
              />
              <path d="M24 9l6 6M40 8l6 6M56 8l6 6" />
            </g>
          }
          @case ('fidelite') {
            @for (i of ten; track i) {
              <g
                [attr.transform]="
                  'translate(' + (12 + (i % 5) * ((w - 24) / 4)) + ' ' + (i < 5 ? 11 : h - 11) + ')'
                "
              >
                <circle r="8.5" class="slot" />
                @if (i < num(b.valeur)) {
                  <path
                    class="tampon-mie"
                    d="M0-6 1.8-1.8 6-1.8 2.6 1 3.8 5.4 0 2.8-3.8 5.4-2.6 1-6-1.8-1.8-1.8z"
                  />
                }
              </g>
            }
          }
          @case ('nageur') {
            <g class="nageur">
              <circle [attr.cx]="w / 2 + 18" cy="10" r="4" />
              <path [attr.d]="'M' + (w / 2 - 22) + ' 16l18 -4 18 2m-30 -2 -8 -6'" />
              <path [attr.d]="'M8 26q8 -5 16 0t16 0 16 0 16 0 16 0 16 0 16 0 16 0'" />
            </g>
          }
          @case ('aspirateur') {
            <g class="nageur">
              <rect [attr.x]="w / 2 - 26" y="8" width="30" height="14" rx="6" />
              <circle [attr.cx]="w / 2 - 20" cy="23" r="3" />
              <path [attr.d]="'M' + (w / 2 + 4) + ' 14q18 -10 26 6l8 2'" />
            </g>
          }
          @case ('code-barres') {
            @for (i of bars; track i) {
              <rect
                [attr.x]="6 + i * 3.1"
                y="1"
                [attr.width]="i % 3 === 0 ? 2 : 1"
                [attr.height]="h - 2"
                class="barre"
              />
            }
          }
        }
      </svg:g>
    </ng-template>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      perspective: 900px;
    }
    /* Les corps et interlignes viennent de TYPO (layout.ts), comme la mise en page : rendu et règles concordent. */
    .flip {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      transition: transform 250ms ease-in-out;
    }
    .flip.flipped {
      transform: rotateY(180deg);
    }
    .face {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
      background: var(--papier, #ede6d3);
      color: #24221f;
      font-family: 'Barlow Condensed', sans-serif;
      box-shadow:
        0 1px 0 rgba(0, 0, 0, 0.08),
        0 6px 14px -6px rgba(20, 14, 6, 0.55);
      overflow: hidden;
      background-image: linear-gradient(transparent 96%, rgba(80, 60, 30, 0.04) 96%);
      background-size: 100% var(--lh-texte);
    }
    .face.verso {
      transform: rotateY(180deg);
    }
    .face[data-papier='jaune'] {
      --papier: #efe2a8;
    }
    .face[data-papier='rose'] {
      --papier: #f1cbc1;
    }
    .face[data-papier='vert'] {
      --papier: #cfe3d2;
    }
    .face[data-papier='bleu'] {
      --papier: #d3deea;
    }
    .face[data-papier='kraft'] {
      --papier: #ccab7c;
    }
    .face[data-papier='ticket'] {
      --papier: #f6f3ea;
    }
    .b {
      position: absolute;
      margin: 0;
      overflow: hidden;
      font-size: var(--fs-texte);
      line-height: var(--lh-texte);
    }
    .titre {
      font-size: var(--fs-titre);
      line-height: var(--lh-titre);
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .meta {
      font-size: var(--fs-meta);
      line-height: var(--lh-meta);
      color: #5b554b;
    }
    .texte[data-style='manuscrit'] {
      font-family: Caveat, cursive;
      font-size: var(--fs-manuscrit);
      line-height: var(--lh-manuscrit);
      color: #1f3f86;
    }
    .texte[data-style='machine'] {
      font-family: 'Special Elite', monospace;
      font-size: var(--fs-machine);
      line-height: var(--lh-machine);
      white-space: pre-line;
    }
    .texte[data-style='gras'] {
      font-weight: 700;
    }
    .texte[data-style='petit'],
    .petits {
      font-size: var(--fs-petit);
      line-height: var(--lh-petit);
      color: #4b463e;
    }
    .petits {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 5px;
      margin: 0;
    }
    .valeur {
      line-height: var(--lh-valeur);
    }
    .valeur span {
      color: #5b554b;
    }
    .ligne {
      padding-left: 16px;
    }
    .ligne .num {
      position: absolute;
      left: 0;
      font-weight: 700;
    }
    .ligne.chaud {
      background: rgba(255, 214, 92, 0.55);
      box-shadow: 0 0 0 2px rgba(255, 214, 92, 0.55);
    }
    .ligne.ok {
      color: #255c33;
    }
    .coche {
      position: absolute;
      right: 0;
      top: 0;
      color: #2e8b47;
      font-weight: 700;
    }
    .lbl {
      display: block;
      font-size: var(--fs-label);
      line-height: var(--lh-label);
      color: #5b554b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .saisie {
      display: block;
      height: 22px;
      border-bottom: 1px solid #7a7062;
      font-family: Caveat, cursive;
      font-size: 19px;
      line-height: 22px;
      color: #1f3f86;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.25);
    }
    .saisie.focus {
      background: rgba(255, 240, 170, 0.6);
    }
    .barre {
      text-decoration: line-through 2px;
      color: #3a4f86;
      opacity: 0.75;
    }
    .caret {
      display: inline-block;
      width: 1.5px;
      height: 17px;
      background: #1f3f86;
      vertical-align: -2px;
      animation: blink 1s steps(1) infinite;
    }
    @keyframes blink {
      50% {
        opacity: 0;
      }
    }
    .case {
      display: flex;
      gap: 5px;
    }
    .boite {
      flex: none;
      width: 14px;
      height: 14px;
      margin-top: 1px;
      border: 1px solid #3b362f;
      background: rgba(255, 255, 255, 0.4);
    }
    .boite svg {
      display: block;
      stroke: #1f3f86;
      stroke-width: 1.6;
      stroke-linecap: round;
      fill: none;
    }
    .boite .rature {
      stroke-width: 1.2;
    }
    .cadre {
      display: block;
      border: 1px dashed #8a8070;
      border-radius: 2px;
    }
    .cachet,
    .paraphe,
    .pied .cadre {
      border: 1px dashed #8a8070;
      border-radius: 4px;
      padding: 2px 4px;
      box-sizing: border-box;
    }
    .pied {
      display: flex;
      gap: 6px;
    }
    .pied .sig {
      flex: 1;
    }
    .pied .cach {
      width: 108px;
      flex: none;
    }
    .paraphe .lbl {
      font-size: 7px;
    }
    .vierge {
      position: absolute;
      inset: auto 0 40% 0;
      text-align: center;
      font-size: 11px;
      color: #9a9080;
    }
    .filigrane {
      position: absolute;
      left: 8%;
      font:
        700 32px/1 'Allerta Stencil',
        sans-serif;
      color: rgba(120, 110, 100, 0.22);
      transform: rotate(-22deg);
      letter-spacing: 0.3em;
      pointer-events: none;
    }
    .agrafe {
      position: absolute;
      top: 6px;
      left: 50%;
      width: 26px;
      height: 4px;
      margin-left: -13px;
      border: 1.5px solid #8b8f96;
      border-bottom: none;
    }
    .ink {
      position: absolute;
      inset: 0;
      overflow: visible;
    }
    .trait {
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      animation: matte 800ms ease-out;
    }
    @keyframes matte {
      from {
        stroke-width: 2.5;
        filter: brightness(1.6);
      }
    }
    .empreinte {
      animation: thump 260ms ease-out;
    }
    @keyframes thump {
      from {
        filter: blur(1.2px);
      }
    }
    .lettres {
      font:
        17px 'Allerta Stencil',
        sans-serif;
      letter-spacing: 1px;
    }
    .date {
      font:
        14px 'Special Elite',
        monospace;
    }
    .motif {
      overflow: visible;
    }
    .patte {
      fill: #6d4b2f;
      opacity: 0.85;
    }
    .vide circle {
      fill: none;
      stroke: #8a8070;
      stroke-dasharray: 3 3;
    }
    .vide text {
      font-size: 6px;
      fill: #8a8070;
    }
    .photo rect,
    .photo circle,
    .photo path {
      fill: #b9b2a5;
      stroke: #6f685c;
    }
    .baguette path,
    .nageur * {
      fill: none;
      stroke: #6d4b2f;
      stroke-width: 1.4;
      stroke-linecap: round;
    }
    .slot {
      fill: none;
      stroke: #6d4b2f;
      stroke-dasharray: 2 2;
    }
    .tampon-mie {
      fill: #9b2f24;
      opacity: 0.85;
    }
    .barre {
      fill: #222;
    }
  `,
  imports: [NgTemplateOutlet],
})
export class MazePaper {
  readonly piece = input.required<Piece>();
  /** Révision de la pièce : le seul déclencheur du redessin. */
  readonly v = input(0);
  readonly help = input<readonly HelpLine[] | null>(null);
  readonly focus = input<string | null>(null);

  protected readonly faces: Face[] = ['recto', 'verso'];
  protected readonly motifScale = MOTIF;
  protected readonly typoVars = TYPO_VARS;
  protected readonly ten = Array.from({ length: 10 }, (_, i) => i);
  protected readonly bars = Array.from({ length: 26 }, (_, i) => i);

  protected readonly filigranes = computed(() => {
    const n = this.piece().filigranes;
    return n === 1 ? [38] : n >= 2 ? [18, 58] : [];
  });

  protected pos(l: LaidBloc): string {
    return `left:${l.rect.x}px;top:${l.rect.y}px;width:${l.rect.w}px;height:${l.rect.h}px`;
  }
  protected printsOf(face: Face): Print[] {
    this.v();
    return this.piece().prints.filter((p) => p.face === face);
  }
  protected strokesOf(face: Face): Stroke[] {
    this.v();
    return this.piece().strokes.filter((s) => s.face === face);
  }
  protected path(s: Stroke): string {
    return strokePath(s.points);
  }
  protected color(ink: Print['ink']): string {
    return INK_COLOR[ink];
  }
  protected size(p: Print) {
    return PRINT_SIZE[p.stamp];
  }
  protected label(p: Print): string {
    return STAMP_LABEL[p.stamp];
  }
  protected splash(p: Print) {
    return splashes(p);
  }
  protected chars(id: string) {
    this.v();
    return this.piece().textes[id]?.chars ?? [];
  }
  protected checked(id: string): boolean {
    this.v();
    return Boolean(this.piece().cases[id]?.cochee);
  }
  protected toggled(id: string): boolean {
    return (this.piece().cases[id]?.bascules ?? 0) > 0;
  }
  protected num(v: string | undefined): number {
    return Number(v ?? 0);
  }
  protected lineOk(n: number): boolean {
    return Boolean(this.help()?.find((h) => h.n === n)?.ok);
  }
  protected lineHot(n: number): boolean {
    return Boolean(this.help()?.find((h) => h.n === n)?.chaud);
  }
}
