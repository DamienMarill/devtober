import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { Bell } from './lib/audio';
import { Bot, responder } from './lib/bots';
import { CONFIG } from './lib/config';
import { DayReport } from './lib/day-report';
import { Demand } from './lib/demand';
import { DEVIATIONS } from './lib/deviations';
import { Duel } from './lib/duel';
import { Feed, FeedItem } from './lib/feed';
import { FleetPanel, LineRow } from './lib/fleet-panel';
import { ActiveIncident, IncidentEngine, IncidentKind, drawDay } from './lib/incidents';
import { buildNetwork } from './lib/network';
import { parseOptions } from './lib/options';
import { Renderer } from './lib/render';
import { Report, clock, makeReport } from './lib/score';
import { Sim, Tram, TramOrderKind } from './lib/sim';
import { Swarm } from './lib/swarm';

/** intro : briefing (la démo tourne derrière) · play : le joueur régule · demo : touche T · report : bilan. */
type Mode = 'intro' | 'play' | 'demo' | 'report';

interface IncidentChip {
  id: string;
  glyph: string;
  title: string;
  place: string;
  station: number | null;
}

interface Hud {
  time: number;
  rows: LineRow[];
  depot: number;
  incoming: number;
  served: number;
  lost: number;
  points: number;
  ghost: number;
  incidents: IncidentChip[];
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  lines: { id: number; color: string; text: string; waiting: number; wait: number }[];
  lost: number;
  hint: string | null;
}

type Target = { kind: 'station'; id: number } | { kind: 'tram'; id: number };

interface PopAction {
  key: string;
  label: string;
  hint: string;
  on: boolean;
  /** La raison d'un refus (le bouton est alors grisé). */
  disabled: string | null;
}

/** Le popover d'une station ou d'une rame, recalculé ~10 fois par seconde tant qu'il est ouvert. */
interface Pop {
  kind: 'station' | 'tram';
  title: string;
  sub: string;
  lines: { id: number; color: string; text: string }[];
  status: { text: string; tone: 'alert' | 'info' }[];
  actions: PopAction[];
}

/** Le réseau ne change jamais : construit une fois, au premier affichage du jour. */
const NET = buildNetwork();
const DEMAND = new Demand(NET);
const NAME = (s: number) => NET.stations[s].name;
const LINE = (id: number) => NET.lines.find((l) => l.id === id)!;

/** Voisins physiques de chaque station (pour couper un tronçon depuis le popover). */
const NEIGHBOURS: number[][] = NET.stations.map(() => []);
for (const key of NET.hops.keys()) {
  const [a, b] = key.split('-').map(Number);
  if (!NEIGHBOURS[a].includes(b)) NEIGHBOURS[a].push(b);
  if (!NEIGHBOURS[b].includes(a)) NEIGHBOURS[b].push(a);
}

/**
 * La démo (touche T) : la journée n° 12, de 15 h 35 à ~19 h 35 à ×2. Une manif part de la Comédie à 15 h 47 et
 * une voiture bloque la 1 vers Château d'Ô à 16 h 03 ; le régulateur automatique dévie la 1 par Pompignane et
 * coupe le tronçon.
 */
const DEMO = { seed: 12, start: 15 * 60 + 35, speed: 1 };
/** Derrière le briefing : la pointe du matin, même journée. */
const ATTRACT = { seed: 12, start: 7 * 60 + 25, speed: 0 };
const SPEED_LABELS = ['×1', '×2', '×4'];

const GLYPHS: Record<IncidentKind, string> = {
  car: '🚗',
  scooter: '🛴',
  illness: '✚',
  breakdown: '🔧',
  power: '⚡',
  package: '📦',
  cortege: '✊',
  rain: '🌧',
  strike: '✋',
};

const ORDERS: Record<TramOrderKind, { label: string; hint: (at: string) => string }> = {
  hold: { label: 'Retenir 2 min', hint: (at) => `à ${at}` },
  turnBack: { label: 'Demi-tour', hint: (at) => `à ${at}, tout le monde descend` },
  deadhead: { label: 'Haut-le-pied', hint: (at) => `à vide après ${at}, sans arrêt` },
  deviate: { label: 'Dévier via Pompignane', hint: () => 'cette course seulement' },
  depot: { label: 'Rentrer au dépôt', hint: (at) => `après ${at}` },
};

/** Les stations d'où l'on peut basculer un itinéraire bis : le tronçon évité, ses deux bouts et le détour. */
const DEVIATION_AT = DEVIATIONS.map((dev) => {
  const ids = LINE(dev.line).paths[0].stations;
  const a = ids.indexOf(NET.byId.get(dev.from)!);
  const b = ids.indexOf(NET.byId.get(dev.to)!);
  const via = dev.via.map((id) => NET.byId.get(id)!);
  return { dev, stations: new Set([...ids.slice(Math.min(a, b), Math.max(a, b) + 1), ...via]) };
});

const randomSeed = () => 1000 + Math.floor(Math.random() * 9000);
const hhmm = (m: number) =>
  `${Math.floor(m / 60) % 24} h ${String(Math.floor(m % 60)).padStart(2, '0')}`;
/** Durée restante arrondie aux 5 minutes : le PC n'a qu'une estimation. */
const eta = (minutes: number) =>
  minutes <= 2 ? 'fin imminente' : `fin estimée dans ~${Math.ceil(minutes / 5) * 5} min`;

@Component({
  selector: 'app-day-07-swarm',
  imports: [FleetPanel, DayReport, DecimalPipe],
  host: {
    class:
      'relative block size-full overflow-hidden select-none bg-[#0b0830] [container-type:size]',
    '(document:keydown)': 'onKeydown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <canvas
      #canvas
      class="absolute inset-0 size-full touch-none"
      [style.cursor]="cursor()"
      aria-label="Carte des 5 lignes de tram de Montpellier : rames, voyageurs à quai et imprévus"
      role="img"
      (pointermove)="onPointerMove($event)"
      (pointerdown)="onPointerDown($event)"
      (pointerleave)="clearHover()"
    ></canvas>

    <section #panel class="hud" aria-label="Poste de commande">
      <header class="top">
        <div class="clock-block">
          <p class="kicker text-sky font-display">PC tram · Montpellier</p>
          <p class="clock" aria-live="off">{{ clockText() }}</p>
          <p class="day text-muted-foreground">{{ dayLabel }} · n° {{ seed() }}</p>
        </div>
        <div class="controls">
          <button
            type="button"
            class="ctl"
            [attr.aria-label]="paused() ? 'Reprendre' : 'Pause'"
            (click)="togglePause()"
          >
            @if (paused()) {
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
              </svg>
            } @else {
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
                <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              </svg>
            }
          </button>
          @for (label of speedLabels; track label; let i = $index) {
            <button
              type="button"
              class="ctl speed"
              [class.on]="speed() === i"
              [attr.aria-pressed]="speed() === i"
              [attr.aria-label]="'Vitesse ' + label"
              (click)="setSpeed(i)"
            >
              {{ label }}
            </button>
          }
          <button
            type="button"
            class="ctl wide"
            [class.on]="auto()"
            [attr.aria-pressed]="auto()"
            title="Le pilote automatique répartit les rames entre les lignes ; les imprévus restent pour toi"
            (click)="toggleAuto()"
          >
            Pilote auto
          </button>
          <button
            type="button"
            class="ctl"
            [class.on]="sound()"
            [attr.aria-pressed]="sound()"
            [attr.aria-label]="sound() ? 'Couper le son' : 'Activer le son'"
            (click)="toggleSound()"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
              @if (sound()) {
                <path
                  d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"
                  stroke="currentColor"
                  stroke-width="1.4"
                  fill="none"
                  stroke-linecap="round"
                />
              } @else {
                <path
                  d="M10.5 6l4 4m0-4l-4 4"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              }
            </svg>
          </button>
        </div>
        <div
          class="score"
          title="+1 par voyageur arrivé, −3 par voyageur parti à pied, −1 par voyageur qui a attendu plus de 10 min. Le fantôme joue la même journée au pilote automatique."
        >
          <p class="pts">{{ hud().points | number }}<small> pts</small></p>
          <p class="vs" [class.good]="delta() >= 0" [class.bad]="delta() < 0">
            {{ delta() > 0 ? '+' : '' }}{{ delta() | number }}
            <span class="text-muted-foreground">sur le fantôme</span>
          </p>
          <p class="counts text-muted-foreground">
            {{ hud().served | number }} arrivés ·
            <span class="lost">{{ hud().lost | number }}</span> abandons
          </p>
        </div>
      </header>

      @if (hud().incidents.length) {
        <ul class="live" aria-label="Imprévus en cours">
          @for (c of hud().incidents; track c.id) {
            <li>
              <button
                type="button"
                [disabled]="c.station === null"
                [attr.aria-label]="c.title + ', ' + c.place"
                (click)="focusIncident(c)"
              >
                <span class="glyph" aria-hidden="true">{{ c.glyph }}</span>
                <b>{{ c.title }}</b>
                <span class="place">{{ c.place }}</span>
              </button>
            </li>
          }
        </ul>
      }

      <app-swarm-fleet
        [rows]="hud().rows"
        [selected]="selected()"
        (pick)="select($event)"
        (add)="addRame($event)"
        (remove)="removeRame($event)"
        (deviate)="toggleDeviation($event)"
      />

      <p class="depot text-muted-foreground">
        Dépôt : <b class="text-white">{{ hud().depot }}</b> rame{{ hud().depot > 1 ? 's' : '' }}
        @if (hud().incoming) {
          · <span class="text-sky">{{ hud().incoming }} en route</span>
        }
        <span class="legend">· 1 point = 10 voyageurs</span>
      </p>

      <ol class="feed" aria-live="polite" aria-label="Fil du PC">
        @for (item of feed(); track item.id) {
          <li [attr.data-tone]="item.tone">
            <time>{{ format(item.time) }}</time>
            <span>{{ item.text }}</span>
          </li>
        }
      </ol>

      <p class="keys text-muted-foreground">
        Clic sur une station ou une rame : agir · <kbd>1</kbd>–<kbd>5</kbd> ligne · <kbd>↑</kbd>
        <kbd>↓</kbd> une rame de plus ou de moins · <kbd>Espace</kbd> pause · <kbd>F</kbd> vitesse ·
        <kbd>A</kbd> pilote auto · <kbd>M</kbd> son · <kbd>T</kbd> démo · <kbd>R</kbd> recommencer
      </p>
    </section>

    @if (hoverInfo(); as h) {
      @if (!pop()) {
        <div class="tip" [style.left.px]="h.x" [style.top.px]="h.y" aria-hidden="true">
          <p class="font-semibold text-white">{{ h.name }}</p>
          @for (l of h.lines; track l.id) {
            <p class="tip-line">
              <span class="badge" [style.background]="l.color" [style.color]="l.text">{{
                l.id
              }}</span>
              {{ l.waiting | number }} à quai
              @if (l.waiting) {
                · {{ l.wait | number: '1.0-0' }} min
              }
            </p>
          }
          @if (h.lost) {
            <p class="text-[#ffb3bb]">{{ h.lost | number }} partis à pied</p>
          }
          @if (h.hint) {
            <p class="tip-hint">{{ h.hint }}</p>
          }
        </div>
      }
    }

    @if (pop(); as p) {
      <div
        #pop
        class="pop"
        role="dialog"
        [attr.aria-label]="p.title"
        [style.left.px]="popPos().left"
        [style.top.px]="popPos().top"
      >
        <header class="pop-head">
          @for (l of p.lines; track l.id) {
            <span class="badge" [style.background]="l.color" [style.color]="l.text">{{
              l.id
            }}</span>
          }
          <p class="pop-title">{{ p.title }}</p>
          <button type="button" class="close" aria-label="Fermer" (click)="closePop()">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8m0-8l-8 8"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>
        @if (p.sub) {
          <p class="pop-sub text-muted-foreground">{{ p.sub }}</p>
        }
        @for (s of p.status; track $index) {
          <p class="pop-status" [attr.data-tone]="s.tone">{{ s.text }}</p>
        }
        <div class="pop-actions">
          @for (a of p.actions; track a.key) {
            <button
              type="button"
              [class.on]="a.on"
              [disabled]="a.disabled !== null"
              [attr.aria-pressed]="p.kind === 'station' ? a.on : null"
              (click)="act(a.key)"
            >
              <span>{{ a.label }}</span>
              @if (a.disabled ?? a.hint; as hint) {
                <small>{{ hint }}</small>
              }
            </button>
          }
        </div>
        @if (p.kind === 'tram') {
          <p class="pop-foot text-muted-foreground">En pause le temps de choisir · Échap</p>
        }
      </div>
    }

    @if (mode() === 'demo') {
      <p class="demo-badge">
        Démo · régulateur automatique
        <button type="button" (click)="startPlay()">Prendre le service</button>
      </p>
    }

    @if (mode() === 'intro') {
      <section class="overlay" aria-labelledby="swarm-intro-title">
        <div class="card">
          <p class="text-sky font-display text-sm font-semibold">
            PC tram · Montpellier · {{ dayLabel }} · journée n° {{ nextSeed() }}
          </p>
          <h1 id="swarm-intro-title" class="font-display">Heure de pointe</h1>
          <p>
            Tu prends le poste de régulation des 5 lignes de tram de Montpellier, de 6 h à 0 h 30.
            Le réseau est gratuit pour les habitants de la Métropole, et ça se voit sur les quais.
          </p>
          <h2>Au programme</h2>
          <ul class="brief">
            @for (b of briefing(); track $index) {
              <li>{{ b }}</li>
            }
          </ul>
          <h2>Tes outils</h2>
          <ul class="brief">
            <li>
              <b>Le panneau des lignes</b> : sortir des rames du dépôt ou en rentrer, et
              l’itinéraire bis de la 1 par Les Aubes et Pompignane (aussi depuis Corum ou la
              Comédie).
            </li>
            <li>
              <b>Une station</b> : ne plus la desservir, y interrompre la circulation (les lignes
              sont coupées en tronçons), couper un tronçon bloqué.
            </li>
            <li>
              <b>Une rame</b> (le jeu se met en pause) : la retenir, lui faire faire demi-tour,
              l’envoyer haut-le-pied ou au dépôt.
            </li>
          </ul>
          <p class="text-muted-foreground text-sm">
            +1 point par voyageur arrivé, −3 par voyageur parti à pied, −1 au-delà de 10 minutes
            d’attente. Un fantôme joue la même journée, mêmes voyageurs, mêmes imprévus, au pilote
            automatique : fais mieux que lui. Un point sur la carte = 10 voyageurs.
          </p>
          <div class="actions">
            <button type="button" class="primary" (click)="startPlay()">Prendre le service</button>
            <button type="button" class="ghost" (click)="startDemo()">
              Voir la démo <kbd>T</kbd>
            </button>
          </div>
          <p class="source text-muted-foreground">
            Stations, couleurs, temps de parcours et rames en ligne : GTFS de la TaM, horaires réels
            du {{ gtfsDay }}. Déviation de la 1 et coupures en tronçons : comme la TaM les jours de
            manif ou de travaux. Les imprévus sont tirés au hasard.
          </p>
        </div>
      </section>
    }

    @if (mode() === 'report' && report(); as r) {
      <section class="overlay" aria-label="Bilan de la journée">
        <div class="card">
          <app-swarm-report
            [report]="r"
            [seed]="seed()"
            (replay)="newDay()"
            (retry)="startPlay(seed())"
            (demo)="startDemo()"
          />
        </div>
      </section>
    }

    @if (options.debug) {
      <p class="debug">{{ debugLine() }}</p>
    }
  `,
  styles: `
    .hud {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.55rem 0.7rem 0.65rem;
      background: rgb(11 8 48 / 0.9);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--border);
      z-index: 10;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.6rem 0.9rem;
      flex-wrap: wrap;
    }
    .kicker,
    .day,
    .keys,
    .legend,
    .counts {
      display: none;
    }
    .clock {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 1.55rem;
      font-weight: 700;
      line-height: 1;
      color: white;
    }
    .controls {
      display: flex;
      gap: 0.25rem;
    }
    .ctl {
      display: grid;
      place-items: center;
      min-width: 1.9rem;
      height: 1.9rem;
      padding: 0 0.4rem;
      border-radius: 0.45rem;
      border: 1px solid rgb(255 255 255 / 0.14);
      background: rgb(255 255 255 / 0.05);
      color: rgb(255 255 255 / 0.8);
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .ctl svg {
      width: 0.95rem;
      height: 0.95rem;
    }
    .ctl.on {
      background: var(--primary);
      border-color: transparent;
      color: white;
    }
    .score {
      margin-left: auto;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .pts {
      font-family: var(--font-display);
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1;
      color: white;
    }
    .pts small {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--muted-foreground);
    }
    .vs {
      font-size: 0.72rem;
      font-weight: 700;
    }
    .vs span {
      font-weight: 400;
    }
    .good {
      color: #6ee7a8;
    }
    .bad {
      color: #ffb3bb;
    }
    .counts {
      font-size: 0.68rem;
    }
    .lost {
      color: #ffb3bb;
    }
    .live {
      display: flex;
      gap: 0.35rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .live li {
      min-width: 0;
      max-width: 100%;
      flex-shrink: 0;
    }
    .live button {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      max-width: 100%;
      white-space: nowrap;
      padding: 0.2rem 0.55rem 0.2rem 0.4rem;
      border-radius: 9999px;
      border: 1px solid rgb(255 77 94 / 0.45);
      background: rgb(255 77 94 / 0.12);
      color: var(--card-foreground);
      font-size: 0.72rem;
      cursor: pointer;
    }
    .live button:disabled {
      cursor: default;
    }
    .live b {
      color: white;
    }
    .live .place {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--muted-foreground);
    }
    .depot {
      font-size: 0.75rem;
    }
    .feed {
      font-size: 0.75rem;
      line-height: 1.35;
    }
    .feed li {
      display: flex;
      gap: 0.45rem;
      color: var(--card-foreground);
    }
    .feed li:not(:first-child) {
      display: none;
    }
    .feed li span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .feed time {
      font-family: var(--font-mono);
      color: var(--muted-foreground);
      flex-shrink: 0;
    }
    .feed [data-tone='alert'] span {
      color: #ffc7a8;
    }
    .feed [data-tone='event'] span {
      color: var(--color-sky);
    }
    .feed [data-tone='joke'] span {
      color: var(--color-sakura);
    }

    /* Paysage large : panneau à gauche, fil complet, raccourcis clavier. */
    @container (min-aspect-ratio: 5/4) and (min-width: 820px) {
      .hud {
        top: 0;
        right: auto;
        width: 23rem;
        gap: 0.8rem;
        padding: 1.1rem 1rem;
        border-top: none;
        border-right: 1px solid var(--border);
        overflow-y: auto;
      }
      .top {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
      }
      .controls {
        grid-column: 1 / -1;
        grid-row: 2;
      }
      .kicker,
      .day,
      .counts {
        display: block;
      }
      .legend {
        display: inline;
      }
      .kicker {
        font-size: 0.8rem;
        font-weight: 600;
        margin-bottom: 0.2rem;
      }
      .day {
        font-size: 0.75rem;
        margin-top: 0.25rem;
      }
      .clock {
        font-size: 2.6rem;
      }
      .pts {
        font-size: 1.8rem;
      }
      .live {
        flex-wrap: wrap;
        overflow: visible;
      }
      .feed {
        display: grid;
        gap: 0.35rem;
        min-height: 0;
      }
      .feed li:not(:first-child) {
        display: flex;
        opacity: 0.75;
      }
      .feed li span {
        white-space: normal;
      }
      .keys {
        display: block;
        margin-top: auto;
        font-size: 0.68rem;
        line-height: 1.7;
      }
    }

    .tip {
      position: absolute;
      z-index: 20;
      min-width: 9rem;
      padding: 0.45rem 0.6rem;
      border-radius: 0.55rem;
      border: 1px solid rgb(255 255 255 / 0.15);
      background: rgb(14 10 53 / 0.95);
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--card-foreground);
      pointer-events: none;
      transform: translate(12px, -50%);
    }
    .tip-line {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-variant-numeric: tabular-nums;
    }
    .tip-hint {
      margin-top: 0.15rem;
      color: var(--muted-foreground);
      font-size: 0.68rem;
    }
    .badge {
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 0.25rem;
      font-size: 0.65rem;
      font-weight: 800;
    }

    .pop {
      position: absolute;
      z-index: 25;
      width: min(17.5rem, calc(100% - 16px));
      padding: 0.6rem 0.65rem 0.65rem;
      border-radius: 0.7rem;
      border: 1px solid rgb(255 255 255 / 0.16);
      background: rgb(14 10 53 / 0.97);
      box-shadow: 0 14px 40px rgb(0 0 0 / 0.5);
      color: var(--card-foreground);
      font-size: 0.78rem;
      line-height: 1.4;
    }
    .pop-head {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .pop-title {
      flex: 1;
      min-width: 0;
      margin-left: 0.15rem;
      color: white;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .close {
      display: grid;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 0.4rem;
      color: rgb(255 255 255 / 0.7);
      cursor: pointer;
    }
    .close:hover {
      background: rgb(255 255 255 / 0.08);
    }
    .close svg {
      width: 0.85rem;
      height: 0.85rem;
    }
    .pop-sub {
      margin-top: 0.15rem;
    }
    .pop-status {
      margin-top: 0.3rem;
      padding: 0.2rem 0.45rem;
      border-radius: 0.35rem;
      background: rgb(146 217 255 / 0.1);
      color: var(--color-sky);
    }
    .pop-status[data-tone='alert'] {
      background: rgb(255 77 94 / 0.13);
      color: #ffc7a8;
    }
    .pop-actions {
      display: grid;
      gap: 0.3rem;
      margin-top: 0.5rem;
    }
    .pop-actions button {
      display: grid;
      text-align: left;
      padding: 0.35rem 0.55rem;
      border-radius: 0.45rem;
      border: 1px solid rgb(255 255 255 / 0.14);
      background: rgb(255 255 255 / 0.05);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    .pop-actions button:hover:not(:disabled) {
      border-color: rgb(255 255 255 / 0.35);
    }
    .pop-actions button.on {
      border-color: transparent;
      background: var(--primary);
    }
    .pop-actions button:disabled {
      cursor: default;
      opacity: 0.45;
    }
    .pop-actions small {
      font-weight: 400;
      font-size: 0.7rem;
      color: rgb(255 255 255 / 0.65);
    }
    .pop-foot {
      margin-top: 0.45rem;
      font-size: 0.68rem;
    }

    .demo-badge {
      position: absolute;
      top: 0.7rem;
      right: 0.7rem;
      z-index: 15;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 0.4rem 0.35rem 0.75rem;
      border-radius: 9999px;
      background: rgb(14 10 53 / 0.85);
      border: 1px solid rgb(255 255 255 / 0.15);
      font-size: 0.75rem;
      color: var(--card-foreground);
    }
    .demo-badge button {
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: var(--primary);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    .overlay {
      position: absolute;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgb(8 6 30 / 0.45);
      overflow-y: auto;
    }
    .card {
      width: min(33rem, 100%);
      padding: 1.4rem 1.5rem;
      border-radius: 1rem;
      border: 1px solid rgb(255 255 255 / 0.12);
      background: rgb(14 10 53 / 0.92);
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgb(0 0 0 / 0.45);
      color: var(--card-foreground);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .card h1 {
      margin: 0.15rem 0 0.6rem;
      font-size: 2.2rem;
      line-height: 1.05;
      font-weight: 800;
      color: white;
    }
    .card h2 {
      margin-top: 0.8rem;
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-sky);
    }
    .card p + p {
      margin-top: 0.6rem;
    }
    .brief {
      margin-top: 0.25rem;
      display: grid;
      gap: 0.2rem;
      padding-left: 1.1rem;
      list-style: disc;
    }
    .brief b {
      color: white;
    }
    .brief + p {
      margin-top: 0.7rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1.1rem;
    }
    .actions button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 1rem;
      border-radius: 0.55rem;
      font-weight: 700;
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
    .source {
      margin-top: 1rem !important;
      font-size: 0.72rem;
    }
    kbd {
      display: inline-block;
      min-width: 1.4em;
      padding: 0 0.35em;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: rgb(255 255 255 / 0.08);
      color: var(--foreground);
      font-family: var(--font-mono);
      font-size: 0.9em;
      text-align: center;
    }
    .debug {
      position: absolute;
      top: 0.4rem;
      right: 0.6rem;
      z-index: 40;
      font-family: var(--font-mono);
      font-size: 11px;
      color: rgb(255 255 255 / 0.7);
    }
  `,
})
export default class Day07Swarm {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly hudRef = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly popRef = viewChild<ElementRef<HTMLElement>>('pop');
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly options = parseOptions(location.search);

  protected readonly dayLabel = CONFIG.day.label;
  protected readonly speedLabels = SPEED_LABELS;
  protected readonly gtfsDay = '7 octobre 2026';

  protected readonly mode = signal<Mode>('intro');
  protected readonly paused = signal(false);
  protected readonly speed = signal(0);
  protected readonly auto = signal(true);
  protected readonly sound = signal(false);
  protected readonly selected = signal<number | null>(null);
  /** La journée affichée, et celle que le briefing annonce (la prochaine partie). */
  protected readonly seed = signal(ATTRACT.seed);
  protected readonly nextSeed = signal(this.options.seed ?? randomSeed());
  protected readonly hud = signal<Hud>({
    time: CONFIG.day.start,
    rows: [],
    depot: 0,
    incoming: 0,
    served: 0,
    lost: 0,
    points: 0,
    ghost: 0,
    incidents: [],
  });
  protected readonly feed = signal<FeedItem[]>([]);
  protected readonly report = signal<Report | null>(null);
  protected readonly hoverInfo = signal<HoverInfo | null>(null);
  protected readonly pop = signal<Pop | null>(null);
  protected readonly popPos = signal({ left: 0, top: 0 });
  protected readonly cursor = signal('default');
  protected readonly debugLine = signal('');
  protected readonly clockText = computed(() => clock(this.hud().time));
  protected readonly delta = computed(() => this.hud().points - this.hud().ghost);
  protected readonly briefing = computed(() => briefingOf(this.nextSeed()));

  private duel!: Duel;
  private bot: Bot | null = null;
  private feedLog!: Feed;
  private renderer: Renderer | null = null;
  private swarm: Swarm | null = null;
  private readonly bell = new Bell();
  private hover: number | null = null;
  private target: Target | null = null;
  /** Le popover d'une rame a mis le jeu en pause (on reprend en le fermant). */
  private popPaused = false;
  private frame = 0;
  private last = 0;
  private acc = 0;
  private botClock = 0;
  private hudClock = 0;

  private get sim(): Sim {
    return this.duel.player;
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.bell.dispose();
    });

    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      const renderer = new Renderer(canvas, NET);
      this.renderer = renderer;
      this.swarm = new Swarm(NET, renderer);
      this.fit();
      const observer = new ResizeObserver(() => this.fit());
      observer.observe(this.host);
      observer.observe(this.hudRef().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());

      // `?debug` : la console (et les captures automatiques) peuvent viser une rame.
      if (this.options.debug) Object.assign(window, { day07: this });

      if (this.options.start !== null) this.startPlay(this.nextSeed(), this.options.start);
      else this.toIntro();

      const tick = (now: number) => {
        this.frame = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
        this.last = now;
        this.step(dt);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  // ------------------------------------------------------------ modes

  /** Une journée (joueur et fantôme), avancée sans rendu jusqu'à `start` au pilote automatique. */
  private load(seed: number, start: number, bot: boolean): void {
    this.closePop();
    this.seed.set(seed);
    this.duel = new Duel(NET, DEMAND, { seed, start, track: true });
    this.bot = bot ? responder(NET) : null;
    this.feedLog = new Feed(NET);
    this.feed.set([]);
    this.acc = 0;
    this.botClock = 0;
    this.swarm?.rebuild(this.sim);
    this.report.set(null);
    this.publish();
  }

  private toIntro(): void {
    this.mode.set('intro');
    this.auto.set(true);
    this.speed.set(ATTRACT.speed);
    this.paused.set(false);
    this.load(ATTRACT.seed, ATTRACT.start, true);
  }

  /** Après le bilan : une autre journée, annoncée par un nouveau briefing. */
  protected newDay(): void {
    this.nextSeed.set(this.options.seed ?? randomSeed());
    this.toIntro();
  }

  protected startPlay(seed: number = this.nextSeed(), start: number = CONFIG.day.start): void {
    this.mode.set('play');
    this.auto.set(false);
    this.speed.set(0);
    this.paused.set(false);
    this.selected.set(null);
    this.renderer?.select(null);
    this.load(seed, start, false);
  }

  protected startDemo(): void {
    this.mode.set('demo');
    this.auto.set(true);
    this.speed.set(DEMO.speed);
    this.paused.set(false);
    this.selected.set(null);
    this.renderer?.select(null);
    this.load(DEMO.seed, DEMO.start, true);
  }

  private endOfDay(): void {
    if (this.mode() !== 'play') {
      // L'accueil et la démo tournent en boucle.
      if (this.mode() === 'demo') this.startDemo();
      else this.toIntro();
      return;
    }
    this.closePop();
    this.mode.set('report');
    this.report.set(makeReport(this.duel));
    this.bell.ding();
  }

  // ------------------------------------------------------------ boucle

  private step(dt: number): void {
    const duel = this.duel;
    const renderer = this.renderer;
    const swarm = this.swarm;
    if (!duel || !renderer || !swarm) return;
    const sim = duel.player;

    if (this.mode() !== 'report' && !this.paused()) {
      this.acc += dt * CONFIG.speeds[this.speed()];
      let steps = Math.floor(this.acc / CONFIG.step);
      if (steps > CONFIG.maxStepsPerFrame) {
        steps = CONFIG.maxStepsPerFrame;
        this.acc = 0;
      } else {
        this.acc -= steps * CONFIG.step;
      }
      for (let i = 0; i < steps; i++) {
        duel.step(CONFIG.step, this.auto());
        if (this.bot) {
          this.botClock += CONFIG.step;
          if (this.botClock >= 1) {
            this.botClock = 0;
            this.bot.act(sim);
          }
        }
      }
    }

    this.readNotices();
    swarm.consume(sim.events);
    sim.events.length = 0;
    swarm.update(dt, sim.time);
    const tram = this.target?.kind === 'tram' ? (sim.findTram(this.target.id) ?? null) : null;
    const ring = this.target?.kind === 'station' ? this.target.id : this.hover;
    renderer.draw(sim, swarm, dt, ring, tram);

    if (sim.time >= CONFIG.day.end && this.mode() !== 'report') this.endOfDay();

    this.hudClock += dt;
    if (this.hudClock >= 0.1) {
      this.hudClock = 0;
      this.publish(dt);
    }
  }

  private readNotices(): void {
    const sim = this.sim;
    if (!sim.notices.length) return;
    for (const notice of sim.notices) {
      const item = this.feedLog.push(notice, sim.time);
      if (!item) continue;
      if (item.station !== undefined && item.tone !== 'info') {
        this.renderer?.ping(item.station, item.tone === 'event' ? '#92d9ff' : '#ff8a5c');
      }
      if (item.tone === 'event') this.bell.ding();
      else if (item.tone === 'alert' || item.tone === 'joke') this.bell.alert();
    }
    sim.notices.length = 0;
    this.feed.set(this.feedLog.items.slice(0, CONFIG.feed.keep));
  }

  /** Ce que le DOM affiche, environ 10 fois par seconde. */
  private publish(dt = 0): void {
    const sim = this.sim;
    const rows: LineRow[] = NET.lines.map((line) => {
      const st = sim.lineStatus(line);
      const dev = DEVIATIONS.find((d) => d.line === line.id);
      return {
        id: line.id,
        color: line.color,
        text: line.text,
        name: line.loop ? 'Circulaire · Garcia Lorca' : line.name.replace(' - ', ' ↔ '),
        active: st.active,
        incoming: st.incoming,
        retiring: st.retiring,
        waiting: st.waiting * CONFIG.riderSize,
        wait: st.wait,
        level: st.wait >= 10 ? 2 : st.wait >= 6 ? 1 : 0,
        deviation: dev ? { id: dev.id, label: dev.label, on: sim.plan.hasDeviation(dev.id) } : null,
      };
    });
    const s = sim.stats;
    this.hud.set({
      time: sim.time,
      rows,
      depot: sim.depot,
      incoming: sim.incoming.length,
      served: (s.arrived + s.walked) * CONFIG.riderSize,
      lost: s.abandoned * CONFIG.riderSize,
      points: sim.points,
      ghost: this.duel.ghost.points,
      incidents: this.active().map((inc) => this.chip(inc)),
    });
    this.updateHover();
    this.refreshPop();
    if (this.options.debug && dt > 0) {
      this.debugLine.set(
        `${Math.round(1 / Math.max(dt, 1e-3))} i/s · ${this.swarm?.size ?? 0} points · ${sim.waitingCount()} à quai · ${sim.trams.length} rames`,
      );
    }
  }

  private active(): ActiveIncident[] {
    const engine = this.sim.incidents;
    return engine instanceof IncidentEngine ? engine.active : [];
  }

  /** Où en est un imprévu, en une étiquette (et la station à ouvrir quand on clique dessus). */
  private chip(inc: ActiveIncident): IncidentChip {
    const s = inc.spec;
    const tram = inc.tram !== null ? this.sim.findTram(inc.tram) : undefined;
    let place = s.stations.length ? NAME(s.stations[0]) : '';
    let station: number | null = s.stations[0] ?? null;
    switch (s.kind) {
      case 'car':
        place = `${NAME(s.stations[0])} – ${NAME(s.stations[1])}`;
        break;
      case 'power':
        place = `${NAME(s.stations[0])} → ${NAME(s.stations[s.stations.length - 1])}`;
        break;
      case 'cortege': {
        station = this.cortegeHead(inc);
        place = NAME(station);
        break;
      }
      case 'rain':
        place = s.stations.length ? `${place} fermée` : 'tout le réseau';
        break;
      case 'strike':
        place = `${inc.withheld} rames retenues`;
        station = null;
        break;
      case 'illness':
      case 'breakdown':
        if (tram) station = tram.path.stations[tram.k];
        place = `L${s.line} · ${NAME(station!)}`;
        break;
    }
    return { id: s.id, glyph: GLYPHS[s.kind], title: s.title, place, station };
  }

  /** La station du parcours que la tête du cortège a atteinte. */
  private cortegeHead(inc: ActiveIncident): number {
    const engine = this.sim.incidents as IncidentEngine;
    const arc = engine.arc(inc.spec.id);
    let i = 0;
    while (i + 1 < arc.length && arc[i + 1] <= inc.head) i++;
    return inc.spec.stations[i];
  }

  private updateHover(): void {
    const s = this.hover;
    const r = this.renderer;
    if (s === null || !r) {
      if (this.hoverInfo()) this.hoverInfo.set(null);
      return;
    }
    const sim = this.sim;
    const station = NET.stations[s];
    const lists = sim.waiting[s];
    const x = Math.min(r.sx[s], this.host.clientWidth - 190);
    this.hoverInfo.set({
      x,
      y: Math.max(40, r.sy[s]),
      name: station.name,
      lines: station.lines.map((id) => {
        const line = LINE(id);
        const list = lists[NET.lines.indexOf(line)];
        const wait = list.reduce((sum, rider) => sum + (sim.time - rider.waitSince), 0);
        return {
          id,
          color: line.color,
          text: line.text,
          waiting: list.length * CONFIG.riderSize,
          wait: list.length ? wait / list.length : 0,
        };
      }),
      lost: sim.stats.abandonsBy[s] * CONFIG.riderSize,
      hint: this.mode() === 'play' ? 'Clic : desserte et circulation' : null,
    });
  }

  /** La carte occupe ce que le panneau laisse libre : à droite de lui en paysage, au-dessus en portrait. */
  private fit(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const host = this.host.getBoundingClientRect();
    const hud = this.hudRef().nativeElement.getBoundingClientRect();
    const side = hud.width < host.width * 0.6;
    const view = side
      ? { x: hud.right - host.left, y: 0, w: host.right - hud.right, h: host.height }
      : { x: 0, y: 0, w: host.width, h: hud.top - host.top };
    renderer.resize(host.width, host.height, Math.min(devicePixelRatio || 1, 2), view);
    if (this.duel) {
      this.swarm?.rebuild(this.sim);
      this.placePop();
    }
  }

  // ------------------------------------------------------------ popovers

  private open(target: Target): void {
    if (this.mode() !== 'play') return;
    if (this.target?.kind === target.kind && this.target.id === target.id) {
      this.closePop();
      return;
    }
    this.closePop();
    this.target = target;
    if (target.kind === 'tram' && !this.paused()) {
      this.paused.set(true);
      this.popPaused = true;
    }
    this.refreshPop();
    this.bell.click();
    afterNextRender(() => this.placePop(), { injector: this.injector });
  }

  protected closePop(): void {
    if (!this.target) return;
    this.target = null;
    this.pop.set(null);
    if (this.popPaused) {
      this.popPaused = false;
      this.paused.set(false);
    }
  }

  private refreshPop(): void {
    const t = this.target;
    if (!t || !this.duel) return;
    if (t.kind === 'station') {
      this.pop.set(this.stationPop(t.id));
    } else {
      const tram = this.sim.findTram(t.id);
      if (!tram) {
        this.closePop();
        return;
      }
      this.pop.set(this.tramPop(tram));
    }
    this.placePop();
  }

  /** À côté de la station ou de la rame, sans sortir de l'écran. */
  private placePop(): void {
    const t = this.target;
    const r = this.renderer;
    if (!t || !r) return;
    let x: number;
    let y: number;
    if (t.kind === 'station') {
      x = r.sx[t.id];
      y = r.sy[t.id];
    } else {
      const tram = this.sim.findTram(t.id);
      if (!tram) return;
      ({ x, y } = r.tramPoint(tram));
    }
    const el = this.popRef()?.nativeElement;
    const w = el?.offsetWidth ?? 280;
    const h = el?.offsetHeight ?? 220;
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    let left = x + 16;
    if (left + w > W - 8) left = x - 16 - w;
    left = Math.max(8, Math.min(left, W - w - 8));
    const top = Math.max(8, Math.min(y - 28, H - h - 8));
    const pos = this.popPos();
    if (pos.left !== left || pos.top !== top) this.popPos.set({ left, top });
  }

  private stationPop(s: number): Pop {
    const sim = this.sim;
    const st = sim.stationState(s);
    const station = NET.stations[s];
    const status: Pop['status'] = [];
    for (const inc of this.active()) {
      const text = this.incidentHere(inc, s);
      if (text) status.push({ text, tone: 'alert' });
    }
    if (st.frozen) status.push({ text: 'Courant coupé : rames figées', tone: 'alert' });
    else if (st.closed) status.push({ text: 'Quais évacués, aucune rame ne passe', tone: 'alert' });
    else if (st.obstructed)
      status.push({ text: 'Voie bloquée, aucune rame ne passe', tone: 'alert' });
    if (st.provisional.length) {
      status.push({
        text: `Terminus provisoire : L${st.provisional.join(', L')}`,
        tone: 'info',
      });
    }
    const crowd = sim.crowdAt(s) * CONFIG.riderSize;
    const actions: PopAction[] = [
      {
        key: 'skip',
        label: st.skipped ? 'Desservir à nouveau' : 'Ne plus desservir',
        hint: st.skipped
          ? 'Les rames passent sans s’arrêter'
          : 'Les rames passeront sans s’arrêter',
        on: st.skipped,
        disabled: st.cut ? 'Circulation interrompue' : null,
      },
      {
        key: 'cut',
        label: st.cut ? 'Rétablir la circulation' : 'Interrompre la circulation',
        hint: st.cut
          ? 'Les lignes sont coupées de part et d’autre'
          : 'Lignes coupées en tronçons, terminus provisoires',
        on: st.cut,
        disabled: null,
      },
    ];
    for (const { dev, stations } of DEVIATION_AT) {
      if (!stations.has(s)) continue;
      const on = sim.plan.hasDeviation(dev.id);
      actions.push({
        key: `dev:${dev.id}`,
        label: on
          ? `L${dev.line} : itinéraire normal`
          : `L${dev.line} : itinéraire bis ${dev.label}`,
        hint: on
          ? 'La 1 passe par Les Aubes et Pompignane'
          : 'Toute la ligne évite Comédie et la gare',
        on,
        disabled: null,
      });
    }
    for (const to of this.troubledEdges(s)) {
      const cut = sim.plan.isEdgeCut(s, to);
      actions.push({
        key: `edge:${to}`,
        label: cut ? `Rétablir vers ${NAME(to)}` : `Couper le tronçon vers ${NAME(to)}`,
        hint: cut ? 'Tronçon interrompu' : 'Les rames font demi-tour de chaque côté',
        on: cut,
        disabled: null,
      });
    }
    return {
      kind: 'station',
      title: station.name,
      sub: `${crowd} voyageur${crowd > 1 ? 's' : ''} à quai`,
      lines: station.lines.map((id) => LINE(id)),
      status,
      actions,
    };
  }

  /** Ce qu'un imprévu fait à cette station (ou rien). */
  private incidentHere(inc: ActiveIncident, s: number): string | null {
    const spec = inc.spec;
    const left = eta(spec.until - this.sim.time);
    switch (spec.kind) {
      case 'cortege':
        return inc.covered.includes(s) ? 'Manifestation : le cortège occupe la station' : null;
      case 'illness':
      case 'breakdown': {
        const tram = inc.tram !== null ? this.sim.findTram(inc.tram) : undefined;
        if (!tram || tram.immobile <= 0) return null;
        const ids = tram.path.stations;
        const here = ids[tram.k] === s || (tram.state === 'run' && ids[tram.k + 1] === s);
        return here ? `${spec.title} : rame immobilisée, ${eta(tram.immobile)}` : null;
      }
      case 'strike':
        return null;
      default:
        return spec.stations.includes(s) ? `${spec.title} : ${left}` : null;
    }
  }

  /** Les tronçons autour de cette station qui posent problème (voiture, rame en panne) ou déjà coupés. */
  private troubledEdges(s: number): number[] {
    const sim = this.sim;
    const out = new Set<number>();
    for (const to of NEIGHBOURS[s]) {
      if (sim.obstructions.blocksEdge(s, to) || sim.plan.isEdgeCut(s, to)) out.add(to);
    }
    for (const t of sim.trams) {
      if (t.immobile <= 0 || t.state !== 'run') continue;
      const ids = t.path.stations;
      const a = ids[t.k];
      const b = ids[(t.k + 1) % ids.length];
      if (a === s) out.add(b);
      else if (b === s) out.add(a);
    }
    return [...out];
  }

  private tramPop(t: Tram): Pop {
    const sim = this.sim;
    const ids = t.path.stations;
    const status: Pop['status'] = [];
    if (t.immobile > 0) {
      const why = t.cause === 'illness' ? 'malaise voyageur' : 'panne';
      status.push({ text: `Immobilisée (${why}), ${eta(t.immobile)}`, tone: 'alert' });
    }
    if (t.mode === 'deadhead') status.push({ text: 'Haut-le-pied : roule à vide', tone: 'info' });
    if (t.retire) status.push({ text: 'Rentre au dépôt après son terminus', tone: 'info' });
    if (t.holdUntil > sim.time)
      status.push({ text: `Retenue jusqu’à ${clock(t.holdUntil)}`, tone: 'info' });
    if (t.order) {
      const label = ORDERS[t.order.kind].label;
      status.push({ text: `Ordre en cours : ${label} (${NAME(t.order.at)})`, tone: 'info' });
    }
    if (t.path.deviation) status.push({ text: 'Déviée via Pompignane', tone: 'info' });
    if (!t.path.loop && t.path.provisional[1])
      status.push({ text: 'Tronçon : terminus provisoire', tone: 'info' });

    const possible = sim.tramActions(t);
    const kinds: TramOrderKind[] = ['hold', 'turnBack', 'deadhead', 'deviate', 'depot'];
    const actions: PopAction[] = kinds
      .filter((k) => k !== 'deviate' || DEVIATIONS.some((d) => d.line === t.line.id))
      .map((k) => {
        const check = possible[k];
        return {
          key: k,
          label: ORDERS[k].label,
          hint: ORDERS[k].hint(check.at !== undefined ? NAME(check.at) : ''),
          on: false,
          disabled: check.ok ? null : (check.reason ?? 'Impossible'),
        };
      });
    const riders = t.riders.length * CONFIG.riderSize;
    const dest = t.path.loop ? 'circulaire' : `vers ${NAME(ids[ids.length - 1])}`;
    return {
      kind: 'tram',
      title: `Rame ${t.id}`,
      sub: `${dest} · ${riders} à bord`,
      lines: [LINE(t.line.id)],
      status,
      actions,
    };
  }

  protected act(key: string): void {
    const t = this.target;
    if (!t || this.mode() !== 'play') return;
    const sim = this.sim;
    if (t.kind === 'tram') {
      const result = sim.order(t.id, key as TramOrderKind);
      this.bell.click();
      if (result.ok) {
        this.closePop();
        this.readNotices();
      } else {
        this.refreshPop();
      }
      return;
    }
    const st = sim.stationState(t.id);
    if (key === 'skip') sim.setSkip(t.id, !st.skipped);
    else if (key === 'cut') sim.setCut(t.id, !st.cut);
    else if (key.startsWith('dev:')) {
      const id = key.slice(4);
      sim.setDeviation(id, !sim.plan.hasDeviation(id));
    } else if (key.startsWith('edge:')) {
      const to = Number(key.slice(5));
      sim.setCutEdge(t.id, to, !sim.plan.isEdgeCut(t.id, to));
    }
    this.bell.click();
    this.readNotices();
    this.refreshPop();
  }

  protected focusIncident(c: IncidentChip): void {
    if (c.station === null) return;
    if (this.mode() !== 'play') return;
    this.open({ kind: 'station', id: c.station });
  }

  // ------------------------------------------------------------ commandes

  protected select(line: number): void {
    const next = this.selected() === line ? null : line;
    this.selected.set(next);
    this.renderer?.select(next);
    this.bell.click();
  }

  protected addRame(line: number): void {
    if (this.mode() === 'report') return;
    this.takeOver();
    this.sim.addRame(line);
    this.bell.click();
    this.publish();
  }

  protected removeRame(line: number): void {
    if (this.mode() === 'report') return;
    this.takeOver();
    this.sim.removeRame(line);
    this.bell.click();
    this.publish();
  }

  protected toggleDeviation(id: string): void {
    if (this.mode() === 'report') return;
    this.takeOver();
    this.sim.setDeviation(id, !this.sim.plan.hasDeviation(id));
    this.bell.click();
    this.readNotices();
    this.publish();
  }

  /** Toucher aux commandes pendant l'accueil ou la démo : on prend le service tout de suite. */
  private takeOver(): void {
    if (this.mode() === 'intro' || this.mode() === 'demo') this.startPlay();
    else if (this.auto()) this.auto.set(false);
  }

  protected togglePause(): void {
    this.popPaused = false;
    this.paused.update((p) => !p);
  }

  protected setSpeed(i: number): void {
    this.speed.set(i);
    this.popPaused = false;
    this.paused.set(false);
  }

  protected toggleAuto(): void {
    this.auto.update((a) => !a);
  }

  protected toggleSound(): void {
    if (this.sound()) {
      this.bell.disable();
      this.sound.set(false);
      return;
    }
    this.sound.set(true);
    void this.bell.enable().then(() => this.bell.ding());
  }

  protected format(minute: number): string {
    return clock(minute);
  }

  // ------------------------------------------------------------ pointeur, clavier, onglet

  /** Ce qu'il y a sous le pointeur : la rame si elle est plus proche que la station. */
  private pick(event: PointerEvent): Target | null {
    const r = this.renderer;
    if (!r || !this.duel) return null;
    const rect = this.host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const station = r.stationAt(x, y);
    const tram = r.tramAt(x, y, this.sim.trams);
    if (tram) {
      const p = r.tramPoint(tram);
      const dt = (p.x - x) ** 2 + (p.y - y) ** 2;
      const ds = station === null ? Infinity : (r.sx[station] - x) ** 2 + (r.sy[station] - y) ** 2;
      if (dt <= ds) return { kind: 'tram', id: tram.id };
    }
    return station === null ? null : { kind: 'station', id: station };
  }

  protected onPointerMove(event: PointerEvent): void {
    const target = this.pick(event);
    const station = target?.kind === 'station' ? target.id : null;
    if (station !== this.hover) {
      this.hover = station;
      this.updateHover();
    }
    const cursor = target && this.mode() === 'play' ? 'pointer' : 'default';
    if (cursor !== this.cursor()) this.cursor.set(cursor);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.onPointerMove(event);
    const target = this.pick(event);
    if (target) this.open(target);
    else this.closePop();
  }

  protected clearHover(): void {
    this.hover = null;
    this.updateHover();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Escape' && this.target) {
      this.closePop();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
    if ((event.code === 'Space' || event.code === 'Enter') && target?.closest('button')) return;
    const code = event.code;
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (digit) {
      this.select(Number(digit[1]));
      return;
    }
    const line = this.selected();
    if (code === 'ArrowUp' || event.key === '+' || code === 'NumpadAdd') {
      if (line === null) return;
      event.preventDefault();
      this.addRame(line);
      return;
    }
    if (code === 'ArrowDown' || event.key === '-' || code === 'NumpadSubtract') {
      if (line === null) return;
      event.preventDefault();
      this.removeRame(line);
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      event.preventDefault();
      const ids = NET.lines.map((l) => l.id);
      const dir = code === 'ArrowRight' ? 1 : -1;
      const next =
        line === null
          ? dir > 0
            ? 0
            : ids.length - 1
          : (ids.indexOf(line) + dir + ids.length) % ids.length;
      this.select(ids[next]);
      return;
    }
    if (event.repeat) return;
    switch (code) {
      case 'Space':
        event.preventDefault();
        if (this.mode() === 'report') return;
        this.togglePause();
        break;
      case 'Enter':
        if (this.mode() === 'intro' || this.mode() === 'report') this.startPlay();
        break;
      case 'KeyF':
        this.setSpeed((this.speed() + 1) % CONFIG.speeds.length);
        break;
      case 'KeyA':
        if (this.mode() === 'play') this.toggleAuto();
        break;
      case 'KeyT':
        this.startDemo();
        break;
      case 'KeyM':
        this.toggleSound();
        break;
      case 'KeyR':
        this.startPlay(this.mode() === 'play' ? this.seed() : this.nextSeed());
        break;
      case 'Escape':
        if (this.selected() !== null) this.select(this.selected()!);
        else if (this.mode() === 'demo') this.toIntro();
        break;
    }
  }

  protected onVisibility(): void {
    this.last = 0;
    this.bell.setHidden(document.hidden);
  }
}

/** Le briefing de 6 h : ce que le PC sait le matin (grève, manif déclarée, météo, soirée). */
function briefingOf(seed: number): string[] {
  const day = drawDay(NET, seed);
  const out: string[] = [];
  for (const s of day.incidents) {
    if (s.kind === 'strike') {
      out.push(`Grève jusqu’à 10 h : ${s.params.withhold} rames de moins au dépôt.`);
    } else if (s.kind === 'cortege') {
      out.push(
        `Manifestation déclarée à ${hhmm(s.at)} : départ de la Comédie, tour de l’Écusson au pas.`,
      );
    } else if (s.kind === 'rain') {
      out.push('Météo : risque d’épisode méditerranéen dans la journée.');
    }
  }
  out.push(
    day.evening === 'match'
      ? 'Ce soir : match à 20 h au stade de la Mosson (lignes 1 et 3).'
      : 'Ce soir : concert à 20 h 30 à la Sud de France Arena (ligne 3, branche Pérols).',
  );
  out.push('Et quelques imprévus que personne n’a vus venir.');
  return out;
}
