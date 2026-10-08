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
      <g [attr.transform]="'translate(' + (R.horloge.x + 46) + ' ' + (R.horloge.y + 46) + ')'">
        <circle r="44" fill="#efe9da" stroke="#3d3a33" stroke-width="5" />
        @for (i of twelve; track i) {
          <line
            y1="-38"
            y2="-33"
            stroke="#3d3a33"
            stroke-width="2"
            [attr.transform]="'rotate(' + i * 30 + ')'"
          />
        }
        <line
          y1="4"
          y2="-22"
          stroke="#24221f"
          stroke-width="4"
          stroke-linecap="round"
          [attr.transform]="'rotate(' + hourAngle() + ')'"
        />
        <line
          y1="6"
          y2="-33"
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
        <rect x="10" y="10" width="112" height="88" fill="#efe9da" transform="rotate(-2 66 54)" />
        <text x="18" y="26" class="memo-t" transform="rotate(-2 66 54)">NOTE DE SERVICE</text>
        <text x="18" y="38" class="memo-t" transform="rotate(-2 66 54)">n° {{ note() }}</text>
        @for (i of [0, 1, 2, 3, 4]; track i) {
          <line
            x1="18"
            [attr.x2]="104 - (i % 2) * 18"
            [attr.y1]="50 + i * 9"
            [attr.y2]="50 + i * 9"
            stroke="#8a8070"
            transform="rotate(-2 66 54)"
          />
        }
        <rect x="134" y="14" width="76" height="80" fill="#f3efe2" transform="rotate(3 172 54)" />
        <text x="140" y="28" class="memo-t" transform="rotate(3 172 54)">RÈGLES</text>
        @for (i of rulesLines(); track i) {
          <line
            x1="140"
            x2="200"
            [attr.y1]="38 + i * 9"
            [attr.y2]="38 + i * 9"
            stroke="#8a8070"
            transform="rotate(3 172 54)"
          />
        }
        <rect x="218" y="22" width="44" height="40" fill="#f1e27a" transform="rotate(-6 240 42)" />
        <circle cx="66" cy="14" r="4" fill="#b3261e" />
        <circle cx="172" cy="16" r="4" fill="#1f4fa3" />
        <circle cx="240" cy="24" r="3.5" fill="#2e7d32" />
        <text [attr.x]="R.memo.w / 2" [attr.y]="R.memo.h + 12" text-anchor="middle" class="hint">
          mémo : survoler pour lire
        </text>
      </g>

      <!-- Le pot à crayons : stylo bleu, stylo rouge, loupe. -->
      @for (item of potItems; track item.id) {
        <g [class.absent]="inHand(item.id)" [class.hot]="hover() === 'pot'">
          @if (item.id === 'loupe') {
            <g
              [attr.transform]="
                'translate(' + (item.rect.x + 22) + ' ' + (item.rect.y + 34) + ') rotate(18)'
              "
            >
              <rect x="-4" y="16" width="8" height="66" rx="3" fill="#2d2a25" />
              <circle r="18" fill="#cfe0e8" fill-opacity="0.5" stroke="#5b5d60" stroke-width="5" />
            </g>
          } @else {
            <g
              [attr.transform]="
                'translate(' +
                (item.rect.x + 16) +
                ' ' +
                (item.rect.y + 6) +
                ') rotate(' +
                (item.id === 'bleu' ? -6 : 5) +
                ')'
              "
            >
              <rect x="-5" y="0" width="10" height="108" rx="4" fill="#ece6d8" stroke="#8c8270" />
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
      <text
        [attr.x]="R.pot.x + R.pot.w / 2"
        [attr.y]="R.pot.y + R.pot.h + 2"
        text-anchor="middle"
        class="hint"
      >
        pot à crayons
      </text>

      <!-- Le carrousel de tampons. -->
      @for (id of stampIds; track id) {
        @let slot = slotOf(id);
        <g [class.absent]="inHand(id)" [class.hot]="hover() === 'tampon'">
          <ellipse
            [attr.cx]="slot.x + slot.w / 2"
            [attr.cy]="slot.y + 16"
            rx="15"
            ry="13"
            fill="#2b1f15"
          />
          <ellipse
            [attr.cx]="slot.x + slot.w / 2"
            [attr.cy]="slot.y + 13"
            rx="13"
            ry="11"
            fill="#7a4b2a"
          />
          <rect
            [attr.x]="slot.x + slot.w / 2 - 5"
            [attr.y]="slot.y + 24"
            width="10"
            height="20"
            fill="#5a3a20"
          />
          <rect
            [attr.x]="slot.x + 2"
            [attr.y]="slot.y + 44"
            [attr.width]="slot.w - 4"
            height="26"
            rx="3"
            fill="#c9c2b0"
            stroke="#3a3530"
          />
          <text
            [attr.x]="slot.x + slot.w / 2"
            [attr.y]="slot.y + 61"
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
              [attr.cx]="slot.x + slot.w / 2 - 8 + k * 8"
              [attr.cy]="slot.y + 75"
              r="2.4"
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
      <text x="482" y="711" text-anchor="middle" class="hint clair">encreur</text>

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
        <text [attr.x]="w.x + w.w / 2" [attr.y]="w.y + 28" text-anchor="middle" class="molette">
          {{ digits()[i] }}
        </text>
      }
      <text x="649" y="711" text-anchor="middle" class="hint clair">
        dateur REÇU LE {{ dateurActif() ? '(clic +1, clic droit −1)' : '(réglé par le service)' }}
      </text>

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
          <rect [attr.x]="10 + $index * 26" y="9" width="22" height="34" rx="2" fill="#ece6d8" />
          <text
            [attr.x]="21 + $index * 26"
            y="35"
            text-anchor="middle"
            class="rouleau"
            [class.neg]="score() < 0"
          >
            {{ d }}
          </text>
        }
        <text [attr.x]="R.compteur.w / 2" y="52" text-anchor="middle" class="hint clair">
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
        <rect [attr.width]="R.calendrier.w" height="16" rx="3" fill="#b3261e" />
        <text [attr.x]="R.calendrier.w / 2" y="12" text-anchor="middle" class="eph-t">
          {{ dayName() }}
        </text>
        <text [attr.x]="R.calendrier.w / 2" y="48" text-anchor="middle" class="eph">
          {{ dayNum() }}
        </text>
        <text [attr.x]="R.calendrier.w / 2" y="62" text-anchor="middle" class="eph-t sombre">
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
        9px 'Barlow Condensed',
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
        8px 'Special Elite',
        monospace;
      fill: #2d2a25;
    }
    .manche {
      font:
        8.5px 'Allerta Stencil',
        sans-serif;
      fill: #24221f;
    }
    .molette {
      font:
        20px 'Special Elite',
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
        700 32px 'Barlow Condensed',
        sans-serif;
      fill: #24221f;
    }
    .eph-t {
      font:
        700 9px 'Barlow Condensed',
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
