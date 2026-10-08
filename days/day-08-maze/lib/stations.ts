import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StampTool } from './actions';
import type { Tool } from './desk';
import type { StampId } from './model';
import { STAMP_LABEL } from './rules';
import {
  INK_COLOR,
  INKS,
  POT_ITEMS,
  R,
  STAMP_ORDER,
  daterWheel,
  inkWell,
  stampSlot,
} from './scene';

/**
 * Ce qui bouge sur le bureau sans être une feuille : l'horloge murale, le mémo, le pot à crayons, le carrousel
 * de tampons avec l'encreur et le dateur, le compteur mécanique du score et l'éphéméride. Le HUD est
 * diégétique : aucune barre flottante.
 */
@Component({
  selector: 'maze-stations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stations' },
  template: `
    <svg viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
      <!-- L'horloge murale. -->
      <g [attr.transform]="'translate(' + (R.horloge.x + 40) + ' ' + (R.horloge.y + 40) + ')'">
        <circle r="38" fill="#efe9da" stroke="#3d3a33" stroke-width="5" />
        @for (i of twelve; track i) {
          <line
            y1="-32"
            y2="-27"
            stroke="#3d3a33"
            stroke-width="2"
            [attr.transform]="'rotate(' + i * 30 + ')'"
          />
        }
        <line
          y1="4"
          y2="-19"
          stroke="#24221f"
          stroke-width="4"
          stroke-linecap="round"
          [attr.transform]="'rotate(' + hourAngle() + ')'"
        />
        <line
          y1="6"
          y2="-28"
          stroke="#24221f"
          stroke-width="2.4"
          stroke-linecap="round"
          [attr.transform]="'rotate(' + minuteAngle() + ')'"
        />
        <circle r="3" fill="#b3261e" />
      </g>

      <!-- Le tableau de liège : la note de service du jour et les règles. -->
      <g [attr.transform]="'translate(' + R.memo.x + ' ' + R.memo.y + ')'">
        <rect
          [attr.width]="R.memo.w"
          [attr.height]="R.memo.h"
          rx="3"
          fill="#b88a5a"
          stroke="#6b4a2c"
          stroke-width="4"
        />
        <rect x="8" y="8" width="106" height="72" fill="#efe9da" transform="rotate(-2 60 44)" />
        <text x="14" y="22" class="memo-t" transform="rotate(-2 60 44)">NOTE DE SERVICE</text>
        <text x="14" y="33" class="memo-t" transform="rotate(-2 60 44)">n° {{ note() }}</text>
        @for (i of [0, 1, 2, 3, 4]; track i) {
          <line
            x1="14"
            [attr.x2]="100 - (i % 2) * 18"
            [attr.y1]="44 + i * 7"
            [attr.y2]="44 + i * 7"
            stroke="#8a8070"
            transform="rotate(-2 60 44)"
          />
        }
        <rect x="124" y="10" width="74" height="68" fill="#f3efe2" transform="rotate(3 160 44)" />
        <text x="130" y="24" class="memo-t" transform="rotate(3 160 44)">RÈGLES</text>
        @for (i of rulesLines(); track i) {
          <line
            x1="130"
            x2="190"
            [attr.y1]="32 + i * 7"
            [attr.y2]="32 + i * 7"
            stroke="#8a8070"
            transform="rotate(3 160 44)"
          />
        }
        <rect x="206" y="18" width="38" height="34" fill="#f1e27a" transform="rotate(-6 225 35)" />
        <circle cx="60" cy="10" r="4" fill="#b3261e" />
        <circle cx="160" cy="12" r="4" fill="#1f4fa3" />
        <circle cx="225" cy="20" r="3.5" fill="#2e7d32" />
        <text [attr.x]="R.memo.w / 2" [attr.y]="R.memo.h + 11" text-anchor="middle" class="hint">
          mémo : survoler pour lire
        </text>
      </g>

      <!-- Le pot à crayons : stylo bleu, stylo rouge, loupe. -->
      @for (item of potItems; track item.id) {
        <g [class.absent]="inHand(item.id)" [class.hot]="hover() === 'pot'">
          @if (item.id === 'loupe') {
            <g
              [attr.transform]="
                'translate(' + (item.rect.x + 16) + ' ' + (item.rect.y + 26) + ') rotate(18)'
              "
            >
              <rect x="-4" y="16" width="8" height="60" rx="3" fill="#2d2a25" />
              <circle r="18" fill="#cfe0e8" fill-opacity="0.5" stroke="#5b5d60" stroke-width="5" />
            </g>
          } @else {
            <g
              [attr.transform]="
                'translate(' +
                (item.rect.x + 16) +
                ' ' +
                (item.rect.y + 2) +
                ') rotate(' +
                (item.id === 'bleu' ? -6 : 5) +
                ')'
              "
            >
              <rect x="-5" y="0" width="10" height="100" rx="4" fill="#ece6d8" stroke="#8c8270" />
              <rect
                x="-5"
                y="0"
                width="10"
                height="16"
                rx="4"
                [attr.fill]="item.id === 'bleu' ? '#1F4FA3' : '#B3261E'"
              />
              <rect x="-1.5" y="18" width="3" height="40" fill="#cfc6b3" />
            </g>
          }
        </g>
      }

      <!-- Le carrousel de tampons. -->
      @for (id of stampIds; track id) {
        @let slot = slotOf(id);
        <g [class.absent]="inHand(id)" [class.hot]="hover() === 'tampon'">
          <ellipse
            [attr.cx]="slot.x + slot.w / 2"
            [attr.cy]="slot.y + 19"
            rx="17"
            ry="14"
            fill="#2b1f15"
          />
          <ellipse
            [attr.cx]="slot.x + slot.w / 2"
            [attr.cy]="slot.y + 16"
            rx="15"
            ry="12"
            fill="#7a4b2a"
          />
          <rect
            [attr.x]="slot.x + slot.w / 2 - 5"
            [attr.y]="slot.y + 28"
            width="10"
            height="20"
            fill="#5a3a20"
          />
          <rect
            [attr.x]="slot.x + 2"
            [attr.y]="slot.y + 48"
            [attr.width]="slot.w - 4"
            height="32"
            rx="3"
            fill="#c9c2b0"
            stroke="#3a3530"
          />
          <text
            [attr.x]="slot.x + slot.w / 2"
            [attr.y]="slot.y + 69"
            text-anchor="middle"
            class="manche"
            [attr.textLength]="
              id === 'IRRECEVABLE' || id === 'CONFORME' || id === 'APPROUVE' ? slot.w - 10 : null
            "
            lengthAdjust="spacingAndGlyphs"
          >
            {{ label(id) }}
          </text>
          @for (k of [0, 1, 2]; track k) {
            <circle
              [attr.cx]="slot.x + slot.w / 2 - 10 + k * 10"
              [attr.cy]="slot.y + 93"
              r="3.2"
              [attr.fill]="k < charges(id) ? inkOf(id) : 'none'"
              [attr.stroke]="inkOf(id)"
            />
          }
        </g>
      }

      <!-- L'encreur, quatre couleurs. -->
      @for (ink of inks; track ink) {
        @let w = well(ink);
        <rect
          [attr.x]="w.x"
          [attr.y]="w.y"
          [attr.width]="w.w"
          [attr.height]="w.h"
          rx="4"
          fill="#2b2620"
        />
        <rect
          [attr.x]="w.x + 4"
          [attr.y]="w.y + 4"
          [attr.width]="w.w - 8"
          [attr.height]="w.h - 8"
          rx="3"
          [attr.fill]="color(ink)"
          opacity="0.92"
        />
      }

      <!-- Le dateur : trois molettes (jour, mois, année). -->
      @for (i of [0, 1, 2]; track i) {
        @let w = wheel(i);
        <rect
          [attr.x]="w.x"
          [attr.y]="w.y"
          [attr.width]="w.w"
          [attr.height]="w.h"
          rx="4"
          [attr.fill]="dateurActif() ? '#d8d0b8' : '#9d9682'"
          stroke="#3a3530"
        />
        <text [attr.x]="w.x + w.w / 2" [attr.y]="w.y + 33" text-anchor="middle" class="molette">
          {{ digits()[i] }}
        </text>
      }

      <!-- Le compteur mécanique du score. -->
      <g [attr.transform]="'translate(' + R.compteur.x + ' ' + R.compteur.y + ')'">
        <rect
          [attr.width]="R.compteur.w"
          [attr.height]="R.compteur.h"
          rx="6"
          fill="#2e3430"
          stroke="#151916"
          stroke-width="2"
        />
        @for (d of scoreDigits(); track $index) {
          <rect [attr.x]="8 + $index * 26" y="6" width="22" height="34" rx="2" fill="#ece6d8" />
          <text
            [attr.x]="19 + $index * 26"
            y="32"
            text-anchor="middle"
            class="rouleau"
            [class.neg]="score() < 0"
          >
            {{ d }}
          </text>
        }
        <text [attr.x]="R.compteur.w / 2" y="50" text-anchor="middle" class="hint clair">
          points
        </text>
      </g>

      <!-- L'éphéméride. -->
      <g [attr.transform]="'translate(' + R.calendrier.x + ' ' + R.calendrier.y + ')'">
        <rect
          [attr.width]="R.calendrier.w"
          [attr.height]="R.calendrier.h"
          rx="3"
          fill="#efe9da"
          stroke="#8c8270"
        />
        <rect [attr.width]="R.calendrier.w" height="15" rx="3" fill="#b3261e" />
        <text [attr.x]="R.calendrier.w / 2" y="11.5" text-anchor="middle" class="eph-t">
          {{ dayName() }}
        </text>
        <text [attr.x]="R.calendrier.w / 2" y="41" text-anchor="middle" class="eph">
          {{ dayNum() }}
        </text>
        <text [attr.x]="R.calendrier.w / 2" y="51" text-anchor="middle" class="eph-t sombre">
          OCTOBRE 2026
        </text>
      </g>
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .absent {
      opacity: 0.18;
    }
    .hot {
      filter: brightness(1.12);
    }
    .hint {
      font:
        11px 'Barlow Condensed',
        sans-serif;
      fill: #3a332a;
      letter-spacing: 0.04em;
    }
    .hint.clair {
      fill: #e8dcc3;
      opacity: 0.8;
    }
    .memo-t {
      font:
        7.5px 'Special Elite',
        monospace;
      fill: #2d2a25;
    }
    .manche {
      font:
        11px 'Allerta Stencil',
        sans-serif;
      fill: #24221f;
    }
    .molette {
      font:
        22px 'Special Elite',
        monospace;
      fill: #5b3a8c;
    }
    .rouleau {
      font:
        700 24px 'Barlow Condensed',
        sans-serif;
      fill: #1e1e22;
    }
    .rouleau.neg {
      fill: #b3261e;
    }
    .eph {
      font:
        700 26px 'Barlow Condensed',
        sans-serif;
      fill: #24221f;
    }
    .eph-t {
      font:
        700 8.5px 'Barlow Condensed',
        sans-serif;
      fill: #f3ede0;
      letter-spacing: 0.12em;
    }
    .eph-t.sombre {
      fill: #5b554b;
    }
  `,
})
export class MazeStations {
  readonly minute = input(9 * 60);
  readonly tool = input<Tool>({ k: 'main' });
  readonly stamps = input.required<Record<StampId, StampTool>>();
  /** Révision des tampons (encre, charges) : un changement redessine le carrousel. */
  readonly inkRev = input(0);
  readonly dater = input<readonly [number, number, number]>([5, 10, 2026]);
  readonly dateurActif = input(false);
  readonly score = input(0);
  readonly jour = input(1);
  readonly note = input(1);
  readonly regles = input(3);
  readonly hover = input<string | null>(null);

  protected readonly R = R;
  protected readonly twelve = Array.from({ length: 12 }, (_, i) => i);
  protected readonly potItems = POT_ITEMS;
  protected readonly stampIds = STAMP_ORDER;
  protected readonly inks = INKS;

  protected readonly hourAngle = computed(() => ((this.minute() / 60) % 12) * 30);
  protected readonly minuteAngle = computed(() => (this.minute() % 60) * 6);
  protected readonly digits = computed(() => {
    const [d, m, y] = this.dater();
    return [String(d).padStart(2, '0'), String(m).padStart(2, '0'), String(y)];
  });
  protected readonly scoreDigits = computed(() =>
    String(Math.abs(Math.round(this.score())))
      .padStart(6, '0')
      .slice(-6)
      .split(''),
  );
  protected readonly rulesLines = computed(() =>
    Array.from({ length: this.regles() + 2 }, (_, i) => i),
  );
  protected readonly dayName = computed(
    () => ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'][this.jour() - 1],
  );
  protected readonly dayNum = computed(() => 4 + this.jour());

  protected inHand(id: string): boolean {
    const t = this.tool();
    return (
      (t.k === 'stylo' && t.ink === id) ||
      (t.k === 'loupe' && id === 'loupe') ||
      (t.k === 'tampon' && t.id === id)
    );
  }
  protected slotOf(id: StampId) {
    return stampSlot(id);
  }
  protected label(id: StampId): string {
    return STAMP_LABEL[id];
  }
  protected charges(id: StampId): number {
    this.inkRev();
    return this.stamps()[id].charges;
  }
  protected inkOf(id: StampId): string {
    this.inkRev();
    return INK_COLOR[this.stamps()[id].ink];
  }
  protected color(ink: (typeof INKS)[number]): string {
    return INK_COLOR[ink];
  }
  protected well(ink: (typeof INKS)[number]) {
    return inkWell(ink);
  }
  protected wheel(i: number) {
    return daterWheel(i as 0 | 1 | 2);
  }
}
