import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CONFIG } from './config';
import { PILE } from './scene';

export interface Slab {
  id: string;
  units: number;
  couleur: string;
  encre: string;
  picto: string;
  numero: string;
  urgent: boolean;
  gommettes: number;
  /** Vient d'arriver : il tombe sur la pile. */
  frais: boolean;
}

/**
 * La pile Arrivée : la seule jauge de danger. Un objet physique, des chemises empilées qui montent, penchent
 * au-delà de la ligne rouge, puis s'effondrent.
 */
@Component({
  selector: 'maze-pile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pile', '[class.effondree]': 'effondree()', '[style.--amp]': 'amp()' },
  template: `
    <div class="tas" [class.penche]="amp() !== '0deg'">
      @for (s of placed(); track s.slab.id) {
        <div
          class="chemise"
          [class.frais]="s.slab.frais"
          [class.dessus]="$last"
          [style.bottom.px]="s.bottom"
          [style.height.px]="s.height"
          [style.background-color]="s.slab.couleur"
          [style.color]="s.slab.encre"
          [style.--i]="$index"
          [style.--dx.px]="s.dx"
        >
          <span class="feuilles"></span>
          <span class="etiquette">{{ s.slab.picto }} {{ s.slab.numero }}</span>
          @if (s.slab.urgent) {
            <span class="ruban"></span>
          }
          @for (g of dots(s.slab.gommettes); track g) {
            <span class="gommette" [style.right.px]="10 + g * 12"></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      left: 0;
      top: 0;
      width: 260px;
      height: 720px;
      pointer-events: none;
    }
    .tas {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 72px;
      transform-origin: 50% 100%;
    }
    .penche {
      animation: penche 2.6s ease-in-out infinite alternate;
    }
    @keyframes penche {
      from {
        transform: rotate(calc(var(--amp) * -0.4));
      }
      to {
        transform: rotate(var(--amp));
      }
    }
    .chemise {
      position: absolute;
      left: calc(46px + var(--dx));
      width: 170px;
      border-radius: 3px 5px 4px 3px;
      box-shadow:
        inset 0 -3px 0 rgba(0, 0, 0, 0.18),
        0 2px 4px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    :host-context(.pile-hot) .dessus {
      outline: 2px solid rgba(255, 236, 160, 0.9);
    }
    .feuilles {
      position: absolute;
      left: 6px;
      right: 4px;
      top: 4px;
      bottom: 6px;
      background: repeating-linear-gradient(#efe9da 0 3px, #cfc6b3 3px 4px);
      opacity: 0.85;
      clip-path: polygon(0 0, 100% 0, 98% 100%, 2% 100%);
    }
    .etiquette {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      padding: 1px 6px;
      background: #f3ede0;
      color: #2d2a25;
      font:
        600 10px/14px 'Barlow Condensed',
        sans-serif;
      border-radius: 2px;
      white-space: nowrap;
    }
    .ruban {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 46px;
      width: 9px;
      background: #c0261e;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
    }
    .gommette {
      position: absolute;
      top: 50%;
      width: 9px;
      height: 9px;
      margin-top: -4.5px;
      border-radius: 50%;
      background: #d62d20;
      box-shadow: 0 0 0 1px #f3ede0;
    }
    .frais {
      animation: tombe 380ms cubic-bezier(0.5, 0, 0.9, 0.6);
    }
    @keyframes tombe {
      from {
        transform: translateY(-160px) rotate(-3deg);
        opacity: 0.4;
      }
    }
    :host(.effondree) .chemise {
      animation: avalanche 1.3s cubic-bezier(0.3, 0.1, 0.6, 1) forwards;
      animation-delay: calc(var(--i) * -40ms);
    }
    @keyframes avalanche {
      to {
        transform: translate(calc(180px + var(--i) * 46px), calc(var(--i) * 28px + 120px))
          rotate(calc(var(--i) * 37deg - 40deg));
        opacity: 0.9;
      }
    }
  `,
})
export class MazePile {
  readonly slabs = input<readonly Slab[]>([]);
  readonly effondree = input(false);

  protected readonly placed = computed(() => {
    let units = 0;
    return this.slabs().map((slab, i) => {
      const bottom = units * PILE.unit;
      units += slab.units;
      // Les chemises ne sont jamais parfaitement alignées.
      const dx = ((i * 37) % 13) - 6;
      return { slab, bottom, height: slab.units * PILE.unit - 3, dx };
    });
  });

  /** L'oscillation : de 1° à 4° entre la ligne de danger et la capacité. */
  protected readonly amp = computed(() => {
    const h = this.slabs().reduce((s, x) => s + x.units, 0);
    const { danger, capacite } = CONFIG.pile;
    if (h <= danger) return '0deg';
    return `${(1 + (3 * (h - danger)) / (capacite - danger)).toFixed(2)}deg`;
  });

  protected dots(n: number): number[] {
    return Array.from({ length: Math.min(3, n) }, (_, i) => i);
  }
}
