import { Component, input, output } from '@angular/core';

/** Une ligne du panneau de régulation, telle que le composant du jour la publie ~10 fois par seconde. */
export interface LineRow {
  id: number;
  /** Couleurs officielles (pastille), et couleur d'affichage sur la carte. */
  color: string;
  text: string;
  name: string;
  /** Rames en ligne (sorties de dépôt comprises), dont `incoming` pas encore arrivées. */
  active: number;
  incoming: number;
  retiring: number;
  /** Voyageurs à quai pour cette ligne, et leur attente moyenne en minutes. */
  waiting: number;
  wait: number;
  /** 0 : fluide, 1 : tendu, 2 : saturé. */
  level: 0 | 1 | 2;
  /** Itinéraire bis possible sur cette ligne (la 1 via Pompignane), et s'il est en service. */
  deviation: { id: string; label: string; on: boolean } | null;
}

/** Le panneau des lignes : une pastille par ligne, ses rames, sa foule, et les boutons − / +. */
@Component({
  selector: 'app-swarm-fleet',
  host: { class: 'block' },
  template: `
    <ul class="rows" aria-label="Rames par ligne">
      @for (row of rows(); track row.id) {
        <li class="row" [class.selected]="row.id === selected()" [attr.data-level]="row.level">
          <button
            type="button"
            class="pick"
            [attr.aria-pressed]="row.id === selected()"
            [attr.aria-label]="'Ligne ' + row.id + ' : ' + row.name"
            (click)="pick.emit(row.id)"
          >
            <span class="badge" [style.background]="row.color" [style.color]="row.text">{{
              row.id
            }}</span>
            <span class="name">{{ row.name }}</span>
          </button>
          <span class="count" [attr.aria-label]="row.active + ' rames'">
            {{ row.active }}
            @if (row.incoming) {
              <small class="text-sky">+{{ row.incoming }}</small>
            }
            @if (row.retiring) {
              <small class="text-muted-foreground">−{{ row.retiring }}</small>
            }
          </span>
          <span class="crowd" [title]="'Attente moyenne ' + row.wait.toFixed(0) + ' min'">
            <span class="dot"></span>{{ row.waiting }}
          </span>
          <span class="buttons">
            @if (row.deviation; as dev) {
              <button
                type="button"
                class="step dev"
                [class.on]="dev.on"
                [attr.aria-pressed]="dev.on"
                [attr.aria-label]="'Itinéraire bis de la ligne ' + row.id + ' ' + dev.label"
                [title]="'Itinéraire bis ' + dev.label"
                (click)="deviate.emit(dev.id)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 13V8a4 4 0 0 1 4-4h5m0 0-2.5-2.5M12 4l-2.5 2.5"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            }
            <button
              type="button"
              class="step"
              [attr.aria-label]="'Retirer une rame de la ligne ' + row.id"
              (click)="remove.emit(row.id)"
            >
              −
            </button>
            <button
              type="button"
              class="step"
              [attr.aria-label]="'Ajouter une rame à la ligne ' + row.id"
              (click)="add.emit(row.id)"
            >
              +
            </button>
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    /* Par défaut (portrait, carré) : une colonne par ligne, sous la carte. */
    .rows {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.35rem;
    }
    .row {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'pick count'
        'buttons buttons';
      align-items: center;
      gap: 0.2rem 0.35rem;
      padding: 0.3rem;
      border-radius: 0.6rem;
      border: 1px solid rgb(255 255 255 / 0.08);
      transition: background 0.2s;
    }
    .row.selected {
      background: rgb(255 255 255 / 0.1);
      border-color: rgb(255 255 255 / 0.3);
    }
    .pick {
      grid-area: pick;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      text-align: left;
      cursor: pointer;
    }
    .badge {
      display: grid;
      place-items: center;
      width: 1.6rem;
      height: 1.6rem;
      flex-shrink: 0;
      border-radius: 0.4rem;
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 0.95rem;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.25);
    }
    .name {
      display: none;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.75rem;
      color: var(--muted-foreground);
    }
    .count {
      grid-area: count;
      text-align: right;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 1.05rem;
      font-weight: 700;
      color: white;
      white-space: nowrap;
    }
    .count small {
      font-size: 0.65rem;
      margin-left: 0.1rem;
    }
    .crowd {
      grid-area: crowd;
      display: none;
      align-items: center;
      gap: 0.3rem;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 0.75rem;
      color: var(--muted-foreground);
    }
    .crowd .dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 9999px;
      background: #4ade80;
    }
    [data-level='1'] .crowd .dot {
      background: #fbbf24;
    }
    [data-level='2'] .crowd .dot {
      background: #ff4d5e;
      box-shadow: 0 0 6px #ff4d5e;
    }
    [data-level='2'] .crowd {
      color: #ffb3bb;
    }
    /* Sans la colonne « foule », la pastille dit l'état de la ligne. */
    [data-level='1'] .badge {
      box-shadow: 0 0 0 2px #fbbf24;
    }
    [data-level='2'] .badge {
      box-shadow:
        0 0 0 2px #ff4d5e,
        0 0 8px #ff4d5e;
    }
    @container (min-width: 600px) {
      .row {
        grid-template-columns: auto 1fr auto;
        grid-template-areas:
          'pick crowd count'
          'buttons buttons buttons';
      }
      .crowd {
        display: flex;
        justify-content: flex-end;
      }
    }
    .buttons {
      grid-area: buttons;
      display: flex;
      gap: 0.25rem;
    }
    .step {
      flex: 1;
      height: 1.9rem;
      min-width: 1.75rem;
      border-radius: 0.45rem;
      border: 1px solid rgb(255 255 255 / 0.16);
      background: rgb(255 255 255 / 0.06);
      color: white;
      font-size: 1.05rem;
      line-height: 1;
      cursor: pointer;
      transition: background 0.15s;
    }
    .step:hover {
      background: rgb(255 255 255 / 0.16);
    }
    /* En colonnes étroites, l'itinéraire bis passe par le popover des stations concernées. */
    .step.dev {
      display: none;
      place-items: center;
    }
    .step.dev svg {
      width: 0.9rem;
      height: 0.9rem;
    }
    .step.dev.on {
      background: var(--primary);
      border-color: transparent;
    }
    .step:active {
      transform: translateY(1px);
    }

    /* Panneau latéral (paysage) : une ligne par ligne de tram, avec son nom. */
    @container (min-aspect-ratio: 5/4) and (min-width: 820px) {
      .rows {
        grid-template-columns: 1fr;
        gap: 0.3rem;
      }
      .row {
        grid-template-columns: minmax(0, 1fr) auto 3.6rem auto;
        grid-template-areas: 'pick count crowd buttons';
        gap: 0.5rem;
        padding: 0.25rem 0.35rem;
        border-color: transparent;
      }
      .row.selected {
        border-color: rgb(255 255 255 / 0.18);
      }
      .name {
        display: block;
      }
      .crowd {
        display: flex;
        justify-content: flex-end;
      }
      [data-level] .badge {
        box-shadow: 0 0 0 1px rgb(255 255 255 / 0.25);
      }
      .step {
        flex: none;
        width: 1.75rem;
        height: 1.75rem;
      }
      .step.dev {
        display: grid;
      }
    }
  `,
})
export class FleetPanel {
  readonly rows = input.required<readonly LineRow[]>();
  readonly selected = input<number | null>(null);
  readonly pick = output<number>();
  readonly add = output<number>();
  readonly remove = output<number>();
  readonly deviate = output<string>();
}
