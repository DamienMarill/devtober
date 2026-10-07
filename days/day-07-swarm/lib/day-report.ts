import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { CONFIG } from './config';
import { Report, clock } from './score';

/** Le bilan de fin de service : la note, le titre, les chiffres et la journée heure par heure. */
@Component({
  selector: 'app-swarm-report',
  imports: [DecimalPipe],
  host: { class: 'block' },
  template: `
    @let r = report();
    <p class="text-sky font-display text-sm font-semibold">Fin de service · 0 h 30</p>
    <p class="note font-display">
      {{ r.note | number: '1.0-1' }}<span class="text-muted-foreground">/20</span>
    </p>
    <p class="title">{{ r.title }}</p>

    <dl class="stats">
      <div>
        <dt>Voyageurs servis</dt>
        <dd>
          {{ r.served | number }} <small>({{ r.share * 100 | number: '1.0-1' }} %)</small>
        </dd>
      </div>
      <div>
        <dt>Partis à pied</dt>
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
        <dd>{{ r.peak.count | number }} à {{ r.peak.station }}, {{ peakAt() }}</dd>
      </div>
      <div>
        <dt>Pilote automatique</dt>
        <dd>
          @if (benchmark(); as b) {
            {{ b | number: '1.0-1' }}/20
          } @else {
            calcul…
          }
        </dd>
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
      <button type="button" class="primary" (click)="replay.emit()">Reprendre le service</button>
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
  /** La note du pilote automatique sur la même journée (null pendant le calcul). */
  readonly benchmark = input<number | null>(null);
  readonly replay = output<void>();
  readonly demo = output<void>();

  protected readonly peakAt = computed(() => clock(this.report().peak.at));

  /** Barres de 6 h à 0 h, à l'échelle de l'heure la plus chargée (46 unités de haut). */
  protected readonly hours = computed(() => {
    const r = this.report();
    const first = Math.floor(CONFIG.day.start / 60);
    const last = Math.floor(CONFIG.day.end / 60);
    const list = [];
    for (let h = first; h <= last; h++)
      list.push({ hour: h, served: r.servedByHour[h], lost: r.lostByHour[h] });
    const max = Math.max(1, ...list.map((h) => h.served + h.lost));
    return list.map((h) => ({
      hour: h.hour,
      served: (h.served / max) * 44,
      lost: (h.lost / max) * 44,
    }));
  });
}
