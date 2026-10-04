import { afterNextRender, Component, computed, input, signal } from '@angular/core';
import { CRITERES, CRITERE_LABELS, Critere, Kilometrage } from './lib/awards';

const CX = 100;
const CY = 100;
const RADIUS = 78;
/** Le cadran couvre 240° : de -120° (0) à +120° (10), l'aiguille à la verticale marque 5. */
const SWEEP = 240;

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};

/** Arc de cercle entre deux valeurs de 0 à 10. */
function arc(from: number, to: number, r = RADIUS): string {
  const a = -SWEEP / 2 + (SWEEP * from) / 10;
  const b = -SWEEP / 2 + (SWEEP * to) / 10;
  const [x0, y0] = polar(a, r);
  const [x1, y1] = polar(b, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Le « kilométrage » : la note sur 10 d'un dérapage, en compteur de vitesse. En grand (`lg`), le
 * détail des cinq critères s'affiche dessous, avec le barème en infobulle.
 */
@Component({
  selector: 'app-odometer',
  host: { class: 'block' },
  styles: `
    .needle {
      transition: transform 1.6s cubic-bezier(0.2, 1.25, 0.35, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .needle {
        transition: none;
      }
    }
  `,
  template: `
    <svg
      viewBox="0 0 200 150"
      class="mx-auto block w-full text-(--gold)"
      role="img"
      [attr.aria-label]="'Kilométrage : ' + km().note + ' sur 10'"
    >
      <path [attr.d]="track" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="7" stroke-linecap="round" />
      <path [attr.d]="filled()" fill="none" [attr.stroke]="hot() ? 'var(--flame)' : 'currentColor'" stroke-width="7" stroke-linecap="round" />
      @for (tick of ticks; track tick.v) {
        <line
          [attr.x1]="tick.x1"
          [attr.y1]="tick.y1"
          [attr.x2]="tick.x2"
          [attr.y2]="tick.y2"
          stroke="currentColor"
          [attr.stroke-opacity]="tick.major ? 0.9 : 0.35"
          [attr.stroke-width]="tick.major ? 1.6 : 1"
        />
        @if (tick.major && size() === 'lg') {
          <text [attr.x]="tick.tx" [attr.y]="tick.ty" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="currentColor" fill-opacity=".8">
            {{ tick.v }}
          </text>
        }
      }
      <g class="needle" [style.transform]="'rotate(' + angle() + 'deg)'" style="transform-origin: 100px 100px">
        <path d="M98.2 100L100 32l1.8 68z" [attr.fill]="hot() ? 'var(--flame)' : '#fff1c2'" />
      </g>
      <circle cx="100" cy="100" r="7" fill="#0b0907" stroke="currentColor" stroke-width="2" />
      <text
        x="100"
        y="136"
        text-anchor="middle"
        font-size="30"
        font-weight="700"
        fill="#f3ead8"
        style="font-family: var(--gala)"
      >
        {{ km().note }}<tspan font-size="12" fill-opacity=".6">/10</tspan>
      </text>
    </svg>

    @if (size() === 'lg') {
      <ul class="mx-auto mt-3 grid max-w-72 gap-1.5 text-[0.7rem] tracking-[0.14em] text-(--ivory)/70 uppercase">
        @for (c of criteres; track c.key) {
          <li class="flex items-center justify-between gap-3" [attr.title]="bareme()?.[c.key]">
            <span>{{ c.label }}</span>
            <span class="flex gap-1" [attr.aria-label]="km().detail[c.key] + ' sur 2'">
              @for (pip of [1, 2]; track pip) {
                <span
                  class="size-2.5 rotate-45 border border-(--gold)"
                  [class]="km().detail[c.key] >= pip ? 'bg-(--gold)' : ''"
                ></span>
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class Odometer {
  readonly km = input.required<Kilometrage>();
  readonly size = input<'lg' | 'sm'>('sm');
  /** Barème de chaque critère (infobulles). */
  readonly bareme = input<Record<Critere, string> | null>(null);

  protected readonly criteres = CRITERES.map((key) => ({ key, label: CRITERE_LABELS[key] }));
  protected readonly track = arc(0, 10);
  protected readonly ticks = Array.from({ length: 21 }, (_, i) => {
    const v = i / 2;
    const major = i % 2 === 0;
    const deg = -SWEEP / 2 + (SWEEP * v) / 10;
    const [x1, y1] = polar(deg, RADIUS - (major ? 14 : 10));
    const [x2, y2] = polar(deg, RADIUS - 5);
    const [tx, ty] = polar(deg, RADIUS - 24);
    return { v, major, x1, y1, x2, y2, tx, ty };
  });

  /** Faux jusqu'au premier affichage, pour que l'aiguille parte de zéro et monte. */
  private readonly shown = signal(false);
  protected readonly angle = computed(() => (this.shown() ? this.km().note - 5 : -5) * (SWEEP / 10));
  protected readonly filled = computed(() => arc(0, Math.max(0.01, this.km().note)));
  protected readonly hot = computed(() => this.km().note >= 8);

  constructor() {
    afterNextRender(() => setTimeout(() => this.shown.set(true), 120));
  }
}
