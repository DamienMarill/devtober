import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { CONFIG } from './config';
import { Report, clock } from './score';

/**
 * Le bilan de fin de service : la note face au fantôme, le titre, les chiffres, chaque imprévu (tes pertes contre
 * les siennes) et la journée heure par heure.
 */
@Component({
  selector: 'app-swarm-report',
  imports: [DecimalPipe],
  host: { class: 'block' },
  template: `
    @let r = report();
    <p class="text-sky font-display text-sm font-semibold">
      Fin de service · 0 h 30
      @if (seed() !== null) {
        <span class="text-muted-foreground font-normal">· journée n° {{ seed() }}</span>
      }
    </p>
    <p class="note font-display">
      {{ r.note | number: '1.0-1' }}<span class="text-muted-foreground">/20</span>
    </p>
    <p class="title">{{ r.title }}</p>

    <p class="versus">
      <span
        >Toi <b>{{ r.points | number }}</b> pts</span
      >
      <span class="text-muted-foreground">·</span>
      <span
        >Fantôme <b>{{ r.ghostPoints | number }}</b> pts</span
      >
      <span [class.good]="r.points >= r.ghostPoints" [class.bad]="r.points < r.ghostPoints">
        ({{ r.points - r.ghostPoints > 0 ? '+' : '' }}{{ r.points - r.ghostPoints | number }})
      </span>
    </p>

    @if (r.incidents.length) {
      <table class="incidents">
        <caption>
          Pertes pendant chaque imprévu, sur tout le réseau (abandons ×3 + retards)
        </caption>
        <thead>
          <tr>
            <th scope="col">Imprévu</th>
            <th scope="col">Toi</th>
            <th scope="col">Fantôme</th>
          </tr>
        </thead>
        <tbody>
          @for (i of r.incidents; track $index) {
            <tr>
              <th scope="row">
                <span class="text-muted-foreground font-mono">{{ at(i.at) }}</span> {{ i.title }}
              </th>
              <td [class.good]="i.player <= i.ghost" [class.bad]="i.player > i.ghost">
                {{ i.player | number }}
              </td>
              <td>{{ i.ghost | number }}</td>
            </tr>
          }
        </tbody>
      </table>
    }

    <dl class="stats">
      <div>
        <dt>Arrivés en tram</dt>
        <dd>
          {{ r.served | number }} <small>({{ r.share * 100 | number: '1.0-1' }} %)</small>
        </dd>
      </div>
      <div>
        <dt>Abandons</dt>
        <dd>{{ r.lost | number }}</dd>
      </div>
      <div>
        <dt>Attente moyenne</dt>
        <dd>{{ r.wait | number: '1.0-1' }} min</dd>
      </div>
      <div>
        <dt>Pire station</dt>
        <dd>{{ r.worst ? r.worst.station : 'aucune' }}</dd>
      </div>
      <div>
        <dt>Pic de foule</dt>
        <dd>{{ r.peak.count | number }} à {{ r.peak.station }}, {{ at(r.peak.at) }}</dd>
      </div>
      <div>
        <dt>Arrivés à pied</dt>
        <dd>{{ r.walked | number }}</dd>
      </div>
    </dl>

    <svg
      class="chart"
      [attr.viewBox]="'0 0 ' + hours().length * 10 + ' 48'"
      preserveAspectRatio="none"
      aria-label="Voyageurs servis et perdus, heure par heure"
      role="img"
    >
      @for (h of hours(); track h.hour; let i = $index) {
        <rect
          [attr.x]="i * 10 + 1"
          [attr.y]="46 - h.served"
          width="8"
          [attr.height]="h.served"
          rx="1.5"
          fill="#92d9ff"
          opacity="0.85"
        />
        <rect
          [attr.x]="i * 10 + 1"
          [attr.y]="46 - h.served - h.lost"
          width="8"
          [attr.height]="h.lost"
          rx="1.5"
          fill="#ff4d5e"
        />
      }
    </svg>
    <p class="axis"><span>6 h</span><span>12 h</span><span>18 h</span><span>0 h</span></p>

    <div class="actions">
      <button type="button" class="primary" (click)="replay.emit()">Nouvelle journée</button>
      <button type="button" class="ghost" (click)="retry.emit()">Rejouer celle-ci</button>
      <button type="button" class="ghost" (click)="demo.emit()">Voir la démo</button>
    </div>
  `,
  styles: `
    .note {
      font-size: 3.4rem;
      line-height: 1;
      font-weight: 800;
      color: white;
      margin-top: 0.3rem;
    }
    .note span {
      font-size: 1.4rem;
      font-weight: 600;
    }
    .title {
      margin-top: 0.5rem;
      color: var(--card-foreground);
      text-wrap: pretty;
    }
    .versus {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.6rem;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
    .versus b {
      color: white;
    }
    .good {
      color: #6ee7a8;
    }
    .bad {
      color: #ffb3bb;
    }
    .incidents {
      width: 100%;
      margin-top: 0.9rem;
      font-size: 0.78rem;
      font-variant-numeric: tabular-nums;
      border-collapse: collapse;
    }
    .incidents caption {
      text-align: left;
      color: var(--muted-foreground);
      margin-bottom: 0.25rem;
    }
    .incidents th,
    .incidents td {
      padding: 0.15rem 0.3rem;
      text-align: right;
      border-bottom: 1px solid rgb(255 255 255 / 0.06);
    }
    .incidents th[scope='row'],
    .incidents thead th:first-child {
      text-align: left;
      font-weight: 400;
    }
    .incidents thead th {
      color: var(--muted-foreground);
      font-weight: 600;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.6rem 1rem;
      margin-top: 1rem;
      font-size: 0.8rem;
    }
    dt {
      color: var(--muted-foreground);
    }
    dd {
      color: white;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    dd small {
      color: var(--muted-foreground);
      font-weight: 400;
    }
    .chart {
      width: 100%;
      height: 3.5rem;
      margin-top: 1rem;
    }
    .axis {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--muted-foreground);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    button {
      padding: 0.5rem 0.9rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .primary {
      background: var(--primary);
      color: var(--primary-foreground);
    }
    .ghost {
      border: 1px solid rgb(255 255 255 / 0.2);
      color: white;
    }
  `,
})
export class DayReport {
  readonly report = input.required<Report>();
  /** Numéro de la journée (la graine), pour la rejouer avec `?seed=`. */
  readonly seed = input<number | null>(null);
  readonly replay = output<void>();
  readonly retry = output<void>();
  readonly demo = output<void>();

  protected at = clock;

  /** Barres de 6 h à 0 h, à l'échelle de l'heure la plus chargée (46 unités de haut). */
  protected readonly hours = computed(() => {
    const r = this.report();
    const first = Math.floor(CONFIG.day.start / 60);
    const last = Math.floor(CONFIG.day.end / 60);
    const list = [];
    for (let h = first; h <= last; h++) {
      list.push({ hour: h, served: r.servedByHour[h], lost: r.lostByHour[h] });
    }
    const max = Math.max(1, ...list.map((h) => h.served + h.lost));
    return list.map((h) => ({
      hour: h.hour,
      served: (h.served / max) * 44,
      lost: (h.lost / max) * 44,
    }));
  });
}
